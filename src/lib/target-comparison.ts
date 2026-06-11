/**
 * Target Race Comparison — measures the gap between the athlete's current
 * fitness (latest 3km test → VDOT → Riegel prediction at the goal distance)
 * and a goal's target time/pace.
 */
import type { Goal, PerformanceTest } from "@/types";
import { computeMetrics } from "./performance";

export type TargetStatus = "ahead" | "on_track" | "slightly_behind" | "behind";

export interface TargetComparison {
  goalId: string;
  raceName: string;
  distanceKm: number;
  raceDate: string | null;
  daysUntil: number | null;

  targetTimeSeconds: number;
  targetPaceSecPerKm: number;

  currentTimeSeconds: number;   // predicted from current fitness
  currentPaceSecPerKm: number;

  gapSecPerKm: number;          // positive = must get faster
  gapSeconds: number;           // total time to shave off
  status: TargetStatus;
}

function statusFor(gapSecPerKm: number): TargetStatus {
  if (gapSecPerKm <= 0) return "ahead";
  if (gapSecPerKm <= 5) return "on_track";
  if (gapSecPerKm <= 15) return "slightly_behind";
  return "behind";
}

/**
 * Compare a single goal (with a target time) against current fitness.
 * Returns null if the goal has no target time or no test is available.
 */
export function compareToTarget(goal: Goal, test: PerformanceTest | null): TargetComparison | null {
  if (!test || !goal.target_time_seconds || !goal.distance_km) return null;

  const metrics = computeMetrics(
    test.distance_km * 1000,
    test.time_seconds,
    test.avg_hr ?? undefined,
  );

  // Predicted time at the goal distance (Riegel). Fall back to interpolation
  // if the exact distance isn't one of the standard predictions.
  const pred = metrics.predictions.find(p => Math.abs(p.distance_km - goal.distance_km) < 0.6);
  const currentTimeSeconds = pred
    ? pred.predicted_seconds
    // Riegel directly from the test for non-standard distances
    : Math.round(test.time_seconds * Math.pow((goal.distance_km * 1000) / (test.distance_km * 1000), 1.06));

  const targetPace = Math.round(goal.target_time_seconds / goal.distance_km);
  const currentPace = Math.round(currentTimeSeconds / goal.distance_km);
  const gapSecPerKm = currentPace - targetPace;

  let daysUntil: number | null = null;
  if (goal.race_date) {
    const race = new Date(`${goal.race_date}T12:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    daysUntil = Math.round((race.getTime() - today.getTime()) / 86400000);
  }

  return {
    goalId: goal.id,
    raceName: goal.race_name,
    distanceKm: goal.distance_km,
    raceDate: goal.race_date,
    daysUntil,
    targetTimeSeconds: goal.target_time_seconds,
    targetPaceSecPerKm: targetPace,
    currentTimeSeconds,
    currentPaceSecPerKm: currentPace,
    gapSecPerKm,
    gapSeconds: currentTimeSeconds - goal.target_time_seconds,
    status: statusFor(gapSecPerKm),
  };
}

/** Pick the most relevant goal to compare: nearest upcoming race with a target time. */
export function pickTargetComparison(goals: Goal[], test: PerformanceTest | null): TargetComparison | null {
  if (!test) return null;
  const candidates = goals
    .filter(g => g.target_time_seconds && g.distance_km)
    .map(g => compareToTarget(g, test))
    .filter((c): c is TargetComparison => c !== null);

  if (candidates.length === 0) return null;

  // Prefer goals with an upcoming race date (soonest first), then those without dates.
  const dated = candidates
    .filter(c => c.daysUntil !== null && c.daysUntil >= 0)
    .sort((a, b) => (a.daysUntil! - b.daysUntil!));
  if (dated.length > 0) return dated[0];

  return candidates[0];
}
