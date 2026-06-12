/**
 * Plan adherence — compares the AI weekly plan (coach_reports, period_type
 * 'week') against what the athlete actually did (runs + gym activities).
 * Fully deterministic: no AI calls.
 */
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

export type DayStatus = "done" | "partial" | "missed" | "rest_ok" | "extra" | "upcoming";

export interface DayAdherence {
  day: WeeklyPlanDay["day"];
  dayPt: string;
  date: string;             // YYYY-MM-DD
  planned: WeeklyPlanDay;
  actualKm: number;
  actualMin: number;
  status: DayStatus;
}

export interface WeekAdherence {
  weekStart: string;        // Monday YYYY-MM-DD
  days: DayAdherence[];
  /** 0–100 across past planned workout days (done=1, partial=0.5) */
  score: number | null;     // null when nothing was scheduled in the past yet
  doneCount: number;
  partialCount: number;
  missedCount: number;
}

const DAY_ORDER: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const GYM_TYPES = ["weight", "workout", "crossfit", "gym"];

interface RunLite { date: string; distance_km: number; duration_seconds: number }
interface ActivityLite { date: string; sport_type: string }

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Compute adherence for one weekly plan.
 */
export function computeWeekAdherence(
  weekStart: string,
  plan: WeeklyPlanData,
  runs: RunLite[],
  activities: ActivityLite[],
): WeekAdherence | null {
  if (!Array.isArray(plan.days) || plan.days.length === 0) return null;

  const today = todayStr();
  const days: DayAdherence[] = [];

  for (let i = 0; i < DAY_ORDER.length; i++) {
    const dayKey = DAY_ORDER[i];
    const planned = plan.days.find(d => d.day === dayKey);
    if (!planned) continue;

    const date = addDays(weekStart, i);
    const dayRuns = runs.filter(r => r.date === date);
    const actualKm  = dayRuns.reduce((s, r) => s + r.distance_km, 0);
    const actualMin = dayRuns.reduce((s, r) => s + r.duration_seconds / 60, 0);
    const hasGym = activities.some(a =>
      a.date === date && GYM_TYPES.some(t => a.sport_type?.toLowerCase().includes(t))
    );

    let status: DayStatus;
    const isFuture = date > today;

    if (planned.type === "rest") {
      status = actualKm > 0 ? "extra" : isFuture ? "upcoming" : "rest_ok";
    } else if (planned.type === "strength") {
      status = hasGym || actualKm > 0 ? "done" : isFuture ? "upcoming" : "missed";
    } else {
      // Running workout — compare against the planned target
      const targetKm  = planned.distance_km ?? null;
      const targetMin = planned.duration_min ?? null;

      let ratio: number | null = null;
      if (targetKm && targetKm > 0)       ratio = actualKm / targetKm;
      else if (targetMin && targetMin > 0) ratio = actualMin / targetMin;
      else if (actualKm > 0)               ratio = 1; // no numeric target: any run counts

      if (ratio !== null && ratio >= 0.8)      status = "done";
      else if (ratio !== null && ratio > 0.25) status = "partial";
      else if (actualKm > 0)                   status = "partial";
      else                                     status = isFuture ? "upcoming" : "missed";

      // Today without a run yet: still pending, not missed
      if (status === "missed" && date === today) status = "upcoming";
    }

    days.push({
      day: dayKey,
      dayPt: planned.dayPt,
      date,
      planned,
      actualKm: Math.round(actualKm * 10) / 10,
      actualMin: Math.round(actualMin),
      status,
    });
  }

  const doneCount    = days.filter(d => d.status === "done").length;
  const partialCount = days.filter(d => d.status === "partial").length;
  const missedCount  = days.filter(d => d.status === "missed").length;
  const scoredTotal  = doneCount + partialCount + missedCount;

  return {
    weekStart,
    days,
    score: scoredTotal > 0
      ? Math.round(((doneCount + partialCount * 0.5) / scoredTotal) * 100)
      : null,
    doneCount,
    partialCount,
    missedCount,
  };
}

/**
 * Build adherence for the current week + up to `weeksBack` previous weeks
 * from raw coach_reports rows.
 */
export function computeAdherenceHistory(
  weeklyReports: Array<{ period_start: string | null; full_report: string | null }>,
  runs: RunLite[],
  activities: ActivityLite[],
  weeksBack = 4,
): WeekAdherence[] {
  const result: WeekAdherence[] = [];

  const sorted = [...weeklyReports]
    .filter(r => r.period_start && r.full_report)
    .sort((a, b) => (b.period_start! > a.period_start! ? 1 : -1));

  for (const report of sorted.slice(0, weeksBack + 1)) {
    try {
      const plan = JSON.parse(report.full_report!) as WeeklyPlanData;
      const week = computeWeekAdherence(report.period_start!, plan, runs, activities);
      if (week) result.push(week);
    } catch {
      // malformed plan JSON — skip
    }
  }

  return result;
}
