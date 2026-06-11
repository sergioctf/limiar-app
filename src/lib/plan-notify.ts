/**
 * Helpers shared by notify-morning and notify-evening crons.
 * Extracts the workout for a given date from the saved weekly plan.
 */
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const DAY_MAP: Record<number, WeeklyPlanDay["day"]> = {
  0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat",
};

/** Returns the Monday (YYYY-MM-DD) of a given date */
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
  const isRest     = workout.type === "rest";
  const distStr    = workout.distance_km != null ? ` · ${workout.distance_km}km` : "";
  const durStr     = workout.duration_min != null && !distStr ? ` · ${workout.duration_min}min` : "";
  const paceStr    = workout.pace ? ` · ${workout.pace}` : "";

  const title = isRest
    ? `${prefix}: Descanso`
    : `${prefix}: ${workout.label}${distStr}${durStr}`;

  const body = isRest
    ? "Dia de recuperação — aproveite para descansar bem."
    : `${workout.description}${paceStr}`.slice(0, 120);

  return {
    title,
    body,
    url:  "/coach",
    tag:  `limiar-workout-${workout.day}`,
  };
}
