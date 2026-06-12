/**
 * Aerobic efficiency trend — Efficiency Factor (EF) = speed (m/min) ÷ HR,
 * averaged per week over easy-effort runs. A rising EF means the athlete
 * runs faster at the same heart rate: the clearest signal of aerobic gains.
 * Deterministic — no AI involved.
 */

export interface EfficiencyPoint {
  weekStart: string;  // Monday YYYY-MM-DD
  ef: number;         // m/min per bpm
  runs: number;
}

export type EfficiencyVerdict = "improving" | "stable" | "declining" | "insufficient";

export interface EfficiencyTrend {
  points: EfficiencyPoint[];
  pctChange: number | null;          // last 3 weeks vs first 3 weeks
  paceDeltaSecPerKm: number | null;  // negative = faster at iso-HR
  weeksSpanned: number;
  verdict: EfficiencyVerdict;
}

interface RunForEF {
  date: string;
  distance_km: number;
  avg_pace_seconds_per_km: number | null;
  avg_hr: number | null;
  type?: string;
}

const EASY_TYPES = new Set(["easy", "recovery", "steady", "long_run"]);

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function computeAerobicEfficiency(runs: RunForEF[], maxWeeks = 12): EfficiencyTrend {
  const valid = runs.filter(r =>
    r.avg_hr != null && r.avg_hr >= 90 &&
    r.avg_pace_seconds_per_km != null && r.avg_pace_seconds_per_km > 120 &&
    r.distance_km >= 3
  );

  // Prefer easy-effort runs (apples to apples); fall back to all if too few
  const easy = valid.filter(r => !r.type || EASY_TYPES.has(r.type));
  const pool = easy.length >= 6 ? easy : valid;

  // Weekly average EF
  const byWeek = new Map<string, { efSum: number; paceSum: number; n: number }>();
  for (const r of pool) {
    const week = mondayOf(r.date);
    const speedMmin = (1000 / r.avg_pace_seconds_per_km!) * 60;
    const ef = speedMmin / r.avg_hr!;
    const entry = byWeek.get(week) ?? { efSum: 0, paceSum: 0, n: 0 };
    entry.efSum += ef;
    entry.paceSum += r.avg_pace_seconds_per_km!;
    entry.n++;
    byWeek.set(week, entry);
  }

  const points: EfficiencyPoint[] = Array.from(byWeek.entries())
    .map(([weekStart, e]) => ({
      weekStart,
      ef: Math.round((e.efSum / e.n) * 1000) / 1000,
      runs: e.n,
    }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
    .slice(-maxWeeks);

  if (points.length < 4) {
    return { points, pctChange: null, paceDeltaSecPerKm: null, weeksSpanned: points.length, verdict: "insufficient" };
  }

  const head = points.slice(0, 3);
  const tail = points.slice(-3);
  const headAvg = head.reduce((s, p) => s + p.ef, 0) / head.length;
  const tailAvg = tail.reduce((s, p) => s + p.ef, 0) / tail.length;
  const pctChange = ((tailAvg - headAvg) / headAvg) * 100;

  // Translate EF gain into pace at iso-HR: pace scales inversely with EF
  const meanPace = pool.reduce((s, r) => s + r.avg_pace_seconds_per_km!, 0) / pool.length;
  const paceDeltaSecPerKm = -Math.round(meanPace * (pctChange / 100));

  const verdict: EfficiencyVerdict =
    pctChange > 2 ? "improving" : pctChange < -2 ? "declining" : "stable";

  return {
    points,
    pctChange: Math.round(pctChange * 10) / 10,
    paceDeltaSecPerKm,
    weeksSpanned: points.length,
    verdict,
  };
}
