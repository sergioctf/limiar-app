/**
 * Deterministic strength session builder.
 *
 * Same contract as the running engine: the athlete's configuration decides
 * what happens, this module turns it into sets/reps/RIR/rest, and the AI only
 * comments afterwards. See TRAINING_SCIENCE.md §8.
 *
 * Two rules here matter more than the rest:
 *   • Heavy loads (not high reps) are what improve running economy
 *   • Heavy legs impair running for up to 48h — so the day before a hard run
 *     is automatically de-loaded rather than left to chance
 */
import {
  EXERCISES, availableExercises, exerciseById,
  type Exercise, type MuscleGroup,
} from "@/lib/exercises";
import {
  GOAL_PARAMS, type StrengthPrefs, type StrengthDayPlan, type CardioAddon,
} from "@/lib/strength-prefs";
import type { WeeklyPlanDay } from "@/types";
import type { StrengthBlock } from "@/lib/strength-cycle";
import { buildCardioSession, type CardioSession } from "@/lib/cardio-builder";

export interface StrengthExercisePrescription {
  exerciseId: string;
  name:       string;
  sets:       number;
  reps:       [number, number];
  /** Reps in reserve — how far from failure each set should stop. */
  rir:        number;
  restSeconds: number;
  /** Marks the heavy compound that leads the session. */
  main:       boolean;
  unilateral: boolean;
  cue:        string;
  /** Time-based exercises (planks) prescribe seconds, not reps. */
  timeBased:  boolean;
}

export interface StrengthSession {
  exercises:  StrengthExercisePrescription[];
  cardio:     CardioAddon | null;
  /** Structured version of the cardio add-on, when there is one. */
  cardioSession?: CardioSession | null;
  estimatedMinutes: number;
  /** Why the session looks the way it does — shown to the athlete. */
  notes:      string[];
  /** True when volume was cut to protect a nearby hard run. */
  deloaded:   boolean;
}

export type Phase = "base" | "build" | "peak" | "taper" | "race";

export interface StrengthContext {
  prefs: StrengthPrefs;
  day:   StrengthDayPlan;
  phase: Phase;
  /** Running LTHR, so the cardio add-on can carry heart-rate targets. */
  lthr?: number | null;
  /** The running day that follows this one, if any — drives the interference guard. */
  nextRunDay?: WeeklyPlanDay | null;
  /**
   * A run happening on this same day.
   *
   * Athletes routinely run and lift on the same day, and the plan has to say so
   * instead of dropping one of them. The session then carries the ordering rule
   * (run first, lift after, ~6 h apart) and backs the legs off when the run of
   * the day is the one that matters.
   */
  sameDayRun?: WeeklyPlanDay | null;
  /**
   * Heavy compounds already prescribed earlier in the week. Repeating a
   * deadlift on back day and again on leg day doubles the systemic cost for no
   * extra benefit, so the second day picks something else.
   */
  usedCompounds?: string[];
  /** Where this week sits in the 4-week block (see lib/strength-cycle). */
  block?: StrengthBlock | null;
  /** Scales volume down when the running week is unusually heavy. */
  runningLoadFactor?: number;
}

const HARD_RUN_TYPES = new Set(["tempo", "intervals", "long_run", "test", "race"]);
const LOWER_BODY: MuscleGroup[] = ["quadriceps", "posterior", "gluteo", "panturrilha"];

/**
 * Rep range for an exercise given the goal's intent.
 *
 * Where the ranges overlap, use the overlap. Where they don't, the exercise
 * wins — its range is a physiological property, the goal is only a preference.
 */
function intersectReps(exercise: [number, number], goal: [number, number]): [number, number] {
  const lo = Math.max(exercise[0], goal[0]);
  const hi = Math.min(exercise[1], goal[1]);
  if (lo <= hi) return [lo, hi];
  return exercise;
}

/** Roughly how long a set takes, including its rest. */
function setMinutes(restSeconds: number, timeBased: boolean): number {
  const work = timeBased ? 45 : 40;
  return (work + restSeconds) / 60;
}

