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

import type { Run, WeeklyPlanData, WeeklyPlanDay, PlanDayType, StructuredWorkout, PlanChatMessage, AthleteNoteCategory, MacroPlanData, MacroPlanWeek, MacroRaceType } from "@/types";
import { secondsToPaceString, secondsToReadable } from "@/lib/utils";
import { SPORTS, ALL_SPORTS, DEFAULT_SPORTS, toSportKey, type SportKey, type PrimarySport } from "@/lib/sports";
import { normalizePlanEdits, applyPlanEdits } from "@/lib/plan-edit";

export const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * The model behind every narrative in the app.
 *
 * Was `llama-3.3-70b-versatile` until Groq retired it on 16 August 2026. The
 * replacement was chosen by testing the two Groq recommended against the two
 * things this codebase actually needs:
 *
 *   • JSON that parses. Eight call sites here take the model's answer, strip
 *     the code fences and `JSON.parse` it. `qwen/qwen3.6-27b` writes its
 *     deliberation as a `<think>` block *inside* `content`, so every one of
 *     those would have fallen into its catch and the feature would have gone
 *     quiet rather than broken loudly. It was rejected for that.
 *   • Portuguese that reads like a coach.
 *
 * `openai/gpt-oss-120b` does both, in roughly half the latency, and it returns
 * its reasoning in a separate `reasoning` field instead of contaminating the
 * answer.
 *
 * Overridable by env so the next retirement is a redeploy, not a patch.
 */
export const MODEL = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

/**
 * Reasoning is billed against `max_tokens` and then thrown away.
 *
 * At the default effort the model spent 198 of a 200-token budget thinking and
 * returned three characters. These are short coaching notes, not proofs — the
 * budget belongs to the answer.
 */
export const REASONING_EFFORT = "low";

/**
 * Models that do *not* reason reject `reasoning_effort` outright:
 *
 *   POST … → 400 {"error":{"message":"`reasoning_effort` is not supported
 *                            with this model","type":"invalid_request_error"}}
 *
 * Since MODEL is overridable by env and `callGroq` swallows failures into
 * `null`, pointing GROQ_MODEL at a non-reasoning model would take every AI
 * feature in the app silently offline. So the parameter is sent only where it
 * is understood.
 *
 * Unknown models are treated as non-reasoning on purpose: the cost of omitting
 * it is a slightly larger reasoning budget, while the cost of sending it to a
 * model that refuses it is total, silent failure.
 */
export function supportsReasoningEffort(model = MODEL): boolean {
  return /^(openai\/gpt-oss|qwen\/qwen3|deepseek-r1)/i.test(model.trim());
}

/** The request body every Groq call in the app shares. */
export function groqBody(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens: number; temperature: number },
): string {
  return JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt   },
    ],
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    ...(supportsReasoningEffort() ? { reasoning_effort: REASONING_EFFORT } : {}),
  });
}

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

/**
 * O resultado detalhado de uma chamada, para quem precisa distinguir "falhou"
 * de "falhou porque você perguntou rápido demais".
 *
 * O plano gratuito da Groq tem teto por minuto (8.000 tokens, medido em
 * 20/09/2026) e o dossiê da IA central é grande: três perguntas seguidas já
 * batem nele. Quem chama precisa poder dizer ao atleta quantos segundos
 * esperar, em vez de "tente de novo".
 */
export type GroqResult =
  | { ok: true; text: string }
  | { ok: false; reason: "no_key" | "rate_limit" | "error"; retryAfterSec?: number };

/** Quantos segundos a Groq pediu para esperar, quando ela diz. */
function retryAfterFrom(body: string): number | undefined {
  const m = body.match(/try again in ([\d.]+)s/i);
  return m ? Math.ceil(Number(m[1])) : undefined;
}

export async function callGroqDetailed(
  systemPrompt: string, userPrompt: string, maxTokens = 600, temperature = 0.7,
): Promise<GroqResult> {
  const rawKey = process.env.GROQ_API_KEY ?? "";
  const apiKey = (rawKey.charCodeAt(0) === 65279 ? rawKey.slice(1) : rawKey).trim() || undefined;
  if (!apiKey) return { ok: false, reason: "no_key" };

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: groqBody(systemPrompt, userPrompt, { maxTokens, temperature }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) {
        return { ok: false, reason: "rate_limit", retryAfterSec: retryAfterFrom(body) };
      }
      console.error("[AI] Groq error:", res.status, body);
      return { ok: false, reason: "error" };
    }

    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content as string | undefined)?.trim();
    return text ? { ok: true, text } : { ok: false, reason: "error" };
  } catch (err) {
    console.error("[AI] Fetch error:", err);
    return { ok: false, reason: "error" };
  }
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
      body: groqBody(systemPrompt, userPrompt, { maxTokens, temperature: 0.7 }),
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

const DAY_PT: Record<WeeklyPlanDay["day"], string> = {
  Mon: "Segunda", Tue: "Terça", Wed: "Quarta", Thu: "Quinta",
  Fri: "Sexta", Sat: "Sábado", Sun: "Domingo",
};

const VALID_PLAN_TYPES: PlanDayType[] = [
  "rest", "easy", "tempo", "intervals", "long_run", "recovery", "test", "race", "strength", "hiit",
];

const RUN_TYPES = new Set(["easy", "tempo", "intervals", "long_run", "recovery", "test", "race"]);

