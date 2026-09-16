/**
 * Helpers shared by notify-morning and notify-evening crons.
 * Extracts the workout for a given date from the saved weekly plan.
 *
 * IMPORTANT: everything here reads the calendar in São Paulo time, not UTC.
 * The evening cron fires at 01:00 UTC, which is 22:00 BRT of the PREVIOUS day —
 * deriving "tomorrow" from the UTC date there skips a day and announces the
 * wrong workout.
 */
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const DAY_MAP: Record<number, WeeklyPlanDay["day"]> = {
  0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat",
};

/** Brazil dropped DST in 2019, so BRT is a fixed UTC-3 all year. */
const BRT_OFFSET_MS = -3 * 3600_000;

/**
 * Shift an instant so the `getUTC*` accessors read the São Paulo wall clock.
 * Use this for every "what day is it for the athlete" decision.
 */
export function toBrt(d: Date = new Date()): Date {
  return new Date(d.getTime() + BRT_OFFSET_MS);
}

/** The athlete's local date, N days from now (0 = today, 1 = tomorrow). */
export function brtDateIn(days: number, from: Date = new Date()): Date {
  return new Date(toBrt(from).getTime() + days * 86400_000);
}

/** Calendar date (YYYY-MM-DD) in São Paulo time. */
export function brtDateStr(d: Date = new Date()): string {
  return toBrt(d).toISOString().slice(0, 10);
}

/**
 * Returns the Monday (YYYY-MM-DD) of a given date.
 * Pass a BRT-shifted date (see `toBrt`) so the week matches the athlete's.
 */
export function getMondayStr(d: Date): string {
  const day = new Date(d);
  const dow = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - dow);
  return day.toISOString().slice(0, 10);
}

/** Returns the WeeklyPlanDay for a specific date, or null */
export function getWorkoutForDate(
  admin: { from: (t: string) => unknown },
  plans: Array<{ full_report: string | null; period_start: string }>,
  targetDate: Date,
): WeeklyPlanDay | null {
  const mondayStr = getMondayStr(targetDate);
  const plan = plans.find(p => p.period_start === mondayStr);
  if (!plan?.full_report) return null;

  try {
    const data = JSON.parse(plan.full_report) as WeeklyPlanData;
    if (!Array.isArray(data.days)) return null;
    const dayKey = DAY_MAP[targetDate.getUTCDay()];
    return data.days.find(d => d.day === dayKey) ?? null;
  } catch {
    return null;
  }
}

/** Formats a workout day into a notification title + body */
export function formatWorkoutNotification(
  workout: WeeklyPlanDay,
  prefix: string, // "Hoje" or "Amanhã"
): { title: string; body: string; url: string; tag: string } {
  const lifting = workout.strength?.exercises.length ?? 0;

  /*
   * Rest means nothing scheduled — not merely `type === "rest"`.
   *
   * A day can carry a lifting session while still typed as rest (moving the
   * musculação onto a free day used to produce exactly that), and reading the
   * type alone announced "Amanhã: Descanso" the night before a session the
   * athlete had four exercises waiting in. The notification is the message
   * someone acts on without opening the app, so it checks what is actually
   * there.
   */
  const isRest     = workout.type === "rest" && lifting === 0;
  const distStr    = workout.distance_km != null ? ` · ${workout.distance_km}km` : "";
  const durStr     = workout.duration_min != null && !distStr ? ` · ${workout.duration_min}min` : "";
  const paceStr    = workout.pace ? ` · ${workout.pace}` : "";

  // A run and a lifting session on the same day is normal here, and the one
  // that was never mentioned is the one that gets skipped.
  const alsoLifting = lifting > 0 && workout.sport !== "musculacao" && workout.type !== "rest"
    ? " + Musculação"
    : "";

  const label = workout.type === "rest" && lifting > 0 ? "Musculação" : workout.label;

  const title = isRest
    ? `${prefix}: Descanso`
    : `${prefix}: ${label}${distStr}${durStr}${alsoLifting}`;

  const liftingNote = lifting > 0 ? ` Musculação: ${lifting} exercícios.` : "";

  /*
   * The lifting note survives truncation.
   *
   * A lock screen shows about 120 characters, and appending the note before
   * cutting meant the very thing this fix exists to announce was the first
   * thing dropped on a wordy interval day. Trim the description instead, and
   * add the note to what is left.
   */
  const BODY_MAX = 120;
  const lead = `${workout.type === "rest" ? "" : workout.description}${paceStr}`.trim();

  const body = isRest
    ? "Dia de recuperação — aproveite para descansar bem."
    : `${lead.slice(0, Math.max(0, BODY_MAX - liftingNote.length))}${liftingNote}`.trim();

  return {
    title,
    body,
    url:  "/coach",
    tag:  `limiar-workout-${workout.day}`,
  };
}
