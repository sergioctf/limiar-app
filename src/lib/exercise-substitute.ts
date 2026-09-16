/**
 * "A máquina está ocupada — me dá outro."
 *
 * The catalogue has 277 movements, which is exactly the problem at the rack:
 * the athlete does not want to browse, they want the two or three things that
 * train the same muscle with what is in front of them, right now.
 *
 * So this ranks rather than filters. A substitute that hits the same primary
 * muscles with the same equipment is ideal; one that hits the same muscles with
 * something else is still useful; one that merely mentions the muscle in
 * passing is not a substitute at all and never appears.
 */
import {
  allExercises, exerciseById, EQUIPMENT_RANK,
  type Exercise, type Equipment, type MuscleGroup,
} from "@/lib/exercises";

export interface SubstituteOptions {
  /**
   * What the athlete has, as stored in their strength preferences. A list
   * rather than one value, and empty or absent means "do not filter" — which is
   * the right answer when we simply do not know yet.
   */
  equipment?: Equipment[] | null;
  /** Ids already in the session — proposing them would be a no-op swap. */
  exclude?: string[];
  limit?: number;
}

/**
 * True when `needed` is within reach of someone who owns `owned`.
 *
 * Shares `EQUIPMENT_RANK` with `availableExercises`, so a swap can never offer
 * something the session builder itself would have refused to prescribe.
 */
export function equipmentAllows(owned: Equipment[] | null | undefined, needed: Equipment): boolean {
  if (!owned || owned.length === 0) return true;
  const best = Math.max(...owned.map(e => EQUIPMENT_RANK[e] ?? 0), 0);
  return EQUIPMENT_RANK[needed] <= best;
}

export function substitutesFor(exerciseId: string, opts: SubstituteOptions = {}): Exercise[] {
  const original = exerciseById(exerciseId);
  if (!original) return [];

  const excluded = new Set([exerciseId, ...(opts.exclude ?? [])]);
  const wanted = new Set(original.primary);

  const scored = allExercises()
    .filter(e => !excluded.has(e.id))
    // Only movements whose *point* is one of the muscles this exercise trains.
    // Without this, swapping a supino offers barra fixa — which uses the chest
    // the way a run uses the arms.
    .filter(e => e.primary.some(m => wanted.has(m)))
    .filter(e => equipmentAllows(opts.equipment, e.equipment))
    .map(e => ({ exercise: e, score: score(e, original, wanted) }))
    .sort((a, b) =>
      b.score - a.score
      || a.exercise.name.localeCompare(b.exercise.name, "pt-BR"));

  return scored.slice(0, opts.limit ?? 6).map(s => s.exercise);
}

function score(candidate: Exercise, original: Exercise, wanted: Set<MuscleGroup>): number {
  let score = 0;

  // Trains everything the original trained, and nothing extra — the closest
  // thing to the same exercise.
  const covers = original.primary.every(m => candidate.primary.includes(m));
  if (covers) score += 100;
  score += candidate.primary.filter(m => wanted.has(m)).length * 20;

  // Same equipment means the same corner of the gym and the same loading.
  if (candidate.equipment === original.equipment) score += 40;

  // Same category (composto vs isolado) keeps the session's shape: swapping a
  // compound for a cable fly changes what the day was for.
  if (candidate.category === original.category) score += 30;

  // The curated list carries a runner's judgement and an execution cue.
  if (candidate.cue) score += 15;
  score += candidate.runnerValue * 3;

  // Unilateral and bilateral are not interchangeable at the same prescription:
  // "3 × 10" means twice the work on one and not the other.
  if (candidate.unilateral === original.unilateral) score += 10;

  return score;
}

/** Short reason to show under a proposal, so the swap is not a black box. */
export function substituteReason(candidate: Exercise, originalId: string): string {
  const original = exerciseById(originalId);
  if (!original) return "";

  const shared = candidate.primary.filter(m => original.primary.includes(m));
  const sameKit = candidate.equipment === original.equipment;

  const muscles = shared.length > 0
    ? shared.map(m => MUSCLE_PT[m]).join(" e ")
    : "os mesmos músculos";

  return sameKit
    ? `Mesmo ${muscles}, mesmo equipamento.`
    : `Mesmo ${muscles}, outro equipamento.`;
}

const MUSCLE_PT: Record<MuscleGroup, string> = {
  peito: "peito", costas: "costas", ombro: "ombro", biceps: "bíceps", triceps: "tríceps",
  quadriceps: "quadríceps", posterior: "posterior", gluteo: "glúteo",
  panturrilha: "panturrilha", core: "core",
};