/** Infer the sport for a plan day from its explicit sport, type, then label. */
function inferPlanSport(d: Partial<WeeklyPlanDay>): SportKey | undefined {
  if (d.sport && ALL_SPORTS.includes(d.sport as PrimarySport)) return d.sport;
  if (d.type === "rest") return undefined;
  if (d.type === "strength" || d.type === "hiit") return "musculacao";
  const fromLabel = toSportKey(d.label) ?? toSportKey(d.type);
  if (fromLabel) return fromLabel;
  if (d.type && RUN_TYPES.has(d.type)) return "corrida";
  return undefined;
}

/**
 * Guarantee a complete, well-formed 7-day plan. Repairs partial day objects and
 * fills any missing day as rest, so the UI never renders `undefined` fields
 * (this was the root cause of the coach-page crash). Also stamps each session
 * with its `sport`.
 */
export function normalizeWeeklyPlanDays(input: unknown): WeeklyPlanDay[] {
  const arr = Array.isArray(input) ? input : [];
  const byDay = new Map<WeeklyPlanDay["day"], WeeklyPlanDay>();

  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const d = raw as Partial<WeeklyPlanDay>;
    if (!d.day || !DAY_ORDER.includes(d.day)) continue;

    const type: PlanDayType = VALID_PLAN_TYPES.includes(d.type as PlanDayType)
      ? (d.type as PlanDayType) : "rest";
    const sport = type === "rest" ? undefined : inferPlanSport({ ...d, type });

    byDay.set(d.day, {
      day:          d.day,
      dayPt:        typeof d.dayPt === "string" && d.dayPt ? d.dayPt : DAY_PT[d.day],
      type,
      sport,
      label:        typeof d.label === "string" && d.label
                      ? d.label
                      : type === "rest" ? "Descanso" : sport ? SPORTS[sport].label : "Treino",
      distance_km:  typeof d.distance_km === "number" ? d.distance_km : undefined,
      duration_min: typeof d.duration_min === "number" ? d.duration_min : undefined,
      pace:         typeof d.pace === "string" ? d.pace : undefined,
      description:  typeof d.description === "string" ? d.description : "",
      structure:    d.structure && Array.isArray((d.structure as StructuredWorkout).blocks)
                      ? (d.structure as StructuredWorkout) : undefined,
      // The lifting session was missing from this whitelist, so every plan
      // built with strength lost it the moment it was read back: the engine
      // prescribed it, the database stored it, and the screen never saw it.
      strength:     d.strength && Array.isArray((d.strength as { exercises?: unknown }).exercises)
                      ? (d.strength as WeeklyPlanDay["strength"]) : undefined,
    });
  }

  // Ensure all 7 days exist; any missing day becomes rest.
  return DAY_ORDER.map(day => byDay.get(day) ?? {
    day, dayPt: DAY_PT[day], type: "rest" as PlanDayType, label: "Descanso", description: "",
  });
}

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
  athleteProfile?: string | null,
  sports: SportKey[] = [...DEFAULT_SPORTS],
): Promise<WeeklyPlanData | null> {
  const active = (sports.length ? sports : DEFAULT_SPORTS).filter(s => ALL_SPORTS.includes(s as PrimarySport));
  const hasStrength = active.includes("musculacao");
  const hasRun      = active.includes("corrida");
  const hasSwim     = active.includes("natacao");
  const hasBike     = active.includes("ciclismo");
  const sportsList  = active.map(s => SPORTS[s].label).join(", ");

  const sportRules = [
    hasStrength && 'MUSCULAÇÃO: 2 a 4 sessões/semana. Use type "strength" (label "Musculação") OU type "hiit" (label "HIIT") — HIIT conta como musculação. Sempre duration_min (45-60), distance_km = null, structure = null, sport = "musculacao".',
    hasRun      && 'CORRIDA: no máximo 3 sessões/semana. Varie easy/tempo/intervals/long_run. Use os paces fornecidos; longão tipicamente no sábado. sport = "corrida".',
    hasSwim     && 'NATAÇÃO: 1 a 2 sessões/semana. sport = "natacao". Prescreva por distance_km (ex: 1.5-2.5) e/ou duration_min; varie técnica/leve (easy) e séries (intervals). structure = null.',
    hasBike     && 'CICLISMO: 1 a 2 sessões/semana. sport = "ciclismo". Prescreva por duration_min (60-120) e/ou distance_km; ótimo para volume aeróbico de baixo impacto (easy/tempo/long_run). structure = null.',
  ].filter(Boolean).map((r, i) => `${i + 4}. ${r}`).join("\n");

  const systemPrompt = `
Você é um treinador esportivo especialista (corrida, natação, ciclismo e musculação). Gere um plano semanal de treino estruturado para um atleta brasileiro.
RESPONDA SOMENTE com um objeto JSON válido — sem texto antes nem depois, sem markdown, sem código fence.

O atleta pratica SOMENTE estes esportes: ${sportsList}. NUNCA inclua treino de um esporte fora dessa lista.

Formato JSON obrigatório:
{
  "days": [
    {
      "day": "Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun",
      "dayPt": "Segunda"|"Terça"|"Quarta"|"Quinta"|"Sexta"|"Sábado"|"Domingo",
      "sport": "musculacao"|"corrida"|"natacao"|"ciclismo"|null,
      "type": "rest"|"easy"|"tempo"|"intervals"|"long_run"|"recovery"|"test"|"race"|"strength"|"hiit",
      "label": string (ex: "Musculação", "HIIT", "Rodagem", "Tiro 400m", "Longão", "Natação técnica", "Pedal Z2", "Descanso"),
      "distance_km": number | null,
      "duration_min": number | null,
      "pace": string | null (ex: "6:00–6:20/km" para corrida),
      "description": string (1-2 frases descritivas e práticas),
      "structure": null | {
        "blocks": [
          { "kind": "warmup"|"run"|"recovery"|"cooldown", "distance_km": number|null, "duration_min": number|null, "pace": string|null, "note": string|null }
          | { "repeat": number, "steps": [ ...mesmo formato de step... ] }
        ]
      }
    }
  ],
  "ai_message": string (1-2 frases proativas: observação sobre o histórico ou pergunta para engajar o atleta)
}

REGRAS OBRIGATÓRIAS — nunca viole:
1. Inclua TODOS os 7 dias (Mon a Sun).
2. DOMINGO (Sun) é SEMPRE "rest" (sport null) — nunca coloque treino no domingo.
3. Todo dia que NÃO seja descanso DEVE ter "sport" preenchido, e o sport DEVE estar na lista do atleta (${sportsList}). Distribua 5-6 dias de treino respeitando recuperação.
${sportRules}
${active.length + 4}. Se houver prova, o dia é type "race" (sport "corrida") e a semana reduz volume (taper).
${active.length + 5}. ai_message deve ser específica e baseada nos dados reais do atleta.
${active.length + 6}. ESTRUTURA: apenas para treinos de qualidade de CORRIDA (tempo/intervals/test) e longão — preencha "structure" com passos executáveis: warmup no início e cooldown no fim; intervalos como bloco repeat (ex: 6×(800m forte + 400m trote)). Cada step tem distance_km OU duration_min. Para todos os outros casos, structure = null.
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

  const profileStr = athleteProfile
    ? `\nPERFIL DO ATLETA (memória acumulada — use para personalizar o plano):\n${athleteProfile}`
    : "";

  const userPrompt = `
Semana de ${weekStart}.
Esportes praticados pelo atleta: ${sportsList}.
${vdotStr}
${raceStr}
${pacesStr}
${profileStr}
${historyStr}

Gere o plano semanal em JSON conforme o formato especificado.
`.trim();

  const raw = await callGroq(systemPrompt, userPrompt, 2400);
  if (!raw) return null;

  try {
    // Strip markdown code fences if model wrapped anyway
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as { days?: unknown; ai_message?: string };

    // Normalize: guarantees 7 well-formed days (no undefined fields) + sport stamp.
    const days = normalizeWeeklyPlanDays(parsed.days);

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

// ─── Macro plan (long-term periodization) ────────────────────────────────────

const RACE_TYPE_INFO: Record<MacroRaceType, string> = {
  "5k":        "5 km — foco em velocidade e VO2max",
  "10k":       "10 km — equilíbrio entre limiar e velocidade",
  "half":      "Meia-maratona (21,1 km) — limiar e resistência aeróbica",
  "marathon":  "Maratona (42,2 km) — volume, longões progressivos e nutrição",
  "ultra":     "Ultramaratona — volume alto, tempo em pé, terreno",
  "triathlon": "Triathlon/Ironman (corrida) — corrida sob fadiga, brick runs",
  "other":     "Prova de corrida",
};

/**
 * Gera um macro-plano periodizado da próxima segunda-feira até a prova-alvo.
 * Fases clássicas: base → build → peak → taper, com progressão de volume
 * segura (~10%/semana) e semanas de recuperação a cada 3-4 semanas.
 */
export async function generateMacroPlan(
  raceType: MacroRaceType,
  raceLabel: string,
  targetMonth: string,            // YYYY-MM
  weekStarts: string[],           // Mondays from next week until race month
  currentWeeklyKm: number,
  vdot: number | null,
  recentSummary: string,
): Promise<MacroPlanData | null> {
  const systemPrompt = `
Você é um treinador de corrida especialista em periodização. Monte um plano de LONGO PRAZO semana a semana até a prova-alvo.
RESPONDA SOMENTE com JSON válido, sem markdown:
{
  "weeks": [
    { "week_start": "YYYY-MM-DD", "phase": "base"|"build"|"peak"|"taper"|"race", "target_km": number, "focus": string curto, "key_workout": string curto }
  ],
  "phases_summary": [ { "phase": "base", "weeks": number, "description": string 1 frase } ],
  "rationale": string (2-3 frases sobre a estratégia geral)
}

REGRAS DE PERIODIZAÇÃO:
1. Use EXATAMENTE as datas de week_start fornecidas, nessa ordem
2. Progressão de volume máxima ~10% por semana; a cada 3-4 semanas, uma semana de recuperação (-20-30%)
3. Fases na ordem: base (volume aeróbico) → build (qualidade/limiar) → peak (específico de prova) → taper (1-3 semanas, redução 40-60%) → race na última semana
4. target_km realista partindo do volume atual do atleta — nunca dobre o volume de uma vez
5. key_workout específico e curto (ex: "longão 18km", "6x800m 5K pace", "tempo 8km")
6. focus com 2-4 palavras
`.trim();

  const userPrompt = `
PROVA-ALVO: ${raceLabel} (${RACE_TYPE_INFO[raceType]})
MÊS ESTIMADO DA PROVA: ${targetMonth}
VOLUME SEMANAL ATUAL: ~${Math.round(currentWeeklyKm)} km/semana
${vdot ? `VDOT ATUAL: ${vdot.toFixed(1)}` : ""}

SEMANAS DISPONÍVEIS (week_start de cada uma, em ordem):
${weekStarts.join(", ")}

HISTÓRICO RECENTE:
${recentSummary}

Gere o macro-plano em JSON cobrindo TODAS as semanas listadas.
`.trim();

  const raw = await callGroq(systemPrompt, userPrompt, 3000);
  if (!raw) return null;

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as MacroPlanData;
    if (!Array.isArray(parsed.weeks) || parsed.weeks.length === 0) return null;
    return {
      weeks: parsed.weeks,
      phases_summary: parsed.phases_summary ?? [],
      rationale: parsed.rationale ?? "",
    };
  } catch (err) {
    console.error("[AI] Failed to parse macro plan:", err, "\nRaw:", raw?.slice(0, 400));
    return null;
  }
}

/**
 * Adapta o macro-plano à realidade: compara as últimas semanas planejadas vs
 * executadas e reescreve SOMENTE as semanas futuras (passado preservado).
 */
export async function adaptMacroPlan(
  plan: MacroPlanData,
  raceLabel: string,
  targetMonth: string,
  executionSummary: string,
  vdot: number | null,
): Promise<{ weeks: MacroPlanWeek[]; note: string } | null> {
  const today = new Date().toISOString().slice(0, 10);
  const pastWeeks   = plan.weeks.filter(w => w.week_start <  today);
  const futureWeeks = plan.weeks.filter(w => w.week_start >= today);
  if (futureWeeks.length === 0) return null;

  const systemPrompt = `
Você é um treinador de corrida. O atleta tem um macro-plano até a prova, mas a execução real divergiu do planejado.
Reescreva SOMENTE as semanas futuras listadas, ajustando volume e foco à realidade — se o atleta correu menos, reduza a rampa; se correu mais e bem, pode progredir.
RESPONDA SOMENTE com JSON válido:
{
  "weeks": [ { "week_start": "YYYY-MM-DD", "phase": "...", "target_km": number, "focus": string, "key_workout": string } ],
  "note": string (2 frases: o que mudou e por quê)
}
REGRAS: use exatamente as mesmas datas week_start futuras; mantenha taper antes da prova; progressão ≤10%/semana a partir do volume REAL atual.
`.trim();

  const userPrompt = `
PROVA: ${raceLabel} em ${targetMonth}
${vdot ? `VDOT: ${vdot.toFixed(1)}` : ""}

EXECUÇÃO RECENTE (planejado vs real):
${executionSummary}

SEMANAS FUTURAS A REESCREVER (datas):
${futureWeeks.map(w => w.week_start).join(", ")}

PLANO FUTURO ATUAL (para referência):
${futureWeeks.map(w => `${w.week_start}: ${w.target_km}km [${w.phase}] ${w.focus}`).join("\n")}

Gere o JSON com as semanas futuras ajustadas.
`.trim();

  const raw = await callGroq(systemPrompt, userPrompt, 2500);
  if (!raw) return null;

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as { weeks: MacroPlanWeek[]; note?: string };
    if (!Array.isArray(parsed.weeks) || parsed.weeks.length === 0) return null;

    const futureSet = new Set(futureWeeks.map(w => w.week_start));
    const newFuture = parsed.weeks.filter(w => futureSet.has(w.week_start));
    if (newFuture.length === 0) return null;

    const merged = [...pastWeeks, ...newFuture].sort((a, b) => (a.week_start < b.week_start ? -1 : 1));
    return { weeks: merged, note: parsed.note ?? "Plano ajustado à execução real." };
  } catch (err) {
    console.error("[AI] Failed to parse macro adaptation:", err);
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
  athleteProfile?: string | null,
): Promise<{ updatedPlan: WeeklyPlanData | null; assistantMessage: string } | null> {
  // The model translates the request into structured edits; it never rewrites
  // the plan. Asking it for a whole seven-day plan is how the chat ended up
  // confirming changes it had not made.
  const systemPrompt = `
Você é o tradutor de pedidos de um treinador. O atleta descreve um ajuste no plano da semana e você converte isso em EDIÇÕES ESTRUTURADAS. Você NÃO escreve o plano.

RESPONDA SOMENTE com um objeto JSON válido — sem texto antes ou depois, sem markdown, sem code fence.

{"edits":[...],"message":"resposta curta em português"}

Edições possíveis (use apenas estas):
  {"kind":"set_distance","day":"Sat","km":8}      → mudar a distância de um dia
  {"kind":"set_rest","day":"Thu"}                 → transformar um dia em descanso
  {"kind":"swap_days","a":"Wed","b":"Sat"}        → trocar o conteúdo de dois dias
  {"kind":"scale_week","factor":1.2}              → aumentar/reduzir todas as corridas

Dias: Mon, Tue, Wed, Thu, Fri, Sat, Sun.

REGRAS:
- Se o atleta não pediu mudança nenhuma (só uma pergunta), devolva "edits":[] e responda no "message".
- NUNCA prometa no "message" uma mudança que não esteja em "edits". O sistema aplica as edições e reescreve a confirmação a partir do que realmente mudou.
- Não invente edições que o atleta não pediu.
`.trim();

  const planStr = JSON.stringify(currentPlan.days.map(d => ({
    day: d.day, type: d.type, label: d.label,
    distance_km: d.distance_km, pace: d.pace, description: d.description
  })));

  const historyStr = chatHistory.slice(-6).map(m => `${m.role === "user" ? "Atleta" : "Treinador"}: ${m.content}`).join("\n");

  const recentStr = recentRuns.slice(0, 5).map(fmtRun).join("\n");

  const profileStr = athleteProfile
    ? `\nPERFIL DO ATLETA (memória acumulada):\n${athleteProfile}\n`
    : "";

  const userPrompt = `
PLANO ATUAL:
${planStr}

CORRIDAS RECENTES:
${recentStr}
${profileStr}
HISTÓRICO DA CONVERSA:
${historyStr}

MENSAGEM DO ATLETA: ${userMessage}
`.trim();

  const raw = await callGroq(systemPrompt, userPrompt, 1500);
  if (!raw) return null;

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as { edits?: unknown; message?: unknown };

    const edits = normalizePlanEdits(parsed.edits);
    const reply = typeof parsed.message === "string" ? parsed.message : "";

    if (edits.length === 0) {
      return { updatedPlan: null, assistantMessage: reply || "Entendi." };
    }

    const { plan, changes, rejected } = applyPlanEdits(currentPlan, edits);

    // The confirmation is written from what actually landed, never from what
    // the model said it would do.
    if (changes.length === 0) {
      const why = rejected.length > 0 ? ` ${rejected.join(" ")}` : "";
      return {
        updatedPlan: null,
        assistantMessage: `Não mudei nada no plano.${why} Se não era isso, me diga o dia e a distância.`,
      };
    }

    const summary = changes.map(c => `• ${c}`).join("\n");
    const caveat = rejected.length > 0 ? `\n\nNão apliquei: ${rejected.join(" ")}` : "";
    return { updatedPlan: plan, assistantMessage: `Plano atualizado:\n${summary}${caveat}` };
  } catch (err) {
    console.error("[AI] Failed to parse plan feedback JSON:", err, "\nRaw:", raw);
    return null;
  }
}

/**
 * Analisa uma mensagem do atleta + resposta do assistente e extrai notas sobre o atleta.
 * Retorna array de notas (pode ser vazio se nada relevante foi dito).
 */
export async function extractAthleteNotes(
  userMessage: string,
  assistantResponse: string,
): Promise<Array<{ category: AthleteNoteCategory; content: string }>> {
  const systemPrompt = `
Você é um assistente de extração de dados. Analise a conversa entre um atleta e seu treinador IA.
Extraia APENAS informações factuais e específicas sobre o atleta que valem a pena lembrar para treinos futuros.
RESPONDA SOMENTE com um array JSON — sem texto antes nem depois, sem markdown.

Categorias disponíveis:
- "injury": lesões, dores, problemas físicos (ex: "dor no joelho esquerdo ao correr acima de 10km")
- "preference": preferências de treino (ex: "prefere treinar de manhã", "não gosta de treinos de velocidade")
- "availability": disponibilidade (ex: "disponível seg/qua/sex", "não treina domingos")
- "goal": objetivos de performance (ex: "quer correr meia maratona em mai/24 abaixo de 2h")
- "observation": observações relevantes (ex: "trabalha muitas horas", "tem histórico de lesões no tornozelo")

Regras:
1. Extraia apenas fatos NOVOS, ESPECÍFICOS e ACIONÁVEIS
2. Ignore agradecimentos, confirmações genéricas ("ok", "entendido"), perguntas sobre o plano
3. Se nada relevante foi dito, retorne []
4. Máximo 3 notas por conversa — apenas o mais importante
5. Um pedido sobre UM dia ou UMA semana ("essa segunda", "esta semana", "amanhã") NÃO é um fato
   sobre o atleta — ele já foi aplicado ao plano. Não transforme em regra geral: nunca escreva
   "segunda-feira tem pouco tempo" a partir de "essa segunda não tenho tempo".

Formato: [{"category": "tipo", "content": "fato específico e conciso"}]
`.trim();

  const userPrompt = `
Atleta: ${userMessage}
Treinador: ${assistantResponse}
`.trim();

  const raw = await callGroq(systemPrompt, userPrompt, 300);
  if (!raw) return [];

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as Array<{ category: string; content: string }>;
    if (!Array.isArray(parsed)) return [];

    const validCategories: AthleteNoteCategory[] = ["injury","preference","availability","goal","observation"];
    return parsed
      .filter(n => validCategories.includes(n.category as AthleteNoteCategory) && n.content?.trim())
      .map(n => ({ category: n.category as AthleteNoteCategory, content: n.content.trim() }));
  } catch {
    return [];
  }
}

// ─── Coach's note for the week ───────────────────────────────────────────────

const PHASE_PT: Record<string, string> = {
  base:  "base aeróbica",
  build: "construção (qualidade específica)",
  peak:  "pico (específico de prova)",
  taper: "polimento (taper)",
  race:  "semana de prova",
};

/**
 * One-paragraph coach's note framing the week. It does NOT prescribe workouts —
 * those are computed deterministically by the workout engine — it only explains
 * the intent, which is what the model is actually good at.
 */
export async function generateCoachNote(input: {
  weeklyKm:  number;
  phase:     string;
  nextRace:  { name: string; date: string; distance_km: number } | null;
  vdot:      number | null;
  athleteProfile: string | null;
  /** O que a semana anterior pediu. Era "a soma das últimas 10 corridas", que não é semana nenhuma. */
  previousPlannedKm: number | null;
  /** A quarta semana do bloco, mais leve por desenho — o recado precisa saber disso. */
  isRecovery: boolean;
  /** As corridas que o motor montou. São os únicos números que o recado pode citar. */
  sessions: Array<{ label: string; km: number }>;
  /** A semana inteira, dia a dia — para o recado não inventar folga onde há treino. */
  week: Array<{ dayPt: string; label: string; km: number | null }>;
}): Promise<string | null> {
  const systemPrompt = `
Você é o treinador do atleta. Escreva UMA mensagem curta (2-3 frases, português do Brasil)
enquadrando a semana de treino que já foi montada pelo motor do app.

REGRAS:
1. NÃO prescreva treinos, distâncias ou ritmos — isso já está definido no plano.
2. Se citar quilômetros, use SOMENTE os números da seção SEMANA MONTADA. Nenhum outro número.
3. Se a semana for de RECUPERAÇÃO, diga isso com todas as letras e explique para que serve.
4. O PERFIL traz o histórico do atleta; não trate um pedido antigo sobre um dia específico como regra desta semana.
5. Explique a INTENÇÃO da semana e dê um ponto de atenção prático. Nada de motivação genérica.
6. NÃO diga que um dia deve ficar livre, nem mude o dia de uma sessão: a SEMANA MONTADA abaixo
   já diz o que cada dia tem, e o atleta vai ler as duas coisas lado a lado.
7. Sem markdown, sem emojis, sem listas.
`.trim();

  const userPrompt = `
FASE: ${PHASE_PT[input.phase] ?? input.phase}${input.isRecovery ? " — SEMANA DE RECUPERAÇÃO (quarta do bloco, mais leve de propósito)" : ""}
SEMANA MONTADA: ${input.weeklyKm} km no total
${input.week.map(d => `  ${d.dayPt}: ${d.label}${d.km ? ` — ${d.km} km` : ""}`).join("\n")}
${input.previousPlannedKm != null ? `SEMANA ANTERIOR: ${input.previousPlannedKm} km planejados` : ""}
${input.vdot ? `VDOT: ${input.vdot.toFixed(1)}` : "Sem teste recente"}
${input.nextRace ? `PRÓXIMA PROVA: ${input.nextRace.name} em ${input.nextRace.date}` : "Sem prova marcada"}
${input.athleteProfile ? `\nPERFIL:\n${input.athleteProfile}` : ""}

Escreva a mensagem da semana.
`.trim();

  return callGroq(systemPrompt, userPrompt, 220);
}

// ─── Post-race analysis ──────────────────────────────────────────────────────

export interface GeneratedRaceAnalysis {
  summary:         string;   // 2-3 sentences: how the race went
  whatWorked:      string;
  whatToImprove:   string;
  nextCycleFocus:  string;   // concrete training focus for the next block
}

/**
 * Post-race debrief: compares what was predicted against what actually
 * happened, reads the pacing pattern, and turns it into the focus for the
 * next training block.
 */
export async function generateRaceAnalysis(input: {
  raceName:       string;
  distanceKm:     number;
  raceDate:       string;
  actualSeconds:  number;
  predictedSeconds: number | null;
  targetSeconds:  number | null;
  vdotBefore:     number | null;
  vdotFromRace:   number | null;
  avgHr:          number | null;
  splitSummary:   string;    // per-km or per-segment pacing, or "sem dados"
  trainingSummary: string;   // volume/consistency in the build-up
}): Promise<GeneratedRaceAnalysis | null> {
  const systemPrompt = `
Você é um treinador de corrida analisando a prova que o atleta acabou de correr.
RESPONDA SOMENTE com JSON válido, sem markdown:
{
  "summary": string (2-3 frases: como foi a prova, comparando previsto x real, sem rodeios),
  "what_worked": string (2-3 frases sobre o que funcionou — pacing, preparo, execução),
  "what_to_improve": string (2-3 frases objetivas sobre o que custou tempo),
  "next_cycle_focus": string (2-4 frases: o foco concreto do próximo bloco de treino, com tipos de treino)
}

REGRAS:
1. Use os NÚMEROS fornecidos. Não invente dados que não estão no contexto.
2. Se o ritmo caiu no final (positive split), diga isso claramente e ligue à causa provável (largada rápida demais, volume insuficiente, ou nutrição).
3. Se bateu o previsto, reconheça — sem exagero. Se ficou aquém, seja direto e construtivo, nunca condescendente.
4. next_cycle_focus deve ser acionável: tipos de treino e ênfase (ex: "longões progressivos até 24km", "tempo runs de 8km no limiar").
5. Português do Brasil, tom de treinador experiente. Sem markdown, sem bullet points.
`.trim();

  const fmt = (s: number | null) => {
    if (!s) return "—";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
    return h > 0 ? `${h}h${String(m).padStart(2, "0")}min${String(sec).padStart(2, "0")}` : `${m}min${String(sec).padStart(2, "0")}`;
  };
  const pace = Math.round(input.actualSeconds / input.distanceKm);
  const paceStr = `${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, "0")}/km`;

  const delta = input.predictedSeconds
    ? input.actualSeconds - input.predictedSeconds
    : null;

  const userPrompt = `
