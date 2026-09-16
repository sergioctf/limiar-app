import type { WeeklyPlanDay } from "@/types";
import { parsePaceRange } from "@/lib/workout-execution";

export const EFFORTS = ["Muito leve", "Leve", "Moderado", "Difícil", "Muito difícil"] as const;
export const CONTEXTS = {
  none: "Tudo certo", schedule: "Tempo/agenda", work: "Trabalho", weather: "Clima",
  fatigue: "Cansaço", pain: "Dor/incômodo", other: "Outro",
} as const;
export type RunContext = keyof typeof CONTEXTS;
export interface RunFeedback {
  run_id: string;
  status: "answered" | "skipped";
  effort: number | null;
  context: RunContext | null;
  note: string | null;
  planned: WeeklyPlanDay | null;
}
export interface FeedbackRun {
  id: string; name: string; date: string; distance_km: number;
  avg_pace_seconds_per_km: number | null; avg_hr: number | null;
}
export interface FeedbackItem {
  run: FeedbackRun; feedback: RunFeedback | null; planned: WeeklyPlanDay | null;
}

export function validFeedbackInput(body: unknown): body is {
  runId: string; status: "answered" | "skipped"; effort?: number; context?: RunContext; note?: string;
} {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.runId !== "string" || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(b.runId)) return false;
  if (b.status === "skipped") return true;
  return b.status === "answered" && typeof b.effort === "number" && Number.isInteger(b.effort)
    && b.effort >= 1 && b.effort <= 5 && typeof b.context === "string"
    && Object.prototype.hasOwnProperty.call(CONTEXTS, b.context)
    && (b.note === undefined || (typeof b.note === "string" && b.note.length <= 300));
}

/** Date-only matching is deliberately conservative: multiple runs require manual interpretation. */
export function matchFeedbackPlan(date: string, days: WeeklyPlanDay[], runsOnDate: number): WeeklyPlanDay | null {
  if (runsOnDate !== 1) return null;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${date}T12:00:00Z`).getUTCDay()];
  const matches = days.filter(d => d.day === day && d.type !== "rest" && d.type !== "strength"
    && (d.sport === "corrida" || (!d.sport && (d.distance_km ?? 0) > 0)));
  return matches.length === 1 ? matches[0] : null;
}

/** Evidence-limited feedback, never a prescription or a change to the plan. */
export function evaluateRunFeedback({ run, feedback, planned }: FeedbackItem) {
  const p = feedback ? feedback.planned : planned;
  const target = p?.distance_km;
  const ratio = target && target > 0 ? run.distance_km / target : null;
  const range = p && ["easy", "recovery", "long_run", "steady"].includes(p.type) ? parsePaceRange(p.pace) : null;
  const pace = run.avg_pace_seconds_per_km;
  const faster = range && pace && pace < range.fastSec - 8;
  const slower = range && pace && pace > range.slowSec + 8;
  const evidence = [`${run.distance_km.toFixed(1)} km realizados${target ? ` de ${target.toFixed(1)} km previstos` : ""}.`];
  if (p) evidence.push(`Referência do dia: ${p.label}.`);
  else evidence.push("Sem uma correspondência única com o plano; não avaliamos cumprimento do objetivo.");
  if (faster) evidence.push("Ritmo médio mais rápido que a faixa prevista; mais rápido não significa melhor execução.");
  else if (slower) evidence.push("Ritmo médio abaixo da faixa prevista; o contexto ajuda a interpretar essa diferença.");
  else if (range && pace) evidence.push("Ritmo médio dentro da faixa prevista, com tolerância de 8 s/km.");
  if (feedback?.effort) evidence.push(`Esforço relatado: ${EFFORTS[feedback.effort - 1].toLowerCase()}.`);
  let title = ratio !== null && ratio < .9 ? "Distância abaixo do previsto" : ratio !== null && ratio <= 1.1 ? "Distância prevista cumprida" : "Treino registrado";
  let next = "Os próximos treinos não foram alterados. Um treino isolado não determina sua capacidade; progressões precisam de mais evidências e do seu aceite.";
  if (!feedback || feedback.status === "skipped") next = "Sem sua percepção, não concluímos por que houve diferenças. Os próximos treinos não foram alterados.";
  if (feedback?.context && ["schedule", "work", "weather"].includes(feedback.context)) {
    title = "Treino com contexto registrado";
    next = `${CONTEXTS[feedback.context]} fez parte deste treino. Isso, sozinho, não indica perda de condicionamento nem gera compensação de volume. Os próximos treinos não foram alterados.`;
  }
  if (feedback?.context === "fatigue" || (feedback?.effort ?? 0) >= 4) next = "Você relatou cansaço ou esforço alto. Vale entender se foi pontual antes de propor ajustes. Os próximos treinos não foram alterados.";
  if (feedback?.context === "pain") {
    title = "O incômodo merece atenção";
    next = "Não use distância ou pace para ignorar o incômodo. Antes do próximo treino, avalie como está; se persistir ou piorar, procure orientação profissional. O plano não foi alterado automaticamente.";
  }
  return { title, evidence, next };
}

/**
 * Which check-in the athlete sees.
 *
 * On a run's own page there is nothing to choose: it is that run.
 *
 * On the Home the card sits above today's session, so it has to earn the spot
 * and then give it back. A pending check-in earns it. An assessment the athlete
 * has already read does not — it stayed on top for a week, repeating a verdict
 * about a run from last Tuesday while the hero of the screen is today. So an
 * answered check-in only survives while it is still news (the run is from today
 * or yesterday), or while it is the one just answered in this session.
 */
export function pickFeedbackItem(
  items: FeedbackItem[],
  opts: { runId?: string; selectedId?: string | null; since: string },
): FeedbackItem | null {
  if (opts.runId) return items[0] ?? null;
  if (opts.selectedId) {
    const justAnswered = items.find(i => i.run.id === opts.selectedId);
    if (justAnswered) return justAnswered;
  }
  const pending = items.find(i => !i.feedback);
  if (pending) return pending;
  return items.find(i => i.feedback?.status === "answered" && i.run.date >= opts.since) ?? null;
}
