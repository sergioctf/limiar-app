/**
 * Plan adherence — compares the AI weekly plan (coach_reports, period_type
 * 'week') against what the athlete actually did (runs + gym activities).
 * Fully deterministic: no AI calls.
 */
import { localDateStr } from "@/lib/week";
import { movingSeconds } from "@/lib/run-time";
import { adaptationApplies, dayStatus } from "@/lib/day-status";
import type { SessionActivityLink } from "@/lib/session-activity-link";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

export type DayStatus = "done" | "partial" | "adapted" | "missed" | "rest_ok" | "extra" | "upcoming" | "unresolved";

export interface DayAdherence {
  day: WeeklyPlanDay["day"];
  dayPt: string;
  date: string;             // YYYY-MM-DD
  planned: WeeklyPlanDay;
  actualKm: number;
  actualMin: number;
  longestRunKm?: number;
  status: DayStatus;
}

export interface WeekAdherence {
  weekStart: string;        // Monday YYYY-MM-DD
  days: DayAdherence[];
  /**
   * 0–100 across past planned workout days: done = 1, partial = 0.5,
   * adapted = 1 when the swap kept the purpose of the session and 0.5 when it
   * did not. A session the athlete replaced is not a session he skipped — and
   * it is not a plan he followed either.
   */
  score: number | null;     // null when nothing was scheduled in the past yet
  doneCount: number;
  partialCount: number;
  adaptedCount: number;
  missedCount: number;
}

const DAY_ORDER: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/*
 * Moving time, not elapsed. The athlete who pauses at a red light, or between
 * reps of a track session, ran the workout that was prescribed — the stopped
 * seconds are not a training decision and must not read as one. Before this,
 * a session executed exactly as planned could come back "partial" purely
 * because of traffic.
 */
interface RunLite {
  id?: string;
  date: string;
  distance_km: number;
  duration_seconds: number;
  moving_time_seconds?: number | null;
  elapsed_time_seconds?: number | null;
}
interface ActivityLite { id?: string; date: string; sport_type: string; duration_seconds?: number | null; distance_m?: number | null }

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function todayStr(): string {
  return localDateStr();
}

/**
 * Compute adherence for one weekly plan.
 */