PROVA: ${input.raceName} — ${input.distanceKm} km em ${input.raceDate}
TEMPO REAL: ${fmt(input.actualSeconds)} (ritmo médio ${paceStr})
TEMPO PREVISTO PELO CONDICIONAMENTO: ${fmt(input.predictedSeconds)}${
  delta !== null ? ` (${delta > 0 ? "+" : ""}${Math.round(delta)}s vs previsto)` : ""
}
TEMPO-ALVO DEFINIDO: ${fmt(input.targetSeconds)}
${input.vdotBefore ? `VDOT ANTES DA PROVA: ${input.vdotBefore.toFixed(1)}` : ""}
${input.vdotFromRace ? `VDOT IMPLICADO PELA PROVA: ${input.vdotFromRace.toFixed(1)}` : ""}
${input.avgHr ? `FC MÉDIA NA PROVA: ${input.avgHr} bpm` : ""}

RITMO AO LONGO DA PROVA:
${input.splitSummary}

PREPARAÇÃO (semanas anteriores):
${input.trainingSummary}

Gere a análise em JSON.
`.trim();

  const raw = await callGroq(systemPrompt, userPrompt, 1200);
  if (!raw) return null;

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const p = JSON.parse(cleaned) as {
      summary?: string; what_worked?: string;
      what_to_improve?: string; next_cycle_focus?: string;
    };
    if (!p.summary) return null;
    return {
      summary:        p.summary.trim(),
      whatWorked:     p.what_worked?.trim() ?? "",
      whatToImprove:  p.what_to_improve?.trim() ?? "",
      nextCycleFocus: p.next_cycle_focus?.trim() ?? "",
    };
  } catch (err) {
    console.error("[AI] Failed to parse race analysis:", err, "\nRaw:", raw?.slice(0, 400));
    return null;
  }
}

// ─── Race strategy ───────────────────────────────────────────────────────────

export interface RaceStrategySplit { range: string; pace: string; note?: string }

export interface GeneratedRaceStrategy {
  title:              string;
  scenario:           "conservative" | "balanced" | "aggressive";
  targetTimeSeconds:  number | null;
  strategyText:       string;
  hydrationPlan:      string;
  gelPlan:            string;
  splits:             RaceStrategySplit[];
}

/**
 * Race-day strategy for a specific upcoming race, grounded in the athlete's
 * CURRENT fitness (VDOT, recent volume, predicted time). Regenerating after new
 * training produces an updated plan — that's how the strategy "keeps up".
 */
export async function generateRaceStrategy(input: {
  raceName:        string;
  distanceKm:      number;
  raceDate:        string | null;
  daysOut:         number | null;
  targetTimeSeconds: number | null;
  predictedTimeSeconds: number | null;
  vdot:            number | null;
  weeklyKm:        number;
  longestRecentKm: number;
  recentSummary:   string;
}): Promise<GeneratedRaceStrategy | null> {
  const systemPrompt = `
