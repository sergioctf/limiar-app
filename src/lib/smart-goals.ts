/**
 * Smart Goals — generate realistic race goal suggestions from the athlete's
 * current fitness (latest 3km test → VDOT → Riegel predictions).
 *
 * For each standard race distance we propose three scenarios:
 *   • "Forma atual"   — the Riegel prediction at current fitness (baseline)
 *   • "Meta realista" — ~3% faster, achievable with ~8-12 weeks of focused training
 *   • "Meta ambiciosa"— ~6% faster, a stretch goal
 */
import type { PerformanceTest } from "@/types";
import { computeMetrics } from "./performance";

export type GoalConfidence = "alta" | "média" | "baixa";

export interface GoalScenario {
  key: "current" | "realistic" | "ambitious";
  label: string;
  timeSeconds: number;
  paceSecPerKm: number;
  deltaPct: number; // 0, -3, -6 (negative = faster)
}

export interface SmartGoalSuggestion {
  distanceKm: number;
  label: string;
  confidence: GoalConfidence;
  current: GoalScenario;
  realistic: GoalScenario;
  ambitious: GoalScenario;
}

const DISTANCES: Array<{ km: number; label: string }> = [
  { km: 5,    label: "5 km" },
  { km: 10,   label: "10 km" },
  { km: 21.1, label: "Meia-maratona" },
  { km: 42.2, label: "Maratona" },
];

/** Confidence degrades as we extrapolate further from the (short) test distance. */
function confidenceFor(testKm: number, targetKm: number): GoalConfidence {
  const ratio = targetKm / testKm;
  if (ratio <= 4) return "alta";
  if (ratio <= 8) return "média";
  return "baixa";
}

function scenario(
  key: GoalScenario["key"],
  label: string,
  baseTimeSeconds: number,
  distanceKm: number,
  deltaPct: number,
): GoalScenario {
  const timeSeconds = Math.round(baseTimeSeconds * (1 + deltaPct / 100));
  return {
    key,
    label,
    timeSeconds,
    paceSecPerKm: Math.round(timeSeconds / distanceKm),
    deltaPct,
  };
}

/**
 * Generate smart goal suggestions from the latest performance test.
 * Returns [] if no valid test is provided.
 */
export function generateSmartGoals(test: PerformanceTest | null): SmartGoalSuggestion[] {
  if (!test || !test.distance_km || !test.time_seconds) return [];

  const metrics = computeMetrics(
    test.distance_km * 1000,
    test.time_seconds,
    test.avg_hr ?? undefined,
  );

  return DISTANCES.map(({ km, label }) => {
    const pred = metrics.predictions.find(p => p.distance_km === km);
    if (!pred) return null;

    const base = pred.predicted_seconds;
    return {
      distanceKm: km,
      label,
      confidence: confidenceFor(test.distance_km, km),
      current:   scenario("current",   "Forma atual",    base, km, 0),
      realistic: scenario("realistic", "Meta realista",  base, km, -3),
      ambitious: scenario("ambitious", "Meta ambiciosa", base, km, -6),
    } satisfies SmartGoalSuggestion;
  }).filter((s): s is SmartGoalSuggestion => s !== null);
}

/** Human-readable VDOT context line for the suggestions header. */
export function vdotContext(test: PerformanceTest | null): { vdot: number; testLabel: string } | null {
  if (!test || !test.distance_km || !test.time_seconds) return null;
  const metrics = computeMetrics(test.distance_km * 1000, test.time_seconds, test.avg_hr ?? undefined);
  return {
    vdot: metrics.vdot,
    testLabel: `${test.distance_km} km`,
  };
}
