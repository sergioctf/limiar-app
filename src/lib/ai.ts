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

import type { Run, WeeklyPlanData, WeeklyPlanDay, PlanChatMessage } from "@/types";
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

/** Call Groq and return raw text */
async function callGroq(systemPrompt: string, userPrompt: string, maxTokens = 600): Promise<string | null> {
  // Strip BOM (U+FEFF, charCode 65279) and whitespace — PowerShell pipe introduces these invisibly
  const rawKey = process.env.GROQ_API_KEY ?? "";
  const apiKey = (rawKey.charCodeAt(0) === 65279 ? rawKey.slice(1) : rawKey).trim() || undefined;
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
        max_tokens: maxTokens,
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
  weeksToGoal?: number,
  weekActivities?: Array<{name: string; sport_type: string; date: string; duration_seconds: number | null; calories: number | null}>
): Promise<string | null> {
  if (weekRuns.length === 0) return null;

  const systemPrompt = `
Você é um treinador de corrida com acesso ao HISTÓRICO COMPLETO do atleta.
Você tem acesso a treinos de corrida E treinos de força/academia do atleta. Considere a fadiga acumulada de ambos ao fazer recomendações.
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

  const gymBlock = weekActivities && weekActivities.length > 0
    ? `\nTREINOS DE FORÇA/ACADEMIA ESTA SEMANA (${weekActivities.length} sessões):\n${weekActivities.map(a =>
        `${a.date}: ${a.name} (${a.sport_type}) — ${a.duration_seconds ? Math.round(a.duration_seconds / 60) + "min" : "duração n/d"}${a.calories ? " / " + a.calories + " kcal" : ""}`
      ).join("\n")}`
    : "";

  const userPrompt = `
${goalContext}

SEMANA ATUAL — ${weekRuns.length} corridas:
${weekRuns.map(fmtRun).join("\n")}
Totais: ${totalKm.toFixed(1)} km | ${secondsToReadable(totalTime)}${avgHR ? ` | FC média ${avgHR} bpm` : ""}${gymBlock}

HISTÓRICO COMPLETO DO ATLETA (${history.length} corridas anteriores, mais antigas primeiro):
${history.map(fmtRun).join("\n")}
`.trim();

  return callGroq(systemPrompt, userPrompt);
}

// ─── Structured weekly plan ───────────────────────────────────────────────────

const DAY_ORDER: WeeklyPlanDay["day"][] = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

/**
 * Gera um plano semanal estruturado (JSON) com 7 dias.
 * Retorna WeeklyPlanData ou null se GROQ_API_KEY não estiver configurada.
 */
export async function generateStructuredWeeklyPlan(
  weekStart: string,
  recentRuns: Run[],
  paces?: { easy?: string; threshold?: string; long?: string; interval?: string } | null,
  nextRace?: { name: string; date: string; distance_km: number } | null,
  vdot?: number | null,
): Promise<WeeklyPlanData | null> {
  const systemPrompt = `
Você é um treinador de corrida especialista. Gere um plano semanal de treino estruturado para um corredor brasileiro.
RESPONDA SOMENTE com um objeto JSON válido — sem texto antes nem depois, sem markdown, sem código fence.

Formato JSON obrigatório:
{
  "days": [
    {
      "day": "Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun",
      "dayPt": "Segunda"|"Terça"|"Quarta"|"Quinta"|"Sexta"|"Sábado"|"Domingo",
      "type": "rest"|"easy"|"tempo"|"intervals"|"long_run"|"recovery"|"test"|"race",
      "label": string (ex: "Rodagem", "Tiro 400m", "Longão", "Descanso"),
      "distance_km": number | null,
      "duration_min": number | null,
      "pace": string | null (ex: "6:00–6:20/km"),
      "description": string (1-2 frases descritivas e práticas)
    }
  ],
  "ai_message": string (1-2 frases proativas: observação sobre o histórico ou pergunta para engajar o atleta)
}

Regras:
- Inclua TODOS os 7 dias (Mon a Sun)
- Estrutura base: 3 corridas/semana + 4 dias descanso/cross
- Se houver dados de pace, use-os nas prescrições
- Se houver prova próxima, adapte o volume e intensidade
- Se não souber o pace, use referências por RPE (esforço percebido)
- ai_message deve ser específica e baseada nos dados reais do atleta
`.trim();

  const recent = recentRuns.slice(0, 10).sort((a,b) => b.date.localeCompare(a.date));
  const historyStr = recent.length > 0
    ? `Corridas recentes (${recent.length}):\n${recent.map(fmtRun).join("\n")}`
    : "Sem corridas recentes registradas.";

  const pacesStr = paces
    ? `Paces de treino:\n${Object.entries(paces).filter(([,v])=>v).map(([k,v])=>`  ${k}: ${v}`).join("\n")}`
    : "";

  const raceStr = nextRace
    ? `Próxima prova: ${nextRace.name} — ${nextRace.distance_km}km em ${nextRace.date}`
    : "";

  const vdotStr = vdot ? `VDOT atual: ${vdot.toFixed(1)}` : "";

  const userPrompt = `
Semana de ${weekStart}.
${vdotStr}
${raceStr}
${pacesStr}
${historyStr}

Gere o plano semanal em JSON conforme o formato especificado.
`.trim();

  const raw = await callGroq(systemPrompt, userPrompt, 1200);
  if (!raw) return null;

  try {
    // Strip markdown code fences if model wrapped anyway
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as { days: WeeklyPlanDay[]; ai_message?: string };

    // Validate days and sort Mon→Sun
    const days = (parsed.days ?? []).sort(
      (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day)
    );

    return {
      week_start: weekStart,
      days,
      ai_message: parsed.ai_message,
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[AI] Failed to parse weekly plan JSON:", err, "\nRaw:", raw);
    return null;
  }
}

/**
 * Processa feedback do atleta sobre o plano e retorna plano atualizado ou resposta de chat.
 */
export async function processPlanFeedback(
  userMessage: string,
  currentPlan: WeeklyPlanData,
  chatHistory: PlanChatMessage[],
  recentRuns: Run[],
): Promise<{ updatedPlan: WeeklyPlanData | null; assistantMessage: string } | null> {
  const systemPrompt = `
Você é um treinador de corrida interativo. O atleta tem um plano semanal e pode pedir ajustes.
RESPONDA SOMENTE com um objeto JSON válido — sem texto antes nem depois, sem markdown.

Se o atleta pedir mudança no plano, retorne:
{"action":"update","updatedPlan":{...plano completo com todos os 7 dias...},"message":"Explicação breve da mudança"}

Se for uma pergunta ou conversa sem mudança no plano, retorne:
{"action":"reply","message":"Sua resposta em português"}

O plano deve sempre ter todos os 7 dias no formato WeeklyPlanDay.
`.trim();

  const planStr = JSON.stringify(currentPlan.days.map(d => ({
    day: d.day, type: d.type, label: d.label,
    distance_km: d.distance_km, pace: d.pace, description: d.description
  })));

  const historyStr = chatHistory.slice(-6).map(m => `${m.role === "user" ? "Atleta" : "Treinador"}: ${m.content}`).join("\n");

  const recentStr = recentRuns.slice(0, 5).map(fmtRun).join("\n");

  const userPrompt = `
PLANO ATUAL:
${planStr}

CORRIDAS RECENTES:
${recentStr}

HISTÓRICO DA CONVERSA:
${historyStr}

MENSAGEM DO ATLETA: ${userMessage}
`.trim();

  const raw = await callGroq(systemPrompt, userPrompt, 1500);
  if (!raw) return null;

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as
      | { action: "update"; updatedPlan: { days: WeeklyPlanDay[] }; message: string }
      | { action: "reply"; message: string };

    if (parsed.action === "update" && parsed.updatedPlan?.days) {
      const days = parsed.updatedPlan.days.sort(
        (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day)
      );
      const updatedPlan: WeeklyPlanData = {
        ...currentPlan,
        days,
        generated_at: new Date().toISOString(),
      };
      return { updatedPlan, assistantMessage: parsed.message };
    }

    return { updatedPlan: null, assistantMessage: parsed.message };
  } catch (err) {
    console.error("[AI] Failed to parse plan feedback JSON:", err, "\nRaw:", raw);
    return null;
  }
}