export function computeWeekAdherence(
  weekStart: string,
  plan: WeeklyPlanData,
  runs: RunLite[],
  activities: ActivityLite[],
  links: SessionActivityLink[] = [],
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
    const actualMin = dayRuns.reduce((s, r) => s + movingSeconds(r) / 60, 0);
    const day = dayStatus({ date, planned, runs: dayRuns, links,
      activities: activities.filter(a => a.date === date).map(a => ({ ...a, duration_seconds: a.duration_seconds ?? null })) });
    const main = day.sessions[0];
    const matched = day.done.find(d => d.planned && d.sport === main?.sport);
    const run = matched?.kind === "run" && matched.id ? dayRuns.find(r => r.id === matched.id) : null;
    const activity = matched?.kind === "activity" && matched.id ? activities.find(a => a.date === date && a.id === matched.id) : null;
    const matchedKm = run?.distance_km ?? (activity?.distance_m != null ? activity.distance_m / 1000 : matched?.km ?? 0);
    const matchedMin = run ? movingSeconds(run) / 60 : (activity?.duration_seconds ?? (matched?.minutes ?? 0) * 60) / 60;

    let status: DayStatus;
    const isFuture = date > today;

    if (day.sessions.some(s => s.unresolved)) {
      status = "unresolved";
    } else if (!main) {
      status = day.anyDone ? "extra" : isFuture ? "upcoming" : "rest_ok";
    } else if (main.sport === "musculacao") {
      status = main.done ? "done" : isFuture ? "upcoming" : "missed";
    } else {
      // Compare the planned session to its record, keeping total volume separate.
      const targetKm  = planned.distance_km ?? null;
      const targetMin = planned.duration_min ?? null;

      let ratio: number | null = null;
      if (targetKm && targetKm > 0 && matchedKm > 0) ratio = matchedKm / targetKm;
      else if (targetMin && targetMin > 0 && matchedMin > 0) ratio = matchedMin / targetMin;
      else if (matched) ratio = 1;

      if (ratio !== null && ratio >= 0.8)      status = "done";
      else if (ratio !== null && ratio > 0.25) status = "partial";
      else if (matched)                       status = "partial";
      else                                     status = isFuture ? "upcoming" : "missed";

      /*
       * A session declared different after the fact is neither a miss nor the
       * plan carried out: the day keeps its prescription and the run is shown
       * as what it was. Adaptations agreed *before* the run are the day's
       * prescription already, so they are compared normally.
       */
      if (planned.adaptation?.when === "after" && adaptationApplies(planned, day)) status = "adapted";
    }

    /*
     * O dia de hoje ainda não acabou — para qualquer esporte (dívida A12).
     *
     * Esta regra existia só no ramo da corrida, então uma quinta de musculação
     * aparecia "Perdido" às oito da manhã de quinta, com a academia marcada
     * para as oito da noite. O erro custava caro duas vezes: derrubava a
     * adesão da semana corrente e, desde 20/09, a IA central passou a repetir
     * esse número em voz alta.
     */
    if (status === "missed" && date === today) status = "upcoming";

    days.push({
      day: dayKey,
      dayPt: planned.dayPt,
      date,
      planned,
      actualKm: Math.round(actualKm * 10) / 10,
      actualMin: Math.round(actualMin),
      longestRunKm: Math.max(0, ...dayRuns.map(r => r.distance_km)),
      status,
    });
  }

  const doneCount    = days.filter(d => d.status === "done").length;
  const partialCount = days.filter(d => d.status === "partial").length;
  const adapted      = days.filter(d => d.status === "adapted");
  const missedCount  = days.filter(d => d.status === "missed").length;
  const adaptedCredit = adapted.reduce((s, d) => s + (d.planned.adaptation?.verdict === "equivalent" ? 1 : 0.5), 0);
  const scoredTotal  = doneCount + partialCount + adapted.length + missedCount;

  return {
    weekStart,
    days,
    score: scoredTotal > 0
      ? Math.round(((doneCount + partialCount * 0.5 + adaptedCredit) / scoredTotal) * 100)
      : null,
    doneCount,
    partialCount,
    adaptedCount: adapted.length,
    missedCount,
  };
}

/**
 * Build adherence for the current week + up to `weeksBack` previous weeks
 * from raw coach_reports rows.
 *
 * Semanas que ainda não começaram ficam de fora (dívida A11). O plano da
 * próxima semana costuma ser gerado no domingo, e a lista ordenada por data
 * entregava **ele** como "esta semana": sete dias "a fazer", adesão nula, e o
 * topo da página falando de outra semana. Não existe aderir a um plano que
 * ainda não começou — e agora a IA central também lê daqui.
 */
export function computeAdherenceHistory(
  weeklyReports: Array<{ period_start: string | null; full_report: string | null }>,
  runs: RunLite[],
  activities: ActivityLite[],
  weeksBack = 4,
  links: SessionActivityLink[] = [],
): WeekAdherence[] {
  const result: WeekAdherence[] = [];
  const today = todayStr();

  const sorted = [...weeklyReports]
    .filter(r => r.period_start && r.full_report && r.period_start <= today)
    .sort((a, b) => (b.period_start! > a.period_start! ? 1 : -1));

  for (const report of sorted.slice(0, weeksBack + 1)) {
    try {
      const plan = JSON.parse(report.full_report!) as WeeklyPlanData;
      const week = computeWeekAdherence(report.period_start!, plan, runs, activities, links);
      if (week) result.push(week);
    } catch {
      // malformed plan JSON — skip
    }
  }

  return result;
}