Você é um treinador de corrida especialista em prova. Monte a ESTRATÉGIA DE PROVA para o atleta brasileiro.
RESPONDA SOMENTE com JSON válido — sem markdown, sem texto fora do JSON.

{
  "title": string (ex: "Estratégia — Meia do Rio"),
  "scenario": "conservative" | "balanced" | "aggressive",
  "target_time_seconds": number,
  "strategy_text": string (3-5 frases: como largar, quando acelerar, o que evitar; específico à prova e ao condicionamento atual),
  "hydration_plan": string (1-2 frases práticas, com quilômetros/intervalos),
  "gel_plan": string (1-2 frases; se a prova for curta demais para géis, diga isso),
  "splits": [ { "range": "0–5 km", "pace": "5:30/km", "note": string curto } ]
}

REGRAS:
1. Baseie os ritmos no condicionamento ATUAL (VDOT e tempo previsto), não em desejos. Se o tempo-alvo for irreal frente ao previsto, escolha "conservative" e explique no strategy_text.
2. Cubra TODA a distância nos splits, em 3 a 6 faixas contíguas (a última terminando na distância da prova).
3. Negative split como padrão: primeiros km levemente mais lentos que o ritmo médio.
4. Ajuste ao volume atual: pouco volume ou longão curto frente à prova → mais conservador.
5. Géis: ~1 a cada 35-45 min em provas acima de 75 min; abaixo de 60 min normalmente não precisa.
6. Português do Brasil, tom direto e prático. Sem markdown.
`.trim();

  const fmt = (s: number | null) => {
    if (!s) return "não definido";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h${String(m).padStart(2, "0")}min` : `${m}min${String(sec).padStart(2, "0")}`;
  };

  const userPrompt = `
PROVA: ${input.raceName} — ${input.distanceKm} km${input.raceDate ? ` em ${input.raceDate}` : ""}
${input.daysOut != null ? `FALTAM: ${input.daysOut} dias` : ""}
TEMPO-ALVO DO ATLETA: ${fmt(input.targetTimeSeconds)}
TEMPO PREVISTO PELO CONDICIONAMENTO ATUAL: ${fmt(input.predictedTimeSeconds)}
${input.vdot ? `VDOT: ${input.vdot.toFixed(1)}` : ""}
VOLUME SEMANAL ATUAL: ~${Math.round(input.weeklyKm)} km
LONGÃO MAIS LONGO RECENTE: ${input.longestRecentKm.toFixed(1)} km

HISTÓRICO RECENTE:
${input.recentSummary}

Gere a estratégia em JSON.
`.trim();

  const raw = await callGroq(systemPrompt, userPrompt, 1400);
  if (!raw) return null;

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const p = JSON.parse(cleaned) as {
      title?: string; scenario?: string; target_time_seconds?: number;
      strategy_text?: string; hydration_plan?: string; gel_plan?: string;
      splits?: RaceStrategySplit[];
    };

    const scenario = p.scenario === "conservative" || p.scenario === "aggressive"
      ? p.scenario : "balanced";

    return {
      title:             p.title?.trim() || `Estratégia — ${input.raceName}`,
      scenario,
      targetTimeSeconds: Number.isFinite(p.target_time_seconds) ? Number(p.target_time_seconds) : null,
      strategyText:      p.strategy_text?.trim() ?? "",
      hydrationPlan:     p.hydration_plan?.trim() ?? "",
      gelPlan:           p.gel_plan?.trim() ?? "",
      splits: Array.isArray(p.splits)
        ? p.splits
            .filter(s => s && typeof s.range === "string" && typeof s.pace === "string")
            .map(s => ({ range: s.range, pace: s.pace, note: s.note }))
        : [],
    };
  } catch (err) {
    console.error("[AI] Failed to parse race strategy:", err, "\nRaw:", raw?.slice(0, 400));
    return null;
  }
}