/**
 * Pick exercises for the muscles trained on this day.
 *
 * Order matters: explosive work first (needs a fresh nervous system), then the
 * heavy compound, then unilateral, then accessories and core.
 */
function selectExercises(ctx: StrengthContext, budgetMinutes: number): Exercise[] {
  const { prefs, day, phase } = ctx;

  // The athlete owns this day's exercises: they edited the session while
  // logging it, and that choice is more informed than anything computed here —
  // it knows which machine was free and what their body actually tolerated.
  if (day.exercises && day.exercises.length > 0) {
    const roster = day.exercises
      .map(id => exerciseById(id))
      .filter((e): e is Exercise => !!e && !prefs.avoid.includes(e.id));
    if (roster.length > 0) return roster;
  }
  const pool = availableExercises(prefs.equipment)
    .filter(e => !prefs.avoid.includes(e.id));

  const trainsDayMuscles = (e: Exercise) =>
    e.primary.some(m => day.muscles.includes(m)) ||
    e.secondary.some(m => day.muscles.includes(m));

  const candidates = pool.filter(trainsDayMuscles);
  const isRunnerFocused = prefs.goal === "suporte";
  const hasLower = day.muscles.some(m => LOWER_BODY.includes(m));

  const chosen: Exercise[] = [];
  const take = (e?: Exercise) => {
    if (e && !chosen.some(c => c.id === e.id)) chosen.push(e);
  };

  /**
   * Ranking depends on the goal. A runner-support plan wants whatever helps the
   * run most; a hypertrophy plan wants the best loadable exercise for the target
   * muscle — ranking push-ups above bench press because push-ups score higher
   * "for runners" would be the wrong answer to the question being asked.
   */
  const score = (e: Exercise): number => {
    let s = 0;
    if (prefs.favorites.includes(e.id)) s += 100;

    if (isRunnerFocused) {
      s += e.runnerValue * 10;
    } else {
      // Trains a day muscle directly, and can be loaded progressively.
      if (e.primary.some(m => day.muscles.includes(m))) s += 30;
      if (e.equipment === "academia" || e.equipment === "halteres") s += 12;
      s += e.runnerValue;                     // tiebreaker only
    }

    if (prefs.style === "barra"   && e.equipment === "academia") s += 4;
    if (prefs.style === "halter"  && e.equipment === "halteres") s += 4;
    return s;
  };

  const byRunnerValue = (a: Exercise, b: Exercise) => score(b) - score(a);

  // 1. Plyometrics — only when fresh and only outside the taper.
  if (hasLower && (phase === "build" || phase === "peak") && !isRunnerFocused) {
    take(candidates.filter(e => e.category === "pliometrico").sort(byRunnerValue)[0]);
  } else if (hasLower && phase === "build" && isRunnerFocused) {
    take(candidates.filter(e => e.category === "pliometrico").sort(byRunnerValue)[0]);
  }

  // 2. Heavy compounds — the part that actually drives adaptation.
  const used = new Set(ctx.usedCompounds ?? []);
  // A heavy compound has to train something the athlete actually asked for.
  // Matching on secondary muscles too put a barbell squat on a biceps/triceps
  // day, because the squat brushes the core.
  const trainsPrimary = (e: Exercise) => e.primary.some(m => day.muscles.includes(m));
  const allCompounds = candidates.filter(e => e.category === "composto" && trainsPrimary(e))
    .sort(byRunnerValue);
  const freshCompounds = allCompounds.filter(e => !used.has(e.id));
  const compounds = freshCompounds.length > 0 ? freshCompounds : allCompounds;
  const compoundCount = budgetMinutes >= 60 ? 2 : 1;
  compounds.slice(0, compoundCount).forEach(take);

  // 3. Unilateral — running happens on one leg at a time.
  // Single-leg work only where the day actually trains those muscles — a
  // Bulgarian split squat on a chest day is noise, not runner-specific work.
  const unilateral = candidates
    .filter(e => e.category === "unilateral" && e.primary.some(m => day.muscles.includes(m)))
    .sort(byRunnerValue);
  unilateral.slice(0, hasLower ? 2 : 1).forEach(take);

  // 4. Runner essentials: calves and hamstring protection, whenever legs are trained.
  if (hasLower) {
    take(pool.find(e => e.id === "nordico"));
    take(pool.filter(e => e.primary.includes("panturrilha") && e.category === "isolado")
             .sort(byRunnerValue)[0]);
  }

  // 5. Accessories: every requested muscle gets direct work, and hypertrophy
  // gets a second exercise per muscle — one movement per muscle per week can't
  // reach the 12-20 weekly sets the goal needs.
  const perMuscleTarget = prefs.goal === "hipertrofia" ? 2 : 1;
  for (const muscle of day.muscles) {
    const already = chosen.filter(e => e.primary.includes(muscle)).length;
    if (already >= perMuscleTarget) continue;

    const options = candidates
      .filter(e => e.primary.includes(muscle) && !chosen.some(c => c.id === e.id))
      .sort(byRunnerValue);

    options.slice(0, perMuscleTarget - already).forEach(take);
  }

  // 6. Core, when the athlete asked for it.
  if (day.muscles.includes("core")) {
    candidates.filter(e => e.category === "core").sort(byRunnerValue).slice(0, 2).forEach(take);
  }

  // Explicit favourites that fit the day but didn't make the cut yet.
  for (const id of prefs.favorites) {
    const ex = exerciseById(id);
    if (ex && trainsDayMuscles(ex) && !prefs.avoid.includes(id)) take(ex);
  }

  // 7. Use the time the athlete actually set aside.
  //
  // The steps above stop as soon as each requested muscle has met its target,
  // which on a narrow day left a 60-minute session with two exercises and 17
  // minutes of work. Keep adding movements that train the day's own muscles
  // until the session is worth the trip.
  const wanted = Math.max(3, Math.min(8, Math.round(budgetMinutes / 10)));
  if (chosen.length < wanted) {
    const extras = candidates
      .filter(e => trainsPrimary(e) && !chosen.some(c => c.id === e.id))
      .sort(byRunnerValue);
    extras.slice(0, wanted - chosen.length).forEach(take);
  }
  // Still short (a single muscle has only so many movements) — allow exercises
  // that reach it as a secondary before leaving the session half empty.
  if (chosen.length < Math.min(wanted, 4)) {
    candidates
      .filter(e => !chosen.some(c => c.id === e.id))
      .sort(byRunnerValue)
      .slice(0, Math.min(wanted, 4) - chosen.length)
      .forEach(take);
  }

  return chosen;
}

