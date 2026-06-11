/**
 * Limiar — Pattern Detection
 * Pure functions (no DB, no AI) that analyse a runner's history and return
 * detected patterns as structured notes. Called every Monday by the cron job.
 */

import type { Run, AthleteNoteCategory } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DetectedPattern {
  category: AthleteNoteCategory;
  content:  string;
  /** Unique key used to avoid saving duplicates (week + pattern type) */
  key:      string;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Mon
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function runsInRange(runs: Run[], from: string, to: string): Run[] {
  return runs.filter(r => r.date >= from && r.date <= to && !r.deleted_at);
}

function totalKm(runs: Run[]): number {
  return runs.reduce((s, r) => s + (r.distance_km ?? 0), 0);
}

function avgEasyPace(runs: Run[]): number | null {
  const easy = runs.filter(r =>
    (r.type === "easy" || r.type === "recovery" || r.type === "long_run") &&
    r.avg_pace_seconds_per_km != null
  );
  if (easy.length === 0) return null;
  return easy.reduce((s, r) => s + (r.avg_pace_seconds_per_km ?? 0), 0) / easy.length;
}

/** Number of consecutive weeks (Mon–Sun) ending on lastWeekEnd that had ≥1 run */
function consecutiveWeeksWithRuns(runs: Run[], lastWeekStart: string): number {
  let count = 0;
  let weekStart = lastWeekStart;
  while (count < 52) { // max 1 year
    const weekEnd = addDays(weekStart, 6);
    if (runsInRange(runs, weekStart, weekEnd).length === 0) break;
    count++;
    weekStart = addDays(weekStart, -7);
  }
  return count;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Analyses the athlete's run history and returns any detected patterns.
 *
 * @param allRuns   All runs for this user (including soft-deleted runs are excluded inside)
 * @param weekStart The Monday of the CURRENT week (YYYY-MM-DD)
 */
export function detectPatterns(allRuns: Run[], weekStart: string): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const runs = allRuns.filter(r => !r.deleted_at);
  if (runs.length === 0) return patterns;

  const lastWeekStart = addDays(weekStart, -7);
  const lastWeekEnd   = addDays(weekStart, -1);
  const week2Start    = addDays(weekStart, -14);
  const week3Start    = addDays(weekStart, -21);
  const week4Start    = addDays(weekStart, -28);
  const week4End      = addDays(weekStart, -8);   // 4 weeks ago through last week

  const lastWeekRuns   = runsInRange(runs, lastWeekStart, lastWeekEnd);
  const week2Runs      = runsInRange(runs, week2Start, addDays(week2Start, 6));
  const week3Runs      = runsInRange(runs, week3Start, addDays(week3Start, 6));
  const week4Runs      = runsInRange(runs, week4Start, addDays(week4Start, 6));

  const lastWeekKm  = totalKm(lastWeekRuns);
  const prior4Weeks = [week2Runs, week3Runs, week4Runs];
  const weeksWithData = prior4Weeks.filter(w => w.length > 0);
  const avg3WeekKm  = weeksWithData.length > 0
    ? weeksWithData.reduce((s, w) => s + totalKm(w), 0) / weeksWithData.length
    : 0;

  // ── 1. Overtraining spike ──────────────────────────────────────────────────
  // Volume last week > 130% of 3-week average AND > 25km
  if (
    avg3WeekKm > 0 &&
    lastWeekKm > avg3WeekKm * 1.3 &&
    lastWeekKm > 25
  ) {
    const pct = Math.round((lastWeekKm / avg3WeekKm - 1) * 100);
    patterns.push({
      category: "observation",
      key:      `overtraining-${lastWeekStart}`,
      content:  `Semana com volume ${pct}% acima da média: ${lastWeekKm.toFixed(1)}km vs média de ${avg3WeekKm.toFixed(1)}km — monitorar sinais de sobrecarga`,
    });
  }

  // ── 2. Volume drop (not due to inactivity) ────────────────────────────────
  // Volume last week < 50% of 3-week average but there were at least some runs
  if (
    avg3WeekKm > 15 &&
    lastWeekRuns.length > 0 &&
    lastWeekKm < avg3WeekKm * 0.5
  ) {
    patterns.push({
      category: "observation",
      key:      `volume-drop-${lastWeekStart}`,
      content:  `Volume da semana passada (${lastWeekKm.toFixed(1)}km) foi significativamente abaixo da média (${avg3WeekKm.toFixed(1)}km) — semana de recuperação intencional ou fatiga?`,
    });
  }

  // ── 3. Inactivity alert ───────────────────────────────────────────────────
  // No runs in the last 10 days
  const tenDaysAgo = addDays(weekStart, -10);
  const recentRuns = runsInRange(runs, tenDaysAgo, addDays(weekStart, -1));
  if (recentRuns.length === 0 && runs.length > 0) {
    const lastRun = [...runs].sort((a, b) => b.date.localeCompare(a.date))[0];
    const daysSince = Math.floor(
      (new Date(weekStart + "T12:00:00Z").getTime() - new Date(lastRun.date + "T12:00:00Z").getTime())
      / 86400000
    );
    if (daysSince >= 10) {
      patterns.push({
        category: "observation",
        key:      `inactivity-${weekStart}`,
        content:  `Sem corridas nos últimos ${daysSince} dias (última: ${lastRun.date}) — verificar disponibilidade ou possível lesão`,
      });
    }
  }

  // ── 4. Pace improvement ───────────────────────────────────────────────────
  // Easy pace in last 14 days improved ≥5% vs 15–42 days ago
  const recentPaceRuns = runsInRange(runs, addDays(weekStart, -14), addDays(weekStart, -1));
  const olderPaceRuns  = runsInRange(runs, addDays(weekStart, -42), addDays(weekStart, -15));
  const recentPace     = avgEasyPace(recentPaceRuns);
  const olderPace      = avgEasyPace(olderPaceRuns);

  if (recentPace && olderPace && recentPace < olderPace * 0.95) {
    const improveSec = Math.round(olderPace - recentPace);
    const fmtPace = (s: number) =>
      `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}/km`;
    patterns.push({
      category: "observation",
      key:      `pace-improvement-${weekStart}`,
      content:  `Melhora de ritmo detectada: pace de rodagem passou de ${fmtPace(olderPace)} para ${fmtPace(recentPace)} (−${improveSec}s/km nas últimas 2 semanas)`,
    });
  }

  // ── 5. Distance milestones ────────────────────────────────────────────────
  const MILESTONES = [100, 250, 500, 1000, 2000];
  const totalAllTime = totalKm(runs);
  const totalBeforeLastWeek = totalAllTime - lastWeekKm;

  for (const milestone of MILESTONES) {
    if (totalBeforeLastWeek < milestone && totalAllTime >= milestone) {
      patterns.push({
        category: "goal",
        key:      `milestone-${milestone}km`,
        content:  `Marco atingido: ${milestone}km totais de corrida no Limiar! Total acumulado: ${totalAllTime.toFixed(0)}km`,
      });
      break; // only one milestone per week
    }
  }

  // ── 6. Consistency streak ─────────────────────────────────────────────────
  // Every 4 consecutive weeks with ≥1 run, celebrate
  const streak = consecutiveWeeksWithRuns(runs, lastWeekStart);
  if (streak > 0 && streak % 4 === 0) {
    patterns.push({
      category: "observation",
      key:      `streak-${streak}-${lastWeekStart}`,
      content:  `${streak} semanas consecutivas de corrida — consistência excelente! Mantenha o ritmo`,
    });
  }

  return patterns;
}
