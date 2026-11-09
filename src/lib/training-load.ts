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
import { localDateStr } from "@/lib/week";
import { movingSeconds } from "@/lib/run-time";
import { isStrengthActivity, toSportKey } from "@/lib/sports";

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
  /*
   * Moving time. The intensity factors below are derived from avg_hr and
   * avg_pace, both of which Strava computes over moving time — multiplying
   * them by elapsed hours mixed two clocks and inflated TSS by whatever the
   * athlete spent standing still. That error compounds: TSS feeds CTL, ATL
   * and TSB, so a week of red lights read as a week of training.
   */
  const durationHours = movingSeconds(run) / 3600;
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

/** What the load model needs from a non-running session. */
export interface LoadActivity {
  date: string;
  sport_type: string | null;
  duration_seconds?: number | null;
  avg_hr?: number | null;
}

/**
 * Intensity factor by sport when there is no heart rate to go on.
 *
 * Deliberately modest. A lifting session does not load the body like a
 * threshold run of the same length, but it is not free either: counting it as
 * zero is how a week of three runs and four gym sessions read as "descansado"
 * to the readiness score while the athlete felt wrecked (Sérgio, 16/09).
 */
const SPORT_IF: Record<string, number> = {
  musculacao: 0.70,
  ciclismo:   0.65,
  natacao:    0.70,
  corrida:    0.70,
};

