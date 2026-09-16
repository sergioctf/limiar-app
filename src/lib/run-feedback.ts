import type { WeeklyPlanDay } from "@/types";
import { parsePaceRange } from "@/lib/workout-execution";

export const EFFORTS = ["Muito leve", "Leve", "Moderado", "Difícil", "Muito difícil"] as const;

/**
 * The one level that opens a follow-up.
 *
 * "Difícil" is not a warning: a threshold session that feels hard is the
 * session working as designed, and treating it as an alarm teaches the athlete
 * to under-report. Only "muito difícil" earns a question — and even then the
 * first question is *why*, not a change to the plan (Sérgio, 16/09).
 */
export const VERY_HARD = 5;

/** What to consider about any session. */
export const CONTEXTS = {
  none: "Tudo certo", schedule: "Tempo/agenda", work: "Trabalho", weather: "Clima",
  fatigue: "Cansaço", pain: "Dor/incômodo", other: "Outro",
} as const;

/**
 * Why a session felt very hard. Everything except "o treino estava pesado
 * demais" sits outside the session itself, and is recorded without touching
 * the plan.
 */
export const HARD_REASONS = {
  sleep: "Dormi pouco", stress: "Estresse", fatigue: "Cansaço acumulado", personal: "Questão pessoal",
  pain: "Dor/incômodo", weather: "Clima", session_too_hard: "O treino estava pesado demais", other: "Outro",
} as const;

export type RunContext = keyof typeof CONTEXTS | keyof typeof HARD_REASONS;

export function contextQuestion(effort: number | null): { title: string; options: Array<[RunContext, string]> } {
  return effort === VERY_HARD
    ? { title: "O que deixou o treino muito difícil?", options: Object.entries(HARD_REASONS) as Array<[RunContext, string]> }
    : { title: "Teve algo que precisamos considerar?", options: Object.entries(CONTEXTS) as Array<[RunContext, string]> };
}

export function contextLabel(context: RunContext, effort: number | null): string {
  const own = contextQuestion(effort).options.find(([key]) => key === context)?.[1];
  return own
    ?? (HARD_REASONS as Record<string, string>)[context]
    ?? (CONTEXTS as Record<string, string>)[context]
    ?? "Outro";
}

export interface RunFeedback {
  run_id: string;
  /** `skipped` = the athlete chose to answer later, on the run's own page. */
  status: "answered" | "skipped";
  effort: number | null;
  context: RunContext | null;
  note: string | null;
  planned: WeeklyPlanDay | null;
  /** The athlete's answer to "reduce the next sessions?" — null when it was never asked. */
  reduce_requested?: boolean | null;
}
export interface FeedbackRun {
  id: string; name: string; date: string; distance_km: number;
  avg_pace_seconds_per_km: number | null; avg_hr: number | null;
}
export interface FeedbackItem {
  run: FeedbackRun; feedback: RunFeedback | null; planned: WeeklyPlanDay | null;
}

export interface FeedbackInput {
  runId: string;
  status: "answered" | "skipped";
  effort?: number;
  context?: RunContext;
  note?: string;
  reduce?: boolean;
}

export function validFeedbackInput(body: unknown): body is FeedbackInput {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.runId !== "string" || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(b.runId)) return false;
  if (b.status === "skipped") return true;
  if (b.status !== "answered" || typeof b.effort !== "number" || !Number.isInteger(b.effort)
    || b.effort < 1 || b.effort > 5 || typeof b.context !== "string") return false;
  // The reason has to belong to the question that was actually asked.
  if (!contextQuestion(b.effort).options.some(([key]) => key === b.context)) return false;
  if (b.note !== undefined && (typeof b.note !== "string" || b.note.length > 300)) return false;
  // "Reduce?" exists only after "the session itself was too heavy", and must be answered there.
  if (b.context === "session_too_hard") return typeof b.reduce === "boolean";
  return b.reduce === undefined || b.reduce === null;
}

