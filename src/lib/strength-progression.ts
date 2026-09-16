/**
 * Load progression from logged performance.
 *
 * Double progression plus RIR autoregulation (TRAINING_SCIENCE.md §8.6): climb
 * the rep range at a given load, then add weight and drop back to the bottom of
 * the range. RIR reported by the athlete corrects the estimate — a set that
 * finished with 4 reps in reserve was too light regardless of what the plan said.
 */
import { exerciseById, type MuscleGroup } from "@/lib/exercises";

export interface LoggedSet {
  date:       string;   // YYYY-MM-DD
  exerciseId: string;
  setIndex:   number;
  weightKg:   number | null;
  reps:       number | null;
  rir:        number | null;
}

export interface SessionSummary {
  date:      string;
  topWeight: number | null;
  totalReps: number;
  sets:      number;
  avgRir:    number | null;
  /** All sets reached the top of the prescribed range. */
  maxedRange: boolean;
  /**
   * Every set as it was logged, in order.
   *
   * `topWeight` alone erases the shape of the session: 40×12 / 45×10 / 50×8 and
   * 50×8 / 50×8 / 50×8 both report a top of 50 kg, and only one of them is a
   * pyramid. An athlete repeating last week's progression needs the sequence,
   * not its maximum.
   */
  detail: Array<{ setIndex: number; weightKg: number | null; reps: number | null; rir: number | null }>;
}

export interface ProgressionAdvice {
  /** Suggested working load for the next session, when it can be derived. */
  weightKg:  number | null;
  /** Short human explanation — always shown, never a bare number. */
  reason:    string;
  /** Nothing has moved in a while and something should change. */
  stalled:   boolean;
  /** Previous session, for reference while lifting. */
  last:      SessionSummary | null;
}

/** Smallest sensible jump for the muscles involved. */
function loadIncrement(exerciseId: string): number {
  const ex = exerciseById(exerciseId);
  if (!ex) return 2.5;
  const lower: MuscleGroup[] = ["quadriceps", "posterior", "gluteo"];
  const isLower = ex.primary.some(m => lower.includes(m));
  // Big lower-body lifts tolerate bigger jumps than isolation work.
  if (ex.category === "composto" && isLower) return 5;
  if (ex.category === "composto") return 2.5;
  if (ex.category === "isolado")  return 1.25;
  return 2.5;
}

/** Group raw sets into one summary per session, most recent first. */
export function summarizeSessions(
  sets: LoggedSet[],
  repRange?: [number, number],
): SessionSummary[] {
  const byDate = new Map<string, LoggedSet[]>();
  for (const s of sets) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }

  const summaries: SessionSummary[] = [];
  byDate.forEach((list, date) => {
    const weights = list.map(s => s.weightKg).filter((w): w is number => w != null && w > 0);
    const reps    = list.map(s => s.reps ?? 0);
    const rirs    = list.map(s => s.rir).filter((r): r is number => r != null);

    summaries.push({
      date,
      topWeight: weights.length ? Math.max(...weights) : null,
      totalReps: reps.reduce((a, b) => a + b, 0),
      sets: list.length,
      avgRir: rirs.length ? Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10 : null,
      maxedRange: repRange ? reps.length > 0 && reps.every(r => r >= repRange[1]) : false,
      detail: [...list]
        .sort((a, b) => a.setIndex - b.setIndex)
        .map(s => ({ setIndex: s.setIndex, weightKg: s.weightKg, reps: s.reps, rir: s.rir })),
    });
  });

  return summaries.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * What to lift next.
 *
 * Deliberately conservative: it only raises load when the athlete either
 * completed the whole rep range or reported having reps to spare. Guessing
 * upward from a single hard session is how people get hurt.
 */
export function nextTarget(
  sets: LoggedSet[],
  prescription: { reps: [number, number]; rir: number; exerciseId: string },
): ProgressionAdvice {
  const sessions = summarizeSessions(sets, prescription.reps);
  const last = sessions[0] ?? null;

  if (!last) {
    return {
      weightKg: null,
      reason: "Primeira vez: escolha uma carga que você pare com ~2 repetições sobrando e registre.",
      stalled: false,
      last: null,
    };
  }

  const increment = loadIncrement(prescription.exerciseId);
  const weight = last.topWeight;

  // No load recorded (bodyweight work) — progress by reps instead.
  if (weight == null) {
    return {
      weightKg: null,
      reason: last.maxedRange
        ? "Você fechou a faixa toda. Aumente a dificuldade (mais lento, pausa, ou peso extra)."
        : "Suba as repetições dentro da faixa antes de aumentar a dificuldade.",
      stalled: false,
      last,
    };
  }

  // Same load for three sessions with nothing improving = stalled.
  const sameLoad = sessions.slice(0, 3).filter(s => s.topWeight === weight);
  const stalled = sameLoad.length >= 3 &&
    sameLoad[0].totalReps <= sameLoad[sameLoad.length - 1].totalReps;

  if (stalled) {
    return {
      weightKg: Math.round((weight * 0.9) / increment) * increment,
      reason: `Mesma carga há ${sameLoad.length} sessões sem evoluir. Reduza ~10% por uma semana e volte a subir — é assim que se quebra um platô.`,
      stalled: true,
      last,
    };
  }

  // Reported far from failure → the load was too light.
  if (last.avgRir != null && last.avgRir >= prescription.rir + 2) {
    return {
      weightKg: weight + increment * 2,
      reason: `Você terminou com ~${last.avgRir} repetições sobrando (alvo: ${prescription.rir}). A carga estava leve — suba ${increment * 2} kg.`,
      stalled: false,
      last,
    };
  }

  // Completed the whole range → time to add load (double progression).
  if (last.maxedRange) {
    return {
      weightKg: weight + increment,
      reason: `Você fechou ${prescription.reps[1]} repetições em todas as séries. Suba ${increment} kg e volte para ${prescription.reps[0]} repetições.`,
      stalled: false,
      last,
    };
  }

  // Overshot the effort target → hold or ease off slightly.
  if (last.avgRir != null && last.avgRir < prescription.rir - 1) {
    return {
      weightKg: weight,
      reason: `Última sessão ficou mais pesada que o alvo (RIR ${last.avgRir}). Repita a carga e busque mais repetições.`,
      stalled: false,
      last,
    };
  }

  return {
    weightKg: weight,
    reason: `Mantenha ${weight} kg e some repetições até fechar ${prescription.reps[1]} em todas as séries.`,
    stalled: false,
    last,
  };
}