/**
 * Dica de nutrição contextual ao treino do dia e ao objetivo calórico.
 * Curta (2-3 frases), prática, em português. Não substitui nutricionista.
 */
export async function generateDietTip(
  todayWorkout: string,      // e.g. "Longão 18km" or "Descanso"
  goal: "maintain" | "cut" | "gain",
  targetKcal: number,
  carbsG: number,
): Promise<string | null> {
  const goalPt = goal === "cut" ? "perder gordura mantendo performance"
    : goal === "gain" ? "ganhar massa" : "manter o peso";

  const systemPrompt = `
Você é um nutricionista esportivo. Dê UMA dica prática e curta (2-3 frases, em português) para o atleta HOJE,
considerando o treino do dia e o objetivo. Foque em TIMING e ESCOLHAS de comida (não em contar calorias).
Seja específico e acionável. Não use markdown. Termine lembrando que não substitui acompanhamento profissional só se relevante.
`.trim();

  const userPrompt = `
Treino de hoje: ${todayWorkout}
Objetivo: ${goalPt}
Meta calórica aproximada do dia: ${targetKcal} kcal (~${carbsG} g de carboidrato)
Dê a dica do dia.
`.trim();

  return callGroq(systemPrompt, userPrompt, 250);
}

// ─── A IA central ────────────────────────────────────────────────────────────

