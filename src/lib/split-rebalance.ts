/**
 * Reorganising a lifting split so every muscle gets trained more than once.
 *
 * The advisor could already spot the problem — eight muscle groups each trained
 * once a week — but it deliberately refused to fix it, because reshaping
 * somebody's whole week behind one button is not a decision an app should make
 * quietly. The consequence was backwards: the more broken the split, the less
 * help the athlete got.
 *
 * So the proposal is computed, shown in full, and applied only if the athlete
 * says yes. This module produces both sides of that comparison — never the
 * change alone — because a preview built separately from the thing it previews
 * is a preview that will eventually lie.
 *
 * The reasoning:
 *   • Protein synthesis returns to baseline in roughly 48 hours, so a muscle
 *     stimulated once a week spends most of the week doing nothing. Twice beats
 *     once at the same total volume.
 *   • Upper and lower alternate, so consecutive days do not land on the same
 *     tissue.
 *   • Running comes first. A heavy lower day the evening before the long run
 *     costs the week's most valuable session, so that slot goes to upper work.
 */
import type { DayKey } from "@/types";
import { MUSCLE_LABEL, type MuscleGroup } from "@/lib/exercises";

const DAY_ORDER: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const UPPER: MuscleGroup[] = ["costas", "peito", "ombro", "triceps", "biceps"];
const LOWER: MuscleGroup[] = ["gluteo", "posterior", "quadriceps", "panturrilha"];

/** Muscles a day may hold before the session stops fitting in an hour. */
const MAX_PER_DAY = 3;

export interface SplitDay {
  day:     DayKey;
  muscles: MuscleGroup[];
}

export interface FrequencyChange {
  muscle: MuscleGroup;
  label:  string;
  before: number;
  after:  number;
}

export interface SplitProposal {
  before:    SplitDay[];
  after:     SplitDay[];
  frequency: FrequencyChange[];
  /** One sentence naming the actual gain. */
  summary:   string;
  /** False when the current split is already fine, or too small to improve. */
  worthIt:   boolean;
  /** Why not, when it isn't. */
  reason?:   string;
}

const dayIndex = (d: DayKey) => DAY_ORDER.indexOf(d);

/** How many days each muscle appears on. */
function frequencyOf(days: SplitDay[]): Map<MuscleGroup, number> {
  const freq = new Map<MuscleGroup, number>();
  for (const d of days) {
    // Array.from because the build targets an ES level where iterating a Set
    // directly needs downlevelIteration.
    for (const m of Array.from(new Set(d.muscles))) freq.set(m, (freq.get(m) ?? 0) + 1);
  }
  return freq;
}

/**
 * Propose a rebalanced split.
 *
 * `longRunDay` is honoured rather than merely noted: the day before it is
 * forced to upper work, because the long run is the session the week is built
 * around and legs that are 24 hours into repair cannot deliver it.
 */
