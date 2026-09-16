/**
 * Where the athlete is inside a training block, when no race gives the answer.
 *
 * The plan had a periodization and never used it. `planWeeklyVolume` takes a
 * `weekIndex` and cuts back every fourth week, and there is a passing test for
 * it — but no caller ever passed the argument, so the cutback never fired in
 * production. Phase was no better: `phaseForRace` returns "base" whenever there
 * is no dated race ahead, and Sérgio's only dated race was in June. The result
 * was six consecutive weeks of an identical plan: 6 km easy, 3×400 m, 9.5 km
 * long, 19.0 km, week after week.
 *
 * A block does not need a race to have shape. This gives one: a four-week
 * mesocycle, three weeks of work and one of recovery, which is the oldest and
 * least controversial structure in endurance training. It exists so that the
 * week has a position, and so that the position can drive both volume and
 * stimulus.
 *
 * The anchor is the Monday of the athlete's first training week. Any anchor is
 * arbitrary — cycles have to start somewhere — but this one is stable, derived
 * from data we already hold, and never shifts under the athlete's feet.
 */

import { localDateStr } from "@/lib/week";

/** Weeks in a mesocycle: three of work, one of recovery. */
export const CYCLE_WEEKS = 4;

export interface CyclePosition {
  /** 1-based block number since the anchor. */
  cycle: number;
  /** 1..4 — position inside the block. */
  week: number;
  /** The fourth week, where volume steps back and quality goes light. */
  isRecovery: boolean;
  /**
   * Weeks elapsed since the anchor, for `planWeeklyVolume`, whose cutback rule
   * is written as `weekIndex % 4 === 3`.
   */
  weekIndex: number;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Monday of the week containing `dateStr`, as YYYY-MM-DD.
 *
 * `localDateStr` rather than `toISOString`: the date is built and mutated in
 * local time, and serialising it as UTC shifts it a day for anyone west of
 * Greenwich — which for a Monday means the whole cycle lands one week off.
 */
export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateStr(d);
}

/**
 * The week's place in its block.
 *
 * A missing or future anchor puts the week at the start of cycle 1, which is
 * the honest answer for an athlete with no history: they are beginning.
 */
export function cyclePosition(weekStart: string, anchorMonday?: string | null): CyclePosition {
  if (!anchorMonday) return { cycle: 1, week: 1, isRecovery: false, weekIndex: 0 };

  const a = new Date(`${mondayOf(anchorMonday)}T12:00:00`).getTime();
  const w = new Date(`${mondayOf(weekStart)}T12:00:00`).getTime();
  const weeks = Math.round((w - a) / MS_PER_WEEK);
  if (!Number.isFinite(weeks) || weeks < 0) {
    return { cycle: 1, week: 1, isRecovery: false, weekIndex: 0 };
  }

  const week = (weeks % CYCLE_WEEKS) + 1;
  return {
    cycle: Math.floor(weeks / CYCLE_WEEKS) + 1,
    week,
    isRecovery: week === CYCLE_WEEKS,
    weekIndex: weeks,
  };
}

/**
 * The menu of hard sessions.
 *
 * Progression is not a synonym for "longer". A 10×200 m session at repetition
 * pace teaches the legs to turn over and costs almost nothing in fatigue; hill
 * repeats build force without asking anything of pace; a fartlek trains the
 * transitions a race actually demands. An athlete who only ever sees reps grow
 * from 400 m to 600 m to 1000 m is being trained in one dimension.
 *
 * Each kind has its own Daniels budget, which is what keeps variety honest:
 * R-pace work is capped near 5% of the week, I-pace at 8%, T-pace at 10%. So
 * changing the *kind* of session genuinely changes the stimulus rather than
 * dressing up the same load in different words.
 */
export type QualityKind =
  | "intervals"          // I pace — 400–1000 m reps, jog recovery
  | "threshold"          // T pace — cruise intervals
  | "intervals_dense"    // I pace, recovery cut: harder without more volume
  | "repetitions"        // R pace — 200 m reps, full recovery. Speed, not fitness.
  | "hills"              // Force and form, with no pace cost
  | "fartlek"            // Surges inside an easy run — race-like transitions
  | "progression"        // Finishes at threshold; teaches pacing discipline
  | "strides";           // Recovery week

/**
 * The three working weeks draw from this, rotating by block, so the athlete
 * does not settle into a fixed four-week loop either. Ordered so that the
 * heaviest sessions do not land back to back across a block boundary.
 */
const MENU: QualityKind[] = [
  "intervals",
  "threshold",
  "repetitions",
  "intervals_dense",
  "hills",
  "fartlek",
  "progression",
];

/**
 * What the quality session should be this week.
 *
 * The fourth week is always strides — a recovery week with nothing fast in it
 * costs neuromuscular sharpness and makes the return to intervals feel like
 * starting over. The other three rotate through the menu, offset by the block
 * number, so consecutive blocks differ from each other and not just internally.
 */
