/**
 * Weekly Insights — a lightweight end-of-week recap computed from runs.
 * Used for the Sunday-night push notification and (optionally) in-app display.
 */
import type { Run } from "@/types";

export interface WeeklyInsights {
  weekStart: string;        // Monday YYYY-MM-DD
  totalKm: number;
  runCount: number;
  durationSeconds: number;
  longestKm: number;
  avgPaceSecPerKm: number | null;
  lastWeekKm: number;
  deltaPct: number | null;  // vs last week (null if no prior data)
}

/** Monday (local) of the week containing `ref`. */
function mondayOf(ref: Date): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();              // 0=Sun..6=Sat
  const diff = (dow + 6) % 7;          // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}

/**
 * Compute insights for the week containing `ref` (default: now).
 */
export function computeWeeklyInsights(runs: Run[], ref: Date = new Date()): WeeklyInsights {
  const thisMonday = mondayOf(ref);
  const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);

  const thisMondayStr = thisMonday.toISOString().slice(0, 10);
  const lastMondayStr = lastMonday.toISOString().slice(0, 10);

  const thisWeekRuns = runs.filter(r => r.date >= thisMondayStr);
  const lastWeekRuns = runs.filter(r => r.date >= lastMondayStr && r.date < thisMondayStr);

  const totalKm  = thisWeekRuns.reduce((s, r) => s + r.distance_km, 0);
  const lastWeekKm = lastWeekRuns.reduce((s, r) => s + r.distance_km, 0);
  const durationSeconds = thisWeekRuns.reduce((s, r) => s + r.duration_seconds, 0);
  const longestKm = thisWeekRuns.reduce((m, r) => Math.max(m, r.distance_km), 0);

  const avgPaceSecPerKm = totalKm > 0 ? Math.round(durationSeconds / totalKm) : null;
  const deltaPct = lastWeekKm > 0
    ? Math.round(((totalKm - lastWeekKm) / lastWeekKm) * 100)
    : null;

  return {
    weekStart: thisMondayStr,
    totalKm: Math.round(totalKm * 10) / 10,
    runCount: thisWeekRuns.length,
    durationSeconds,
    longestKm: Math.round(longestKm * 10) / 10,
    avgPaceSecPerKm,
    lastWeekKm: Math.round(lastWeekKm * 10) / 10,
    deltaPct,
  };
}

function paceStr(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format the weekly recap as a push notification.
 * Returns null when there were no runs this week (nothing to celebrate).
 */
export function formatWeeklyInsightsPush(
  insights: WeeklyInsights,
): { title: string; body: string; url: string; tag: string } | null {
  if (insights.runCount === 0) return null;

  const hrs = Math.floor(insights.durationSeconds / 3600);
  const mins = Math.round((insights.durationSeconds % 3600) / 60);
  const timeStr = hrs > 0 ? `${hrs}h${mins.toString().padStart(2, "0")}` : `${mins}min`;

  let trend = "";
  if (insights.deltaPct !== null) {
    if (insights.deltaPct > 5)      trend = ` 📈 +${insights.deltaPct}% vs. semana passada`;
    else if (insights.deltaPct < -5) trend = ` 📉 ${insights.deltaPct}% vs. semana passada`;
    else                             trend = " ⚖️ em linha com a semana passada";
  }

  const paceFragment = insights.avgPaceSecPerKm
    ? ` · pace médio ${paceStr(insights.avgPaceSecPerKm)}/km`
    : "";

  return {
    title: "Resumo da semana 🏁",
    body:
      `${insights.runCount} corrida${insights.runCount !== 1 ? "s" : ""} · ` +
      `${insights.totalKm} km · ${timeStr}${paceFragment}.${trend}`,
    url: "/analytics",
    tag: `limiar-weekly-${insights.weekStart}`,
  };
}