export function proposeSplit(
  current: SplitDay[],
  opts: { longRunDay?: DayKey | null } = {},
): SplitProposal {
  const before = [...current]
    .sort((a, b) => dayIndex(a.day) - dayIndex(b.day))
    .map(d => ({ day: d.day, muscles: [...d.muscles] }));

  const n = before.length;

  if (n < 2) {
    return {
      before, after: before, frequency: [], worthIt: false,
      summary: "",
      reason: "Com menos de dois dias de musculação não há o que redistribuir.",
    };
  }

  const currentFreq = frequencyOf(before);
  const trained = Array.from(currentFreq.keys());
  const onceOnly = trained.filter(m => (currentFreq.get(m) ?? 0) === 1);

  if (onceOnly.length === 0) {
    return {
      before, after: before, frequency: [], worthIt: false,
      summary: "",
      reason: "Todos os grupos que você treina já aparecem mais de uma vez por semana.",
    };
  }

  // ── Decide what each day is for ──────────────────────────────────────────
  //
  // Alternate, then override the eve of the long run. Starting on upper keeps
  // the first lower day away from Monday, which is where a lot of people put
  // their long run's recovery.
  const eveOfLongRun = opts.longRunDay
    ? DAY_ORDER[(dayIndex(opts.longRunDay) + 6) % 7]
    : null;

  const kinds: Array<"upper" | "lower"> = before.map((d, i) =>
    d.day === eveOfLongRun ? "upper" : (i % 2 === 0 ? "upper" : "lower"));

  // Alternation can break where the override landed; repair it so two lower
  // days never sit together.
  for (let i = 1; i < kinds.length; i++) {
    if (kinds[i] === "lower" && kinds[i - 1] === "lower" && before[i].day !== eveOfLongRun) {
      kinds[i] = "upper";
    }
  }

  // Somebody who only lifts on the eve of their long run would otherwise get a
  // week with no leg work at all.
  if (!kinds.includes("lower")) kinds[kinds.length - 1] = "lower";

  // ── Fill ─────────────────────────────────────────────────────────────────
  //
  // Only muscles the athlete already trains: this rebalances their split, it
  // does not prescribe a new one. Someone who never trains calves did not ask
  // to start today.
  const after: SplitDay[] = before.map(d => ({ day: d.day, muscles: [] }));

  const place = (pool: MuscleGroup[], kind: "upper" | "lower") => {
    const slots = after
      .map((d, i) => ({ d, i }))
      .filter(({ i }) => kinds[i] === kind);
    if (slots.length === 0) return;

    for (const muscle of pool) {
      // Twice a week is the target; a single available day means once.
      const target = Math.min(2, slots.length);
      for (let placed = 0; placed < target; placed++) {
        const open = slots
          .filter(({ d }) => !d.muscles.includes(muscle) && d.muscles.length < MAX_PER_DAY)
          .sort((a, b) => a.d.muscles.length - b.d.muscles.length || a.i - b.i)[0];
        if (!open) break;
        open.d.muscles.push(muscle);
      }
    }
  };

  place(UPPER.filter(m => trained.includes(m)), "upper");
  place(LOWER.filter(m => trained.includes(m)), "lower");

  // Core rides along wherever there is room — it is cheap, it matters for a
  // runner, and it does not compete with anything for recovery.
  if (trained.includes("core")) {
    for (const d of [...after].sort((a, b) => a.muscles.length - b.muscles.length).slice(0, 2)) {
      if (!d.muscles.includes("core")) d.muscles.push("core");
    }
  }

  // A day left empty by the rules above keeps what it had, rather than becoming
  // a rest day the athlete never asked for.
  for (let i = 0; i < after.length; i++) {
    if (after[i].muscles.length === 0) after[i].muscles = [...before[i].muscles];
  }

  const nextFreq = frequencyOf(after);
  const frequency: FrequencyChange[] = trained
    .map(m => ({
      muscle: m,
      label:  MUSCLE_LABEL[m],
      before: currentFreq.get(m) ?? 0,
      after:  nextFreq.get(m) ?? 0,
    }))
    .sort((a, b) => (a.after - a.before) - (b.after - b.before) || a.label.localeCompare(b.label, "pt-BR"));

  const improved = frequency.filter(f => f.after > f.before).length;
  const worsened = frequency.filter(f => f.after < f.before);

  if (improved === 0) {
    return {
      before, after: before, frequency: [], worthIt: false,
      summary: "",
      reason: "Não consegui melhorar a frequência sem tirar algo de outro lugar.",
    };
  }

  return {
    before,
    after,
    frequency,
    worthIt: true,
    summary:
      `${improved} ${improved === 1 ? "grupo passa" : "grupos passam"} a ser treinado${improved === 1 ? "" : "s"} ` +
      `mais de uma vez por semana, nos mesmos ${n} dias de academia.` +
      (worsened.length > 0
        ? ` ${worsened.map(w => w.label).join(" e ")} ${worsened.length === 1 ? "perde" : "perdem"} frequência em troca.`
        : ""),
  };
}
