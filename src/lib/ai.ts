/**
 * Limiar AI — análise de corridas via OpenAI GPT-4o-mini
 * Sem dependências extras: usa fetch nativo.
 *
 * OPENAI_API_KEY deve estar nas env vars.
 * Se a chave não estiver configurada, todas as funções retornam null silenciosamente.
 */

import type { Run } from "@/types";
import { secondsToPaceString, secondsToReadable } from "@/lib/utils";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtRun(r: Run): string {
  const pace  = r.avg_pace_seconds_per_km
    ? secondsToPaceString(r.avg_pace_seconds_per_km) + "/km"
    : "—";
  const hr    = r.avg_hr ? `FC ${r.avg_hr} bpm` : "";
  const elev  = r.elevation_gain_m ? `↑${r.elevation_gain_m}m` : "";
  const dur   = secondsToReadable(r.duration_seconds);
  return `${r.date}: ${r.distance_km.toFixed(1)} km | ${dur} | ${pace} ${hr} ${elev} [${r.type}]`.trim();
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   },
        ],
        max_tokens: 350,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      console.error("[AI] OpenAI error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return (data.choices?.[0]?.message?.content as string | undefined)?.trim() ?? null;
  } catch (err) {
    console.error("[AI] Fetch error:", err);
    return null;
  }
}

// ─── Run analysis ────────────────────────────────────────────────────────────

/**
 * Analisa uma corrida individual com contexto das corridas recentes.
 * Retorna o feedback em português (2-4 parágrafos curtos).
 * Retorna null se OPENAI_API_KEY não estiver configurada ou em caso de erro.
 */
export async function analyzeRun(
  run: Run,
  recentRuns: Run[] = []
): Promise<string | null> {
  const systemPrompt = `
Você é um treinador de corrida experiente e direto, analisando os treinos de um corredor intermediário.
Fale em português brasileiro, tom direto e motivador (não genérico).
Responda em 2-4 parágrafos curtos. Sem introdução formal, vá direto ao ponto.
Foque em: qualidade do esforço, tendência de evolução, um ponto de atenção e uma recomendação prática.
`.trim();

  const contextBlock = recentRuns.length > 0
    ? `\nCorridas recentes (contexto):\n${recentRuns.slice(0, 7).map(fmtRun).join("\n")}`
    : "";

  const runDetails = [
    `Nome: ${run.name}`,
    `Data: ${run.date}`,
    `Tipo: ${run.type}`,
    `Distância: ${run.distance_km.toFixed(2)} km`,
    `Duração: ${secondsToReadable(run.duration_seconds)}`,
    run.avg_pace_seconds_per_km
      ? `Pace médio: ${secondsToPaceString(run.avg_pace_seconds_per_km)}/km`
      : null,
    run.avg_hr    ? `FC média: ${run.avg_hr} bpm`       : null,
    run.max_hr    ? `FC máxima: ${run.max_hr} bpm`       : null,
    run.elevation_gain_m ? `Elevação: ${run.elevation_gain_m}m` : null,
    run.conditions ? `Condições: ${run.conditions}`     : null,
    run.notes     ? `Notas: ${run.notes}`               : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = `Analise essa corrida:\n${runDetails}${contextBlock}`;

  return callOpenAI(systemPrompt, userPrompt);
}

// ─── Weekly summary ──────────────────────────────────────────────────────────

/**
 * Gera um resumo semanal inteligente com recomendações para a próxima semana.
 * Ideal para enviar toda segunda-feira.
 */
export async function generateWeeklySummary(
  weekRuns: Run[],
  allRecentRuns: Run[],
  goalName?: string,
  weeksToGoal?: number
): Promise<string | null> {
  if (weekRuns.length === 0) return null;

  const systemPrompt = `
Você é um treinador de corrida. Faça um resumo semanal de treinos em português brasileiro.
Tom: direto, preciso, motivador. Máximo 4 parágrafos.
Inclua: balanço da semana, tendência de evolução, ponto de atenção e plano sugerido para a próxima semana.
`.trim();

  const totalKm    = weekRuns.reduce((s, r) => s + r.distance_km, 0);
  const totalTime  = weekRuns.reduce((s, r) => s + r.duration_seconds, 0);
  const avgHR      = weekRuns.filter((r) => r.avg_hr).reduce((s, r) => s + (r.avg_hr ?? 0), 0)
    / (weekRuns.filter((r) => r.avg_hr).length || 1);

  const goalContext = goalName
    ? `Meta ativa: ${goalName}${weeksToGoal != null ? ` (${weeksToGoal} semanas restantes)` : ""}.`
    : "";

  const userPrompt = `
${goalContext}
Semana com ${weekRuns.length} corridas:
${weekRuns.map(fmtRun).join("\n")}

Totais: ${totalKm.toFixed(1)} km | ${secondsToReadable(totalTime)} | FC média ${Math.round(avgHR) || "—"} bpm

Contexto recente (últimas semanas):
${allRecentRuns.slice(0, 10).map(fmtRun).join("\n")}
`.trim();

  return callOpenAI(systemPrompt, userPrompt);
}