export function qualityForWeek(week: number, cycle = 1, excluded: QualityKind[] = []): QualityKind {
  const w = ((week - 1) % CYCLE_WEEKS) + 1;
  if (w === CYCLE_WEEKS) return "strides";
  // The rotation runs over what the athlete actually does. Filtering the menu
  // (instead of stepping past a skipped entry) keeps consecutive weeks different:
  // skipping "hills" by taking the next item would hand the athlete fartlek two
  // weeks in a row whenever the block rolled onto it.
  const menu = MENU.filter(kind => !excluded.includes(kind));
  const offset = (Math.max(1, cycle) - 1) * (CYCLE_WEEKS - 1);
  return menu[(offset + w - 1) % menu.length];
}

/**
 * Session types an athlete can opt out of.
 *
 * Intervals and threshold stay: they are the two Daniels says a runner cannot do
 * without, and they guarantee the rotation never runs out. Everything here has
 * a stand-in — someone with no hill nearby (or who simply won't run one, as
 * Sérgio said on 16/09) still gets strength work from the rest of the menu.
 */
export const EXCLUDABLE_QUALITY: QualityKind[] = ["hills", "fartlek", "repetitions", "intervals_dense", "progression"];

/**
 * Extra reps earned by blocks already completed.
 *
 * Progression across cycles, not within them. Capped at two so an athlete who
 * has been training for a year is not prescribed a track meet — beyond that,
 * growth has to come from weekly volume, which is a separate and slower lever.
 */
export function repBonusForCycle(cycle: number): number {
  return Math.min(2, Math.max(0, cycle - 1));
}

/**
 * The `weekIndex` to hand `planWeeklyVolume`, whose cutback fires on
 * `weekIndex % 4 === 3`.
 *
 * Only an earned recovery week gets an index at all. The caller used to dodge
 * an unearned cutback by passing `weekIndex + 1` — which does dodge week 4, and
 * lands every week 3 squarely on `% 4 === 3` instead. Each block's third week
 * was quietly cut by 30%. The ratchet usually floored it back up to the previous
 * plan, so it only showed when the week before fell short: exactly the week an
 * athlete comes back from time off, when a smaller plan reads as punishment.
 */
export function cutbackWeekIndex(position: CyclePosition, earned: boolean): number | undefined {
  return position.isRecovery && earned ? position.weekIndex : undefined;
}

/**
 * Has this week already begun?
 *
 * A week the athlete is living in has already shaped their decisions — which
 * day they took off, when they booked the long run. Regenerating it from
 * scratch is not an update, it is an erasure.
 */
export function weekIsUnderway(weekStart: string, today: string): boolean {
  return mondayOf(weekStart) <= today;
}

/**
 * Whether a recovery week is actually earned.
 *
 * The four-week cadence is a calendar anchor, and a calendar has no idea what
 * the athlete has been doing. Dropping to 70% after three weeks of barely
 * training recovers nothing — it just lowers a volume that was already low, and
 * to the athlete it reads as the app giving up on them.
 *
 * The bar is deliberately forgiving: one solid week out of the last three is
 * enough, because a recovery week after a hard week and two interrupted ones is
 * still the right call. What it rules out is recovering from nothing at all.
 */
export function recoveryApplies(recentWeeklyKm: number[], baseKm: number): boolean {
  if (recentWeeklyKm.length === 0 || baseKm <= 0) return false;
  return recentWeeklyKm.slice(0, 3).some(v => v >= baseKm * 0.6);
}

export interface RegenerationTarget {
  allowed: boolean;
  /** Why not, when it isn't — shown to the athlete rather than swallowed. */
  reason?: string;
  /** The week a refused regeneration should be aimed at instead. */
  suggestWeek?: string;
}

/**
 * Whether a week may be regenerated.
 *
 * A week already underway is not a draft. The athlete has read it, chosen which
 * day to take off, and possibly already run some of it — Sérgio had 5.87 km in
 * the bank when a regeneration turned his 19 km week into 14 and swapped the
 * Wednesday session. Protecting only the volume was not enough: rewriting the
 * sessions is the same breach with a different number.
 *
 * So a started week is frozen, and the correction is offered for the next one.
 * The exception is a week that has no plan at all: generating what does not
 * exist takes nothing away.
 */
export function regenerationTarget(
  weekStart: string,
  today: string,
  weekHasNoPlan: boolean,
): RegenerationTarget {
  if (weekHasNoPlan || !weekIsUnderway(weekStart, today)) return { allowed: true };

  const next = new Date(`${mondayOf(weekStart)}T12:00:00`);
  next.setDate(next.getDate() + 7);
  return {
    allowed: false,
    reason:
      "Esta semana já está em andamento e não vai ser reescrita — você já organizou " +
      "os dias em torno dela. As melhorias entram na semana que vem.",
    suggestWeek: localDateStr(next),
  };
}
