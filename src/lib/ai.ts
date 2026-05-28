/**
 * Limiar AI — análise de corridas via Groq (Llama 3.3 70B)
 * Sem dependências extras: usa fetch nativo.
 * API 100% compatível com OpenAI — só muda URL + chave.
 *
 * GROQ_API_KEY deve estar nas env vars.
 * Se a chave não estiver configurada, todas as funções retornam null silenciosamente.
 *
 * Contexto: mandamos TODAS as corridas do histórico — o modelo tem janela de 128k tokens,
 * o que comporta centenas de corridas confortavelmente.
 */

import type { Run } from "@/types";
import { secondsToPaceString, secondsToReadable } from "@/lib/utils";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtRun(r: Run): string {
  const pace  = r.avg_pace_seconds_per_km
    ? secondsToPaceString(r.avg_pace_seconds_per_km) + "/km"
    : "—";
  const hr    = r.avg_hr    ? ` FC ${r.avg_hr} bpm`    : "";
  const maxHr = r.max_hr    ? ` (máx ${r.max_hr})`     : "";
  const elev  = r.elevation_gain_m ? ` ↑${r.elevation_gain_m}m` : "";
  const cad   = r.avg_cadence ? ` cad ${r.avg_cadence}` : "";
  const notes = r.notes     ? ` | nota: "${r.notes}"`  : "";
  const dur   = secondsToReadable(r.duration_seconds);
  return `${r.date}: ${r.distance_km.toFixed(2)} km | ${dur} | ${pace}${hr}${maxHr}${elev}${cad} [${r.type}]${notes}`.trim();
}

async function callGroq(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[AI] GROQ_API_KEY not set — skipping AI analysis");
    return null;
  }

  try {
    const res = await fetch(GROQ_API_URL, {
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
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      console.error("[AI] Groq error:", res.status, await res.text());
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
 * Analisa uma corrida individual com TODO o histórico do atleta como contexto.
 * Retorna o feedback em português (3-5 parágrafos).
 * Retorna null se GROQ_API_KEY não estiver configurada ou em caso de erro.
 */
export async function analyzeRun(
  run: Run,
  allRuns: Run[] = []
): Promise<string | null> {
  const systemPrompt = `
Você é um treinador de corrida experiente, analítico e direto, trabalhando com um corredor intermediário brasileiro.
Você tem acesso ao HISTÓRICO COMPLETO de corridas do atleta — use isso para identificar padrões, regressões e evoluções reais.
Fale em português brasileiro, tom direto e motivador (nunca genérico).
Responda em 3-5 parágrafos curtos. Sem introdução formal, vá direto ao ponto.
Foque em: qualidade do esforço desta corrida, comparação com corridas similares do histórico, tendência de evolução, um ponto de atenção e uma recomendação prática e específica.
`.trim();

  const runDetails = [
    `Nome: ${run.name}`,
    `Data: ${run.date}`,
    `Tipo: ${run.type}`,
    `Distância: ${run.distance_km.toFixed(2)} km`,
    `Duração: ${secondsToReadable(run.duration_seconds)}`,
    run.avg_pace_seconds_per_km
      ? `Pace médio: ${secondsToPaceString(run.avg_pace_seconds_per_km)}/km`
      : null,
    run.avg_hr         ? `FC média: ${run.avg_hr} bpm`          : null,
    run.max_hr         ? `FC máxima: ${run.max_hr} bpm`          : null,
    run.elevation_gain_m ? `Elevação: ${run.elevation_gain_m}m` : null,
    run.avg_cadence    ? `Cadência: ${run.avg_cadence} ppm`      : null,
    run.calories       ? `Calorias: ${run.calories} kcal`        : null,
    run.perceived_effort ? `Esforço percebido: ${run.perceived_effort}/10` : null,
    run.conditions     ? `Condições: ${run.conditions}`          : null,
    run.notes          ? `Notas: ${run.notes}`                   : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Histórico completo ordenado do mais antigo para o mais recente (exceto a corrida atual)
  const history = allRuns
    .filter((r) => r.id !== run.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const historyBlock = history.length > 0
    ? `\n\nHistórico completo do atleta (${history.length} corridas, mais antigas primeiro):\n${history.map(fmtRun).join("\n")}`
    : "";

  const userPrompt = `Analise esta corrida:\n${runDetails}${historyBlock}`;

  return callGroq(systemPrompt, userPrompt);
}

// ─── Weekly summary ──────────────────────────────────────────────────────────

/**
 * Gera um resumo semanal inteligente com recomendações para a próxima semana.
 * Recebe TODAS as corridas do atleta para contexto completo.
 */
export async function generateWeeklySummary(
  weekRuns: Run[],
  allRuns: Run[],
  goalName?: string,
  weeksToGoal?: number
): Promise<string | null> {
  if (weekRuns.length === 0) return null;

  const systemPrompt = `
Você é um treinador de corrida com acesso ao HISTÓRICO COMPLETO do atleta.
Faça um resumo semanal de treinos em português brasileiro.
Tom: direto, preciso, motivador — baseie-se em dados reais do histórico, não em frases genéricas.
Estrutura: 1) balanço da semana vs histórico, 2) tendência de evolução identificada, 3) ponto de atenção específico, 4) plano concreto para a próxima semana.
`.trim();

  const totalKm   = weekRuns.reduce((s, r) => s + r.distance_km, 0);
  const totalTime = weekRuns.reduce((s, r) => s + r.duration_seconds, 0);
  const hrRuns    = weekRuns.filter((r) => r.avg_hr);
  const avgHR     = hrRuns.length
    ? Math.round(hrRuns.reduce((s, r) => s + (r.avg_hr ?? 0), 0) / hrRuns.length)
    : null;

  const goalContext = goalName
    ? `Meta ativa: ${goalName}${weeksToGoal != null ? ` — ${weeksToGoal} semanas restantes` : ""}.`
    : "";

  // Histórico completo excluindo corridas desta semana
  const weekIds = new Set(weekRuns.map((r) => r.id));
  const history = allRuns
    .filter((r) => !weekIds.has(r.id))
    .sort((a, b) => a.date.localeCompare(b.date));

  const userPrompt = `
${goalContext}

SEMANA ATUAL — ${weekRuns.length} corridas:
${weekRuns.map(fmtRun).join("\n")}
Totais: ${totalKm.toFixed(1)} km | ${secondsToReadable(totalTime)}${avgHR ? ` | FC média ${avgHR} bpm` : ""}

HISTÓRICO COMPLETO DO ATLETA (${history.length} corridas anteriores, mais antigas primeiro):
${history.map(fmtRun).join("\n")}
`.trim();

  return callGroq(systemPrompt, userPrompt);
}
