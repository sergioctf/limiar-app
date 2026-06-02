/**
 * Training load calculation: TSS, CTL, ATL, TSB
 *
 * CTL (Chronic Training Load) = 42-day EMA → "Fitness"
 * ATL (Acute Training Load)   = 7-day EMA  → "Fadiga"
 * TSB (Training Stress Balance) = CTL - ATL → "Forma"
 *
 * TSS is estimated from run data using:
 *   1. HR-based (best): duration_hours × (avg_hr/LTHR)² × 100
 *   2. Pace-based: duration_hours × (threshold_pace/avg_pace)² × 100
 *   3. Type heuristic: duration_hours × IF² × 100
 */

import type { Run } from "@/types";

// Intensity Factor by run type (fraction of threshold effort)
const TYPE_IF: Record<string, number> = {
  recovery:   0.60,
  easy:       0.70,
  steady:     0.80,
  long_run:   0.75,
  tempo:      0.90,
  intervals:  0.97,
  race:       1.00,
  progression: 0.85,
  other:      0.70,
};

/** Estimate TSS for a single run */
export function estimateTSS(
  run: Run,
  lthr?: number | null,
  thresholdPaceSecKm?: number | null,
): number {
  const durationHours = run.duration_seconds / 3600;
  if (durationHours <= 0) return 0;

  // HR-based (most accurate when we have LTHR)
  if (lthr && lthr > 0 && run.avg_hr && run.avg_hr > 0) {
    const hrIF = run.avg_hr / lthr;
    return Math.round(durationHours * hrIF * hrIF * 100 * 10) / 10;
  }

  // Pace-based (when threshold pace available)
  if (thresholdPaceSecKm && thresholdPaceSecKm > 0 && run.avg_pace_seconds_per_km && run.avg_pace_seconds_per_km > 0) {
    // Lower pace (faster) = higher IF; threshold at IF=1.0
    const paceIF = thresholdPaceSecKm / run.avg_pace_seconds_per_km;
    return Math.round(durationHours * paceIF * paceIF * 100 * 10) / 10;
  }

  // Type heuristic
  const ifVal = TYPE_IF[run.type] ?? 0.70;
  return Math.round(durationHours * ifVal * ifVal * 100 * 10) / 10;
}

// EMA decay constants
const K_CTL = 1 - Math.exp(-1 / 42); // ≈ 0.0235
const K_ATL = 1 - Math.exp(-1 / 7);  // ≈ 0.1335

export interface DailyLoad {
  date: string;   // YYYY-MM-DD
  tss:  number;
  ctl:  number;   // Fitness (chronic, 42-day)
  atl:  number;   // Fatigue (acute, 7-day)
  tsb:  number;   // Form = CTL - ATL
}

/**
 * Compute daily CTL/ATL/TSB for the last `daysBack` days.
 * Pre-warms CTL by walking from the earliest run (or 6 months before window start).
 */
export function computeTrainingLoad(
  runs: Run[],
  lthr?: number | null,
  thresholdPaceSecKm?: number | null,
  daysBack = 90,
): DailyLoad[] {
  if (runs.length === 0) return [];

  // Build TSS map: date → total TSS that day
  const tssMap: Record<string, number> = {};
  for (const run of runs) {
    const tss = estimateTSS(run, lthr, thresholdPaceSecKm);
    tssMap[run.date] = (tssMap[run.date] ?? 0) + tss;
  }

  // Window we want to return
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - daysBack + 1);

  // Pre-warm start: earliest run or 6 months before window, whichever is earlier
  const allDates  = Object.keys(tssMap).sort();
  const earliest  = allDates[0] ? new Date(allDates[0]) : windowStart;
  const prewarmStart = new Date(Math.min(earliest.getTime(), windowStart.getTime()));
  prewarmStart.setDate(prewarmStart.getDate() - 42); // extra 42 days to warm CTL

  let ctl = 0;
  let atl = 0;
  const result: DailyLoad[] = [];

  const current = new Date(prewarmStart);
  while (current <= today) {
    const dateStr = current.toISOString().slice(0, 10);
    const tss = tssMap[dateStr] ?? 0;

    // EMA update
    ctl = ctl + K_CTL * (tss - ctl);
    atl = atl + K_ATL * (tss - atl);

    if (current >= windowStart) {
      result.push({
        date: dateStr,
        tss:  Math.round(tss * 10) / 10,
        ctl:  Math.round(ctl * 10) / 10,
        atl:  Math.round(atl * 10) / 10,
        tsb:  Math.round((ctl - atl) * 10) / 10,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return result;
}

/** TSB interpretation label */
export function tsbLabel(tsb: number): { label: string; color: string; bg: string } {
  if (tsb >  15) return { label: "Muito descansado",  color: "text-cyan-400",   bg: "bg-cyan-500/10"   };
  if (tsb >   5) return { label: "Descansado ✓",     color: "text-green-400",  bg: "bg-green-500/10"  };
  if (tsb >  -5) return { label: "Equilíbrio ✓",     color: "text-green-400",  bg: "bg-green-500/10"  };
  if (tsb > -20) return { label: "Em treinamento",   color: "text-yellow-400", bg: "bg-yellow-500/10" };
  if (tsb > -35) return { label: "Fatigado",         color: "text-orange-400", bg: "bg-orange-500/10" };
  return               { label: "Overreaching ⚠",   color: "text-red-400",    bg: "bg-red-500/10"    };
}

/**
 * Calculate running streak: consecutive days with ≥1 run going backwards from today.
 */
export function computeRunStreak(runs: Run[]): number {
  if (runs.length === 0) return 0;
  const runDates = new Set(runs.map(r => r.date));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  const current = new Date(today);

  // If no run today, check if there was one yesterday (don't break streak for in-progress days)
  const todayStr = today.toISOString().slice(0, 10);
  if (!runDates.has(todayStr)) {
    current.setDate(current.getDate() - 1);
  }

  while (true) {
    const dateStr = current.toISOString().slice(0, 10);
    if (!runDates.has(dateStr)) break;
    streak++;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}

/**
 * Weekly volume for last N weeks, including current partial week.
 */
export function weeklyVolumeProgress(
  runs: Run[],
  targetKm: number,
): { thisWeek: number; lastWeek: number; targetKm: number; pct: number } {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysSinceMonday);
  thisMonday.setHours(0, 0, 0, 0);

  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const thisMondayStr = thisMonday.toISOString().slice(0, 10);
  const lastMondayStr = lastMonday.toISOString().slice(0, 10);

  const thisWeek = runs
    .filter(r => r.date >= thisMondayStr)
    .reduce((s, r) => s + r.distance_km, 0);

  const lastWeek = runs
    .filter(r => r.date >= lastMondayStr && r.date < thisMondayStr)
    .reduce((s, r) => s + r.distance_km, 0);

  return {
    thisWeek: Math.round(thisWeek * 10) / 10,
    lastWeek: Math.round(lastWeek * 10) / 10,
    targetKm,
    pct: targetKm > 0 ? Math.min(100, Math.round((thisWeek / targetKm) * 100)) : 0,
  };
}
