/**
 * Swapping today's session when the body says no.
 *
 * The readiness score is only worth computing if it can change what happens
 * today. The old path was an opt-in suggestion created at 05:30 — before any
 * watch data had arrived — that halved the session and could not be undone. An
 * athlete who accepted it by mistake had lost the day's workout for good.
 *
 * Two moves, both chosen by the athlete, both reversible:
 *
 *  · **easy** — today becomes a short easy run. The hard session is not squeezed
 *    in elsewhere; one missed stimulus costs nothing, and a hard session on a
 *    body that is not recovered costs more than it gives.
 *  · **tomorrow** — today and tomorrow trade places, when tomorrow is light and
 *    the day after is not another hard day. Stacking two hard days to "catch up"
 *    is exactly the mistake this exists to prevent.
 *
 * The plan is edited in place, never regenerated: the week is already underway
 * and every other day stays exactly as the athlete planned around it.
 */
import type { PlanDayType, WeeklyPlanData, WeeklyPlanDay } from "@/types";
import type { ReadinessVerdict } from "@/lib/readiness";

export type SwapKind = "easy" | "tomorrow";

export interface SwapRecord {
  kind: SwapKind;
  reason: string;
  /** ISO timestamp of the swap. */
  at: string;
  /** Today's session as it was — restored on undo. */
  original: WeeklyPlanDay;
  /** Tomorrow's session as it was, for a `tomorrow` swap. */
  originalTomorrow?: WeeklyPlanDay;
}

export interface SwapOffer {
  options: SwapKind[];
  /** Today was already swapped; the only move left is to put it back. */
  undo: boolean;
}

const DAY_ORDER: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Sessions worth protecting a recovering body from. A race is never swapped. */
export const HARD_SESSION: ReadonlySet<PlanDayType> = new Set<PlanDayType>(["intervals", "tempo", "test", "hiit", "long_run"]);
const LIGHT_SESSION: ReadonlySet<PlanDayType> = new Set<PlanDayType>(["rest", "easy", "recovery", "strength"]);

const dayAt = (plan: WeeklyPlanData, key: WeeklyPlanDay["day"] | undefined) =>
  key ? plan.days.find(d => d.day === key) ?? null : null;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Whether today's session can trade places with tomorrow's. */
export function canMoveToTomorrow(plan: WeeklyPlanData, todayKey: WeeklyPlanDay["day"]): boolean {
  const i = DAY_ORDER.indexOf(todayKey);
  // Sunday's tomorrow is next week's plan, which may not exist and is not this
  // week's to rearrange.
  if (i < 0 || i >= DAY_ORDER.length - 1) return false;
  const tomorrow = dayAt(plan, DAY_ORDER[i + 1]);
  if (!tomorrow || !LIGHT_SESSION.has(tomorrow.type) || tomorrow.swap) return false;
  const after = dayAt(plan, DAY_ORDER[i + 2]);
  return !(after && HARD_SESSION.has(after.type));
}

/** What the athlete may do with today's session, if anything. */
export function swapOffer(input: {
  plan: WeeklyPlanData | null;
  todayKey: WeeklyPlanDay["day"];
  verdict: ReadinessVerdict | null;
  /** The session is already done — nothing left to swap. */
  done: boolean;
}): SwapOffer | null {
  if (!input.plan) return null;
  const today = dayAt(input.plan, input.todayKey);
  if (!today) return null;
  if (today.swap) return { options: [], undo: true };
  if (input.done || input.verdict !== "baixa" || !HARD_SESSION.has(today.type)) return null;
  const options: SwapKind[] = ["easy"];
  if (canMoveToTomorrow(input.plan, input.todayKey)) options.push("tomorrow");
  return { options, undo: false };
}

/** The easy run that stands in for a hard session. */
export function easyReplacement(planned: WeeklyPlanDay, plan: WeeklyPlanData): WeeklyPlanDay {
  // The week's own easy pace, so the replacement is prescribed like any other easy day.
  const template = plan.days.find(d => (d.type === "easy" || d.type === "recovery") && d.pace && !d.swap);
  const distance = planned.distance_km != null ? Math.max(4, Math.round(planned.distance_km * 0.5)) : null;
  return {
    day: planned.day,
    dayPt: planned.dayPt,
    type: "easy",
    sport: planned.sport ?? "corrida",
    label: "Rodagem leve",
    ...(distance != null
      ? { distance_km: distance }
      : { duration_min: Math.max(25, Math.round((planned.duration_min ?? 40) * 0.6)) }),
    ...(template?.pace ? { pace: template.pace } : {}),
    description:
      `Troca de hoje por recuperação baixa: leve de verdade, dá para conversar. ` +
      `${planned.label} não precisa ser reposto — um estímulo a menos não custa nada, ` +
      `um treino forte sem recuperação custa.`,
  };
}

export function applySwap(
  plan: WeeklyPlanData,
  todayKey: WeeklyPlanDay["day"],
  kind: SwapKind,
  reason: string,
  at: string = new Date().toISOString(),
): { plan: WeeklyPlanData } | { error: string } {
  const next = clone(plan);
  const i = next.days.findIndex(d => d.day === todayKey);
  if (i < 0) return { error: "Hoje não está no plano desta semana." };

  const original = next.days[i];
  if (original.swap) return { error: "O treino de hoje já foi trocado." };

  if (kind === "easy") {
    next.days[i] = { ...easyReplacement(original, next), swap: { kind, reason, at, original } };
    return { plan: next };
  }

  if (!canMoveToTomorrow(next, todayKey)) {
    return { error: "Amanhã não dá para receber este treino sem colar dois dias fortes." };
  }
  const j = next.days.findIndex(d => d.day === DAY_ORDER[DAY_ORDER.indexOf(todayKey) + 1]);
  const tomorrow = next.days[j];

  // Sessions move; the calendar slots they sit in do not.
  next.days[i] = {
    ...tomorrow, day: original.day, dayPt: original.dayPt,
    swap: { kind, reason, at, original, originalTomorrow: tomorrow },
  };
  next.days[j] = { ...original, day: tomorrow.day, dayPt: tomorrow.dayPt, movedFrom: original.dayPt };
  return { plan: next };
}

export function undoSwap(
  plan: WeeklyPlanData,
  todayKey: WeeklyPlanDay["day"],
): { plan: WeeklyPlanData } | { error: string } {
  const next = clone(plan);
  const i = next.days.findIndex(d => d.day === todayKey);
  const record = i >= 0 ? next.days[i].swap : undefined;
  if (!record) return { error: "Não há troca para desfazer hoje." };

  next.days[i] = record.original;
  if (record.kind === "tomorrow" && record.originalTomorrow) {
    const j = next.days.findIndex(d => d.day === record.originalTomorrow!.day);
    if (j >= 0) next.days[j] = record.originalTomorrow;
  }
  return { plan: next };
}

/** The plan's day key for a calendar date (YYYY-MM-DD). */
export function dayKeyOf(date: string): WeeklyPlanDay["day"] {
  const js = new Date(`${date}T12:00:00Z`).getUTCDay();   // 0 = Sunday
  return DAY_ORDER[(js + 6) % 7];
}