/**
 * A pergunta aberta do atleta, respondida sobre o dossiê e só sobre ele.
 *
 * O dossiê (`ai-brief.ts`) já é o resultado dos motores determinísticos. Aqui o
 * modelo não calcula nada: ele lê o que o motor concluiu e conversa. É a ADR-02
 * levada ao pé da letra — o motor prescreve, a IA narra — e é o que impede a
 * resposta de inventar um VDOT, um TSB ou uma quilometragem que ninguém mediu.
 *
 * `history` são as últimas mensagens da conversa, para uma pergunta curta do
 * tipo "e na semana passada?" continuar fazendo sentido.
 */
export async function answerAthleteQuestion(input: {
  brief: string;
  question: string;
  firstName?: string | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<GroqResult> {
  const systemPrompt = `
Você é o treinador do Limiar conversando com ${input.firstName ?? "o atleta"}, em português do Brasil.

A REGRA QUE VALE MAIS QUE TODAS: você só sabe o que está no DOSSIÊ abaixo. Ele foi calculado
pelo motor do app (Daniels, Friel, CTL/ATL/TSB). Você não recalcula, não estima e não completa.

- Todo número que você disser precisa aparecer no dossiê, igual. Nunca arredonde para um número
  mais bonito nem some coisas por conta própria.
- VOCÊ NÃO FAZ CONTA. Nenhuma. Não multiplique ritmo por distância, não converta ritmo em tempo de
  prova, não some quilometragem, não calcule média nem porcentagem. Se o número pedido não está
  escrito no dossiê, ele não existe para você — mesmo que dê para deduzi-lo a partir de outros.
- Se a pergunta pede algo que não está no dossiê, diga com todas as letras que você não tem esse
  dado, e diga o que faria você ter (conectar o relógio, fazer o teste de calibração, registrar o
  treino, cadastrar a prova).
- Nada de diagnóstico. Se for dor, lesão ou sintoma, reconheça, diga o que os dados mostram e
  recomende procurar um profissional.
- Fale com o atleta por "você", direto, sem bajular e sem encher linguiça.
- Curto: 2 a 5 frases. Só use lista se a pergunta pedir várias coisas.
- Quando usar números, termine dizendo de onde eles vieram (a "fonte" da seção que você usou).
- Não use markdown além de quebras de linha.

DOSSIÊ:
${input.brief}
`.trim();

  const conversa = (input.history ?? [])
    .slice(-6)
    .map(m => `${m.role === "user" ? "Atleta" : "Você"}: ${m.content}`)
    .join("\n");

  const userPrompt = [
    conversa ? `Conversa até aqui:\n${conversa}` : "",
    `Pergunta do atleta: ${input.question}`,
  ].filter(Boolean).join("\n\n");

  // Temperatura baixa: aqui a graça é ser exato, não ser criativo.
  return callGroqDetailed(systemPrompt, userPrompt, 700, 0.3);
}