/** Order the session so the demanding work happens fresh. */
const CATEGORY_ORDER: Record<Exercise["category"], number> = {
  pliometrico: 0, composto: 1, unilateral: 2, isolado: 3, core: 4,
};

export function buildStrengthSession(ctx: StrengthContext): StrengthSession {
  const { prefs, day, phase, nextRunDay, sameDayRun, block } = ctx;
  const params = GOAL_PARAMS[prefs.goal];
  const notes: string[] = [];

  // Block periodization: effort ramps across the block, then a deload week.
  const blockVolume = (block?.volume ?? 1) * (ctx.runningLoadFactor ?? 1);
  const blockRir    = block?.rir ?? null;
  const repShift    = block?.repShift ?? 0;
  if (block) notes.push(block.intent);
  if ((ctx.runningLoadFactor ?? 1) < 1) {
    notes.push("Semana de corrida mais pesada que o normal — volume de força reduzido para as pernas aguentarem.");
  }

  // ── Interference guard ────────────────────────────────────────────────────
  // Heavy legs impair running for up to 48h; the day before a quality session
  // or long run gets cut automatically rather than sabotaging the run.
  const hasLower = day.muscles.some(m => LOWER_BODY.includes(m));
  const runIsHardTomorrow = !!nextRunDay && HARD_RUN_TYPES.has(nextRunDay.type);
  const protectRun = hasLower && runIsHardTomorrow && params.priority === "corrida";
  const softenRun  = hasLower && runIsHardTomorrow && params.priority === "forca";

  // Same-day running: the order matters more than anything else here, and a
  // hard run today outranks the legs.
  const runIsHardToday = !!sameDayRun && HARD_RUN_TYPES.has(sameDayRun.type);
  const protectSameDay = hasLower && runIsHardToday && params.priority === "corrida";

  const taper = phase === "taper" || phase === "race";

  let deloaded = false;
  if (taper) {
    notes.push("Semana de prova: carga leve, só ativação. Volume pesado agora não adiciona forma, só fadiga.");
    deloaded = true;
  } else if (protectSameDay) {
    notes.push(`Hoje também tem ${sameDayRun!.label.toLowerCase()} — pernas em carga reduzida para a corrida não sair prejudicada.`);
    deloaded = true;
  } else if (protectRun) {
    notes.push(`Amanhã tem ${nextRunDay!.label.toLowerCase()} — pernas em carga reduzida para não comprometer a corrida.`);
    deloaded = true;
  } else if (softenRun) {
    notes.push(`Amanhã tem ${nextRunDay!.label.toLowerCase()}. Mantivemos o volume, mas pare 1-2 reps antes da falha nas pernas.`);
  }

  // The ordering rule, on every day that has both.
  if (sameDayRun) {
    notes.push(
      runIsHardToday
        ? `Corra primeiro e levante depois, com pelo menos 6 h entre os dois — ${sameDayRun.label.toLowerCase()} é a sessão que decide a semana.`
        : "Corra primeiro e levante depois, idealmente com ~6 h entre os dois. Coladas, a segunda sessão sempre sai pior.",
    );
  }

  // ── Budget ────────────────────────────────────────────────────────────────
  const cardio = day.cardio ?? null;
  const cardioMinutes = cardio?.minutes ?? 0;
  const budget = Math.max(20, prefs.sessionMinutes - cardioMinutes);

  const selected = selectExercises(ctx, budget)
    .sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]);

  // ── Prescription ──────────────────────────────────────────────────────────
  const prescriptions: StrengthExercisePrescription[] = [];
  let usedMinutes = 0;
  let mainAssigned = false;

  for (const ex of selected) {
    const isMain = !mainAssigned && ex.category === "composto";
    const isLowerBody = ex.primary.some(m => LOWER_BODY.includes(m));
    const timeBased = ex.category === "core" && ex.reps[1] > 20;

    // Reps: the goal shifts the range WITHIN what the exercise allows — never
    // outside it. A Nordic curl is 4-6 reps and a box jump 3-6 no matter what
    // the goal says; stretching those to 10-12 would be a different exercise.
    // The block shifts the range toward heavier work in build/peak phases.
    const baseRange = isMain || ex.category === "composto" ? params.mainReps : params.accessoryReps;
    const shifted: [number, number] = repShift !== 0
      ? [Math.max(3, baseRange[0] + repShift), Math.max(4, baseRange[1] + repShift)]
      : baseRange;
    const reps: [number, number] = timeBased ? ex.reps : intersectReps(ex.reps, shifted);

    // Sets: compounds carry the load, accessories fill volume.
    let sets = ex.category === "composto" ? (prefs.goal === "hipertrofia" ? 4 : 3)
      : ex.category === "unilateral" ? 3
      : ex.category === "pliometrico" ? 3
      : prefs.goal === "hipertrofia" ? 3 : 2;
    // Floor of 2 outside race week: `round(2 × 0.6)` is 1, and one set of an
    // accessory is not a lighter dose of training — it is a token that reads as
    // a bug. The block's volume cut is delivered by the total-set ceiling below,
    // which drops whole accessories instead of leaving stubs everywhere.
    const setFloor = taper ? 1 : 2;
    sets = Math.max(setFloor, Math.round(sets * blockVolume));

    // RIR: the block's target when there is one, otherwise the goal's default.
    let rir = blockRir ?? (prefs.goal === "hipertrofia" ? 2 : prefs.goal === "forca" ? 1 : 2);
    if (ex.category === "pliometrico") rir = Math.max(rir, 4);   // never grind explosive work

    if (taper) { sets = Math.max(1, Math.round(sets * 0.5)); rir = Math.max(rir, 4); }
    else if (deloaded && isLowerBody) { sets = Math.max(setFloor, sets - 1); rir = Math.max(rir, 3); }
    else if (softenRun && isLowerBody) { rir = Math.max(rir, 3); }

    const rest = isMain || ex.category === "composto" ? params.restSeconds
      : ex.category === "core" ? 45
      : Math.round(params.restSeconds * 0.7);

    const cost = sets * setMinutes(rest, timeBased) * (ex.unilateral ? 1.6 : 1);
    if (usedMinutes + cost > budget && prescriptions.length >= 3) break;   // keep it honest to the clock
    usedMinutes += cost;

    prescriptions.push({
      exerciseId: ex.id,
      name: ex.name,
      sets,
      reps,
      rir,
      restSeconds: rest,
      main: isMain,
      unilateral: ex.unilateral,
      cue: ex.cue,
      timeBased,
    });

    if (isMain) mainAssigned = true;
  }

  // Cutting sets per exercise frees time, which lets more exercises fit — so
  // total volume barely moves. When the week calls for less work, cap the TOTAL
  // and drop accessories from the end, keeping the compounds that matter.
  if (blockVolume < 1 && prescriptions.length > 3) {
    // Useful stimulus per session tops out around 15-20 sets (§8.3); scale that
    // ceiling by the week's volume factor and trim accessories to fit.
    const ceiling = prefs.goal === "hipertrofia" ? 20 : 15;
    const target = Math.max(6, Math.round(ceiling * blockVolume));

    let current = prescriptions.reduce((s, p) => s + p.sets, 0);
    for (let i = prescriptions.length - 1; i >= 0 && current > target; i--) {
      if (prescriptions.length <= 3) break;
      if (prescriptions[i].main) continue;
      // Runner essentials stay: they prevent injury without adding real fatigue.
      if (prescriptions[i].exerciseId === "nordico") continue;
      current -= prescriptions[i].sets;
      prescriptions.splice(i, 1);
    }
  }

  // ── Context notes ─────────────────────────────────────────────────────────
  if (!taper && !deloaded) {
    if (prefs.goal === "suporte") {
      notes.push("Foco em carga alta e poucas repetições — é isso que melhora a economia de corrida, não séries longas e leves.");
    } else if (prefs.goal === "hipertrofia") {
      notes.push("Volume distribuído para hipertrofia, mantendo o composto pesado no início enquanto você está fresco.");
    }
  }
  if (prefs.limitations.trim()) {
    notes.push(`Atenção à sua limitação registrada: ${prefs.limitations.trim()}`);
  }

  // Turn the cardio add-on into a real prescription (blocks, incline, HR).
  const cardioSession = cardio
    ? buildCardioSession(cardio, {
        intensity: cardio.intensity,
        lthr: ctx.lthr ?? null,
        phase,
        lowerBodyDay: hasLower,
      })
    : null;

  if (cardioSession?.adjusted) notes.push(cardioSession.adjusted);

  return {
    exercises: prescriptions,
    cardio,
    cardioSession,
    estimatedMinutes: Math.round(usedMinutes + cardioMinutes),
    notes,
    // A block consolidation week is a lighter week too. The local `deloaded`
    // above drives an *extra* reduction for taper/pre-run days; the reported
    // flag simply tells the athlete this week is deliberately lighter, which
    // must also be true on week 4 of the block.
    deloaded: deloaded || !!block?.deload,
  };
}

/** Weekly set count per muscle — used by the advisor to spot gaps. */
export function weeklySetsPerMuscle(
  sessions: Array<{ day: StrengthDayPlan; session: StrengthSession }>,
): Map<MuscleGroup, number> {
  const counts = new Map<MuscleGroup, number>();
  for (const { session } of sessions) {
    for (const p of session.exercises) {
      const ex = EXERCISES.find(e => e.id === p.exerciseId);
      if (!ex) continue;
      for (const m of ex.primary) counts.set(m, (counts.get(m) ?? 0) + p.sets);
      for (const m of ex.secondary) counts.set(m, (counts.get(m) ?? 0) + p.sets * 0.5);
    }
  }
  return counts;
}