/** TSS for gym, bike, swim and the rest — same scale as a run's, so they add. */
export function activityTSS(activity: LoadActivity, lthr?: number | null): number {
  const hours = Number(activity.duration_seconds ?? 0) / 3600;
  if (!(hours > 0)) return 0;
  // Heart rate relative to running threshold is a rough proxy off the road, but
  // a measured proxy beats a guessed one. Capped: a lifting set spikes HR without
  // the sustained cost that HR implies on a run.
  if (lthr && lthr > 0 && activity.avg_hr && activity.avg_hr > 0) {
    const hrIF = Math.min(activity.avg_hr / lthr, 0.9);
    return Math.round(hours * hrIF * hrIF * 100 * 10) / 10;
  }
  const raw = (activity.sport_type ?? "").toLowerCase();
  const hiit = raw.includes("hiit") || raw.includes("hitt") || raw.includes("crossfit");
  const key = isStrengthActivity(activity.sport_type) ? "musculacao" : toSportKey(activity.sport_type);
  const ifVal = hiit ? 0.85 : (key && SPORT_IF[key]) || 0.60;
  return Math.round(hours * ifVal * ifVal * 100 * 10) / 10;
}

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
  /** Gym, bike, swim… Without them the load only ever describes the running. */
  activities: LoadActivity[] = [],
): DailyLoad[] {
  if (runs.length === 0 && activities.length === 0) return [];

  // Build TSS map: date → total TSS that day
  const tssMap: Record<string, number> = {};
  for (const run of runs) {
    const tss = estimateTSS(run, lthr, thresholdPaceSecKm);
    tssMap[run.date] = (tssMap[run.date] ?? 0) + tss;
  }
  for (const activity of activities) {
    // A run that also reached `activities` is counted once, from `runs`.
    if (toSportKey(activity.sport_type) === "corrida" && !isStrengthActivity(activity.sport_type)) continue;
    const tss = activityTSS(activity, lthr);
    if (tss > 0) tssMap[activity.date] = (tssMap[activity.date] ?? 0) + tss;
  }

  // Everything below walks calendar dates in UTC.
  //
  // Mixing local-midnight dates with `new Date("2026-07-01")` — which parses as
  // UTC midnight — put the cursor three hours off in Brazil, and the window
  // came back one day short: asking for 90 days returned 89.
  const todayUtc = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const windowStart = new Date(todayUtc);
  windowStart.setUTCDate(windowStart.getUTCDate() - daysBack + 1);

  // Pre-warm start: earliest run or the window start, whichever is earlier,
  // then 42 more days so CTL is warm by the time the window opens.
  const allDates = Object.keys(tssMap).sort();
  const earliest = allDates[0] ? new Date(`${allDates[0]}T00:00:00Z`) : windowStart;
  const prewarmStart = new Date(Math.min(earliest.getTime(), windowStart.getTime()));
  prewarmStart.setUTCDate(prewarmStart.getUTCDate() - 42);

  let ctl = 0;
  let atl = 0;
  const result: DailyLoad[] = [];

  const current = new Date(prewarmStart);
  while (current <= todayUtc) {
    const dateStr = current.toISOString().slice(0, 10);
    const tss = tssMap[dateStr] ?? 0;

    // EMA update
    ctl = ctl + K_CTL * (tss - ctl);
    atl = atl + K_ATL * (tss - atl);

    if (current >= windowStart) {
      // TSB is derived from the rounded values so the three numbers on screen
      // actually subtract: a chart showing 47.4 − 83.9 = −36.6 reads as broken.
      const ctlR = Math.round(ctl * 10) / 10;
      const atlR = Math.round(atl * 10) / 10;
      result.push({
        date: dateStr,
        tss:  Math.round(tss * 10) / 10,
        ctl:  ctlR,
        atl:  atlR,
        tsb:  Math.round((ctlR - atlR) * 10) / 10,
      });
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}

/** TSB interpretation label */
export function tsbLabel(tsb: number): { label: string; color: string; bg: string } {
  if (tsb >  15) return { label: "Muito descansado",  color: "text-cyan-400",   bg: "bg-cyan-500/10"   };
  if (tsb >   5) return { label: "Descansado ✓",     color: "text-green-400",  bg: "bg-green-500/10"  };
  if (tsb >  -5) return { label: "Equilíbrio ✓",     color: "text-green-400",  bg: "bg-green-500/10"  };
  if (tsb > -20) return { label: "Em treinamento",   color: "text-yellow-400", bg: "bg-yellow-500/10" };
  if (tsb > -35) return { label: "Fatigado",         color: "text-amber-400", bg: "bg-amber-500/10" };
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
  const todayStr = localDateStr(today);
  if (!runDates.has(todayStr)) {
    current.setDate(current.getDate() - 1);
  }

  while (true) {
    const dateStr = localDateStr(current);
    if (!runDates.has(dateStr)) break;
    streak++;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}

/**
 * Dias seguidos treinando — qualquer esporte.
 *
 * `computeRunStreak` conta corrida, e é o que a Home mostra como "sequência".
 * Para o alerta de sobrecarga a pergunta é outra: há quantos dias este corpo
 * não descansa? Quem corre em um dia e vai para a academia no outro está há
 * duas semanas sem folga, e o sinal que existe para falar de descanso não via
 * nenhum desses dias.
 */
export function computeTrainingStreak(
  runs: Run[],
  activities: Array<{ date: string }> = [],
): number {
  const days = new Set<string>([...runs.map(r => r.date), ...activities.map(a => a.date)]);
  if (days.size === 0) return 0;

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // Sem treino hoje, a sequência é a que terminou ontem — o dia ainda corre.
  if (!days.has(localDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(localDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Sequência em **semanas**: semanas seguidas com pelo menos uma corrida.
 *
 * A sequência em dias media a coisa errada para este atleta (Sérgio, 20/09).
 * Quem corre três vezes por semana há dois anos tinha "1 dia" de sequência na
 * terça e "0" na quarta — um número que pisca e que pune justamente a rotina
 * que o plano pede. Em semanas, a mesma pessoa tem 104.
 *
 * A semana corrente só conta quando já teve corrida; sem isso a contagem
 * começa na semana passada, para a sequência não zerar toda segunda de manhã.
 */
export function computeWeekStreak(runs: Run[]): number {
  if (runs.length === 0) return 0;

  const mondayOf = (d: Date): string => {
    const m = new Date(d);
    m.setHours(0, 0, 0, 0);
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return localDateStr(m);
  };

  const weeksWithRun = new Set(runs.map(r => mondayOf(new Date(`${r.date}T12:00:00`))));

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!weeksWithRun.has(mondayOf(cursor))) cursor.setDate(cursor.getDate() - 7);

  let streak = 0;
  while (weeksWithRun.has(mondayOf(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
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
  // Local fields in, local fields out. These happened to be correct in Brazil —
  // local midnight is 03:00 UTC the same day — and would silently shift by a day
  // anywhere east of Greenwich. Same class of defect as getMondayOf, which did
  // break, so it goes the same way rather than waiting its turn.
  const thisMondayStr = localDateStr(thisMonday);
  const lastMondayStr = localDateStr(lastMonday);

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
