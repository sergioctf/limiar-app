/**
 * Personal records for the dashboard, and how they are trending month to month.
 *
 * This used to answer a subtly different question from the records card in the
 * coach, and the two disagreed on screen. The old rule was: take every activity
 * whose *total* distance is within ±8% of the target and report the best
 * average pace among them. That is wrong in two directions at once.
 *
 *   • It **overstated**. A 9.2 km run qualified as a "10K", and its average
 *     pace — held over 800 fewer metres — became the 10 km record. Records
 *     should never be easier than the distance they claim.
 *   • It **understated**, badly. It could only see whole activities, so Sérgio's
 *     5 km record read 5:57/km from a 5.01 km run, while he had actually
 *     covered 5 km at 5:19/km inside a long run. 38 s/km of real fitness,
 *     invisible.
 *
 * So the truth now comes from one place: the best-effort windows computed from
 * activity streams (`lib/best-efforts.ts`), which search inside every run. Where
 * a run has no streams cached, a whole activity can still stand in — but only
 * under a rule that cannot overstate: the activity must be at least as long as
 * the target, so its time is an upper bound on what the athlete would have run
 * for the target distance.
 *
 * Both the record and the monthly comparison are built from the same candidate
 * list, so the trend can never contradict the record above it.
 */
import type { Run } from "@/types";
import { secondsToPaceString } from "./utils";
import { buildCandidates, type StoredEffort } from "./records";

export interface RecordMark {
  date: string;
  /** Seconds for the distance, on the race clock. */
  seconds: number;
  /** Formatted m:ss or h:mm:ss. */
  time: string;
  pace: string;          // min:sec/km
  paceSeconds: number;
  /** True when carved out of an activity of a different length. */
  fromInsideRun: boolean;
  /** Length of the activity it came from, km. */
  activityKm: number | null;
}

export interface DistanceRecord {
  distance: number;      // km (5, 10, 21.1, 42.2)
  label: string;
  personalBest?: RecordMark;
  thisMonth?: RecordMark;
  lastMonth?: RecordMark;
  trend?: "up" | "down" | "same";   // improvement = "up"
  improvement?: string;
}

/** One stream-derived effort, as stored in `run_best_efforts`. */
export type EffortLite = StoredEffort;

const DISTANCES = [
  { distance: 5,    metres: 5000,  label: "5K" },
  { distance: 10,   metres: 10000, label: "10K" },
  { distance: 21.1, metres: 21097, label: "Meia-maratona" },
  { distance: 42.2, metres: 42195, label: "Maratona" },
];

const hms = (s: number): string =>
  s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

interface Candidate {
  date: string;
  seconds: number;
  fromInsideRun: boolean;
  activityKm: number | null;
}

function toMark(c: Candidate, distanceKm: number): RecordMark {
  const paceSeconds = Math.round(c.seconds / distanceKm);
  return {
    date: c.date,
    seconds: c.seconds,
    time: hms(c.seconds),
    pace: secondsToPaceString(paceSeconds),
    paceSeconds,
    fromInsideRun: c.fromInsideRun,
    activityKm: c.activityKm,
  };
}

/**
 * Build records and month-over-month comparisons.
 *
 * `efforts` is optional so the dashboard still renders something before the
 * stream-derived records have loaded — it simply falls back to whole activities,
 * under the conservative rule.
 */
export function analyzeHistoricalComparison(
  runs: Run[],
  efforts: EffortLite[] = [],
): DistanceRecord[] {
  if (!runs || runs.length === 0) return [];

  const runById = new Map(runs.map(r => [r.id, r]));

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

  // One candidate list for the whole app — see lib/records.ts. Building it here
  // instead of re-deriving the rule is what keeps this card and the coach's
  // records card from disagreeing about the same athlete.
  const all = buildCandidates(runs, efforts);

  return DISTANCES.map(({ distance, metres, label }) => {
    const candidates: Candidate[] = all
      .filter(c => c.distanceM === metres)
      .map(c => ({
        date: c.date,
        seconds: c.seconds,
        fromInsideRun: c.fromInsideRun ?? false,
        activityKm: c.activityKm ?? null,
      }));

    if (candidates.length === 0) return { distance, label };

    const fastest = (list: Candidate[]): Candidate | null =>
      list.length
        ? list.reduce((a, b) => (b.seconds < a.seconds || (b.seconds === a.seconds && b.date < a.date) ? b : a))
        : null;

    const best      = fastest(candidates)!;
    const thisMonth = fastest(candidates.filter(c => c.date >= thisMonthStart));
    const lastMonth = fastest(candidates.filter(c => c.date >= lastMonthStart && c.date <= lastMonthEnd));

    const record: DistanceRecord = {
      distance,
      label,
      personalBest: toMark(best, distance),
      thisMonth: thisMonth ? toMark(thisMonth, distance) : undefined,
      lastMonth: lastMonth ? toMark(lastMonth, distance) : undefined,
    };

    if (record.thisMonth && record.lastMonth) {
      // Positive diff = this month is faster.
      const diff = record.lastMonth.paceSeconds - record.thisMonth.paceSeconds;
      record.trend = diff > 5 ? "up" : diff < -5 ? "down" : "same";
      if (Math.abs(diff) > 0.1) {
        const sign = diff > 0 ? "-" : "+";
        const mins = Math.floor(Math.abs(diff) / 60);
        const secs = Math.round(Math.abs(diff) % 60);
        record.improvement = mins > 0
          ? `${sign}${mins}m${secs}s/km`
          : `${sign}${Math.round(Math.abs(diff))}s/km`;
      }
    }

    return record;
  });
}
