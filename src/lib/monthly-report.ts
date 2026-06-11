/**
 * Monthly Report — aggregates a single month of runs into a printable summary.
 */
import type { Run } from "@/types";

export interface MonthlyReportData {
  monthKey: string;        // "2026-06"
  monthLabel: string;      // "Junho de 2026"
  runCount: number;
  totalKm: number;
  durationSeconds: number;
  avgPaceSecPerKm: number | null;
  longest: { km: number; date: string } | null;
  bestPace: { paceSecPerKm: number; km: number; date: string } | null;
  elevationM: number;
  calories: number;
  activeDays: number;
  // vs previous month
  prevTotalKm: number;
  deltaPct: number | null;
  // weekly breakdown within the month
  weeks: Array<{ label: string; km: number }>;
  // run type distribution
  typeBreakdown: Array<{ type: string; count: number; km: number }>;
}

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TYPE_LABELS: Record<string, string> = {
  easy: "Rodagem", long_run: "Longão", tempo: "Tempo", intervals: "Intervalado",
  race: "Prova", recovery: "Regenerativo", steady: "Contínuo", progression: "Progressivo", other: "Outro",
};

export function runTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

/** List of available month keys (most recent first) from a runs array. */
export function availableMonths(runs: Run[]): Array<{ key: string; label: string }> {
  const keys = new Set<string>();
  for (const r of runs) keys.add(r.date.slice(0, 7));
  return Array.from(keys).sort().reverse().map(key => {
    const [y, m] = key.split("-").map(Number);
    return { key, label: `${MONTHS_PT[m - 1]} de ${y}` };
  });
}

export function buildMonthlyReport(runs: Run[], monthKey: string): MonthlyReportData {
  const [year, month] = monthKey.split("-").map(Number);
  const monthRuns = runs.filter(r => r.date.slice(0, 7) === monthKey);

  // previous month key
  const prevDate = new Date(year, month - 2, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const prevRuns = runs.filter(r => r.date.slice(0, 7) === prevKey);

  const totalKm = monthRuns.reduce((s, r) => s + r.distance_km, 0);
  const prevTotalKm = prevRuns.reduce((s, r) => s + r.distance_km, 0);
  const durationSeconds = monthRuns.reduce((s, r) => s + r.duration_seconds, 0);
  const elevationM = monthRuns.reduce((s, r) => s + (r.elevation_gain_m ?? 0), 0);
  const calories = monthRuns.reduce((s, r) => s + (r.calories ?? 0), 0);

  const longest = monthRuns.reduce<{ km: number; date: string } | null>((best, r) =>
    !best || r.distance_km > best.km ? { km: r.distance_km, date: r.date } : best, null);

  const bestPace = monthRuns
    .filter(r => r.avg_pace_seconds_per_km && r.distance_km >= 1)
    .reduce<{ paceSecPerKm: number; km: number; date: string } | null>((best, r) =>
      !best || (r.avg_pace_seconds_per_km! < best.paceSecPerKm)
        ? { paceSecPerKm: r.avg_pace_seconds_per_km!, km: r.distance_km, date: r.date }
        : best, null);

  const activeDays = new Set(monthRuns.map(r => r.date)).size;

  // Weekly breakdown (ISO-ish: group by week-of-month starting day 1)
  const weeks: Array<{ label: string; km: number }> = [];
  for (let w = 0; w < 5; w++) {
    const startDay = w * 7 + 1;
    const endDay = startDay + 6;
    const km = monthRuns
      .filter(r => { const d = Number(r.date.slice(8, 10)); return d >= startDay && d <= endDay; })
      .reduce((s, r) => s + r.distance_km, 0);
    if (km > 0 || w < 4) weeks.push({ label: `Sem ${w + 1}`, km: Math.round(km * 10) / 10 });
  }

  // Type breakdown
  const typeMap = new Map<string, { count: number; km: number }>();
  for (const r of monthRuns) {
    const cur = typeMap.get(r.type) ?? { count: 0, km: 0 };
    cur.count += 1; cur.km += r.distance_km;
    typeMap.set(r.type, cur);
  }
  const typeBreakdown = Array.from(typeMap.entries())
    .map(([type, v]) => ({ type, count: v.count, km: Math.round(v.km * 10) / 10 }))
    .sort((a, b) => b.km - a.km);

  return {
    monthKey,
    monthLabel: `${MONTHS_PT[month - 1]} de ${year}`,
    runCount: monthRuns.length,
    totalKm: Math.round(totalKm * 10) / 10,
    durationSeconds,
    avgPaceSecPerKm: totalKm > 0 ? Math.round(durationSeconds / totalKm) : null,
    longest: longest ? { km: Math.round(longest.km * 10) / 10, date: longest.date } : null,
    bestPace,
    elevationM: Math.round(elevationM),
    calories: Math.round(calories),
    activeDays,
    prevTotalKm: Math.round(prevTotalKm * 10) / 10,
    deltaPct: prevTotalKm > 0 ? Math.round(((totalKm - prevTotalKm) / prevTotalKm) * 100) : null,
    weeks,
    typeBreakdown,
  };
}
