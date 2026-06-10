import type { Run } from "@/types";
import { secondsToPaceString } from "./utils";

export interface DistanceRecord {
  distance: number; // km (5, 10, 21.1, 42.2, etc)
  label: string; // "5K", "10K", "Meia-maratona", "Maratona"
  personalBest?: {
    date: string;
    pace: string; // min:sec/km
    paceSeconds: number;
    duration: number;
  };
  thisMonth?: {
    pace: string;
    paceSeconds: number;
  };
  lastMonth?: {
    pace: string;
    paceSeconds: number;
  };
  trend?: "up" | "down" | "same"; // improvement = down (faster)
  improvement?: string; // "-15 seg/km" ou "+5 seg/km"
}

const DISTANCES = [
  { distance: 5, label: "5K" },
  { distance: 10, label: "10K" },
  { distance: 21.1, label: "Meia-maratona" },
  { distance: 42.2, label: "Maratona" },
];

const TOLERANCE = 0.5; // ±0.5km to match distance category

/**
 * Analyze runs and generate historical comparisons (PRs, month-over-month)
 */
export function analyzeHistoricalComparison(runs: Run[]): DistanceRecord[] {
  if (!runs || runs.length === 0) return [];

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 10);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

  return DISTANCES.map(({ distance, label }) => {
    // Find all runs matching this distance (within tolerance)
    const matchingRuns = runs.filter(
      r => Math.abs(r.distance_km - distance) <= TOLERANCE
    );

    if (matchingRuns.length === 0) {
      return { distance, label };
    }

    // Personal Best (fastest pace overall)
    const bestRun = matchingRuns.reduce((best, run) => {
      const bestPace = best.avg_pace_seconds_per_km || Infinity;
      const runPace = run.avg_pace_seconds_per_km || Infinity;
      return runPace < bestPace ? run : best;
    });

    const record: DistanceRecord = {
      distance,
      label,
      personalBest: bestRun.avg_pace_seconds_per_km
        ? {
            date: bestRun.date,
            pace: secondsToPaceString(bestRun.avg_pace_seconds_per_km),
            paceSeconds: bestRun.avg_pace_seconds_per_km,
            duration: bestRun.duration_seconds,
          }
        : undefined,
    };

    // This month's best
    const thisMonthRuns = matchingRuns.filter(r => r.date >= thisMonthStart);
    if (thisMonthRuns.length > 0) {
      const bestThisMonth = thisMonthRuns.reduce((best, run) => {
        const bestPace = best.avg_pace_seconds_per_km || Infinity;
        const runPace = run.avg_pace_seconds_per_km || Infinity;
        return runPace < bestPace ? run : best;
      });
      record.thisMonth = {
        pace: secondsToPaceString(bestThisMonth.avg_pace_seconds_per_km || 0),
        paceSeconds: bestThisMonth.avg_pace_seconds_per_km || 0,
      };
    }

    // Last month's best
    const lastMonthRuns = matchingRuns.filter(
      r => r.date >= lastMonthStart && r.date <= lastMonthEnd
    );
    if (lastMonthRuns.length > 0) {
      const bestLastMonth = lastMonthRuns.reduce((best, run) => {
        const bestPace = best.avg_pace_seconds_per_km || Infinity;
        const runPace = run.avg_pace_seconds_per_km || Infinity;
        return runPace < bestPace ? run : best;
      });
      record.lastMonth = {
        pace: secondsToPaceString(bestLastMonth.avg_pace_seconds_per_km || 0),
        paceSeconds: bestLastMonth.avg_pace_seconds_per_km || 0,
      };
    }

    // Trend (this month vs last month)
    if (record.thisMonth && record.lastMonth) {
      const diff = record.lastMonth.paceSeconds - record.thisMonth.paceSeconds;
      record.trend = diff > 5 ? "up" : diff < -5 ? "down" : "same";
      if (Math.abs(diff) > 0.1) {
        const sign = diff > 0 ? "-" : "+";
        const mins = Math.floor(Math.abs(diff) / 60);
        const secs = Math.round(Math.abs(diff) % 60);
        if (mins > 0) {
          record.improvement = `${sign}${mins}m${secs}s/km`;
        } else {
          record.improvement = `${sign}${Math.round(Math.abs(diff))}s/km`;
        }
      }
    }

    return record;
  });
}