/** Date-only matching is deliberately conservative: multiple runs require manual interpretation. */
export function matchFeedbackPlan(date: string, days: WeeklyPlanDay[], runsOnDate: number): WeeklyPlanDay | null {
  if (runsOnDate !== 1) return null;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${date}T12:00:00Z`).getUTCDay()];
  const matches = days.filter(d => d.day === day && d.type !== "rest" && d.type !== "strength"
    && (d.sport === "corrida" || (!d.sport && (d.distance_km ?? 0) > 0)));
  return matches.length === 1 ? matches[0] : null;
}

const HARD_SESSIONS: WeeklyPlanDay["type"][] = ["intervals", "tempo", "test", "race", "long_run", "hiit"];
const LIFE: RunContext[] = ["schedule", "work", "weather"];

/** Evidence-limited feedback. Never changes the plan by itself. */
export function evaluateRunFeedback({ run, feedback, planned }: FeedbackItem) {
  const p = feedback ? feedback.planned : planned;
  const target = p?.distance_km;
  const ratio = target && target > 0 ? run.distance_km / target : null;
  const range = p && ["easy", "recovery", "long_run", "steady"].includes(p.type) ? parsePaceRange(p.pace) : null;
  const pace = run.avg_pace_seconds_per_km;
  const faster = range && pace && pace < range.fastSec - 8;
  const slower = range && pace && pace > range.slowSec + 8;
  const km = (n: number) => n.toFixed(1).replace(".", ",");
  const evidence = [`${km(run.distance_km)} km realizados${target ? ` de ${km(target)} km previstos` : ""}.`];
  if (p) evidence.push(`Referência do dia: ${p.label}.`);
  else evidence.push("Sem uma correspondência única com o plano; não avaliamos cumprimento do objetivo.");
  if (faster) evidence.push("Ritmo médio mais rápido que a faixa prevista; mais rápido não significa melhor execução.");
  else if (slower) evidence.push("Ritmo médio abaixo da faixa prevista; o contexto ajuda a interpretar essa diferença.");
  else if (range && pace) evidence.push("Ritmo médio dentro da faixa prevista, com tolerância de 8 s/km.");
  if (feedback?.effort) evidence.push(`Esforço relatado: ${EFFORTS[feedback.effort - 1].toLowerCase()}.`);

  const title = ratio !== null && ratio < .9 ? "Distância abaixo do previsto"
    : ratio !== null && ratio <= 1.1 ? "Distância prevista cumprida" : "Treino registrado";

  if (!feedback || feedback.status === "skipped") {
    return { title, evidence, next: "Sem sua percepção, não concluímos por que houve diferenças. Os próximos treinos seguem como planejados." };
  }

  const context = feedback.context;
  const effort = feedback.effort ?? 0;

  // Pain outranks everything: no distance or pace argument should talk past it.
  if (context === "pain") {
    return {
      title: "O incômodo merece atenção",
      evidence,
      next: "Não use distância ou pace para ignorar o incômodo. Antes do próximo treino, avalie como está; se persistir ou piorar, procure orientação profissional. O plano não foi alterado automaticamente.",
    };
  }

  if (effort === VERY_HARD) {
    if (context === "session_too_hard") {
      return feedback.reduce_requested
        ? {
          title: "Próximos treinos mais leves",
          evidence,
          next: "Você achou o treino pesado demais e pediu para aliviar: as próximas corridas leves e o longão desta semana ficaram um pouco mais curtos, e a semana seguinte não aumenta o volume.",
        }
        : {
          title: "Treino pesado, plano mantido",
          evidence,
          next: "Você achou o treino pesado demais, mas preferiu manter. Os próximos treinos seguem como planejados.",
        };
    }
    const why = context ? contextLabel(context, effort).toLowerCase() : "um fator externo";
    return {
      title: "Treino muito difícil, motivo registrado",
      evidence,
      next: `O que pesou foi: ${why}. Fica registrado e não muda o plano — um dia difícil por fatores de fora do treino não significa que o treino esteja pesado demais.`,
    };
  }

  if (context && LIFE.includes(context)) {
    return {
      title: "Treino com contexto registrado",
      evidence,
      next: `${contextLabel(context, effort)} fez parte deste treino. Isso, sozinho, não indica perda de condicionamento nem gera compensação de volume. Os próximos treinos seguem como planejados.`,
    };
  }
  if (context === "fatigue") {
    return { title, evidence, next: "Cansaço registrado. Os próximos treinos seguem como planejados." };
  }
  if (effort === 4 && p && HARD_SESSIONS.includes(p.type)) {
    // Hard on a hard day is the session doing its job.
    return { title, evidence, next: "Difícil é o esperado para este tipo de sessão. Os próximos treinos seguem como planejados." };
  }
  return { title, evidence, next: "Os próximos treinos seguem como planejados." };
}

/**
 * Which run the entry pop-up asks about: the most recent one with no answer at
 * all, while it is still fresh. "Responder depois" is stored as `skipped`, so a
 * postponed run never pops up again — its own page keeps the form.
 */
export function promptCandidate(items: FeedbackItem[], since: string): FeedbackItem | null {
  return items
    .filter(i => !i.feedback && i.run.date >= since)
    .sort((a, b) => b.run.date.localeCompare(a.run.date))[0] ?? null;
}
