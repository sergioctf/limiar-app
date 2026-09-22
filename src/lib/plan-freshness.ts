/**
 * Is the stored plan still the plan this athlete's configuration would produce?
 *
 * Regenerating by hand was never a task anyone wanted; it was a task the app
 * failed to notice was needed. Record a 3 km test and every pace in the week is
 * out of date. Move a running day and the week describes a schedule you no
 * longer keep. The plan sat there looking authoritative and being wrong, and
 * the only signal was a button labelled "Regenerar" that gave no reason to
 * press it.
 *
 * So the plan carries a fingerprint of what it was built from, and the app
 * compares. Cheap to compute, cheap to store, and it names the reason — which
 * is the difference between "your plan is out of date" and a prompt someone
 * dismisses forever.
 */
import type { TrainingPrefs } from "@/types";
import type { StrengthPrefs } from "@/lib/strength-prefs";

/**
 * Bump when a change to the engine makes previously generated plans wrong.
 *
 * This is the only mechanism that reaches plans already sitting in the
 * database. A fix nobody regenerates into is a fix nobody received.
 *
 *   1 → original
 *   2 → training paces re-derived from %VO2max and race pace. The old table
 *       applied Daniels' %VO2max figures to velocity, which left easy running
 *       ~30 s/km and recovery ~55 s/km too slow at every VDOT.
 *   3 → the plan progresses again. Three faults froze it: the volume floor was
 *       anchored on the previous week's *planned* kilometres rather than the
 *       ones actually run, so a half-completed week set a floor the athlete
 *       could never rise above; `weekIndex` was never passed to
 *       `planWeeklyVolume`, so its every-fourth-week cutback had never once
 *       fired; and the quality session was a pure function of weekly volume, so
 *       a frozen volume produced a frozen session. Sérgio ran six consecutive
 *       weeks of "6 km easy · 3×400 m · 9.5 km long · 19.0 km".
 *   4 → session variety (repetitions, hills, fartlek, progressions) rotating by
 *       block; patient ramp when no race is dated; the 3 km test scheduled as a
 *       session rather than only pushed as a notification.
 *   5 → a semana cresce com teto, tem forma e respeita o mínimo do atleta
 *       (Sérgio, 21–22/09). Três coisas: a trava de volume adotava o que foi
 *       corrido sem limite — uma troca de treino subiu a semana 19 → 24,5 km,
 *       +29% — e agora tem teto variável conforme o desempenho
 *       (`growthCeiling`); a rodagem era a válvula de escape do volume e saía
 *       do tamanho do longão, e agora tem teto de 70% dele, com a sobra indo
 *       para o aquecimento e o desaquecimento do dia de tiro; e a semana de
 *       recuperação prescrevia corridas de 3 km para quem configurou 5 km como
 *       mínimo — agora tira uma corrida em vez de encurtar todas.
 */
export const PLAN_ENGINE_VERSION = 5;

/** One short hash per input, so a mismatch can say which input moved. */
export interface PlanFingerprint {
  engine:   number;
  fitness:  string;   // VDOT + LTHR
  week:     string;   // running/lifting days, long run, quality count, floors
  sports:   string;   // practiced sports, including the tier-2 schedule
  strength: string;   // muscles per day, equipment, goal
}

export interface PlanInputs {
  vdot:  number | null;
  lthr:  number | null;
  prefs: TrainingPrefs;
  sports: readonly string[];
  strengthPrefs: StrengthPrefs | null;
}

/**
 * FNV-1a, 32 bits, hex.
 *
 * Not a security boundary — the worst a collision does is skip one prompt — and
 * the alternative is storing the whole configuration inside every plan.
 */
function hash(value: unknown): string {
  const text = JSON.stringify(value ?? null);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function planFingerprint(input: PlanInputs): PlanFingerprint {
  const p = input.prefs;

  return {
    engine: PLAN_ENGINE_VERSION,
    // Rounded: VDOT wobbles in the third decimal between recomputations, and a
    // plan is not stale because a float moved.
    fitness: hash([
      input.vdot == null ? null : Math.round(input.vdot * 10) / 10,
      input.lthr == null ? null : Math.round(input.lthr),
    ]),
    week: hash([
      [...(p.runDays ?? [])].sort(),
      [...(p.strengthDays ?? [])].sort(),
      p.longRunDay ?? null,
      p.qualityPerWeek ?? null,
      p.minRunKm ?? null,
      p.minLongRunKm ?? null,
      // Appended only when present: adding it unconditionally would change every
      // stored hash and put the "plano desatualizado" banner in front of every
      // athlete at once — the start of the 31/08 incident.
      ...(p.excludedQuality?.length ? [[...p.excludedQuality].sort()] : []),
      // Same rule: only when set, so nobody else's plan turns stale because the field exists.
      ...(p.lightDays?.length ? [["light", [...p.lightDays].sort()]] : []),
    ]),
    sports: hash([
      [...input.sports].sort(),
      // Sorted by sport so re-saving the same schedule in another order is not
      // treated as a change.
      Object.entries(p.otherDays ?? {}).sort().map(([s, d]) => [s, [...(d ?? [])].sort()]),
    ]),
    strength: hash(
      input.strengthPrefs
        ? [
            input.strengthPrefs.goal,
            input.strengthPrefs.experience,
            [...input.strengthPrefs.equipment].sort(),
            input.strengthPrefs.days.map(d => [d.day, [...d.muscles].sort(), d.exercises ?? null]),
          ]
        : null,
    ),
  };
}

export type StaleReason = "engine" | "fitness" | "week" | "sports" | "strength";

/**
 * Verb phrases with the subject removed, so several of them share one "Você"
 * instead of stuttering — "você registrou um teste e você mudou os dias".
 * `engine` has no place here: the app changed, not the athlete.
 */
const ATHLETE_REASON: Record<Exclude<StaleReason, "engine">, string> = {
  fitness:  "registrou um teste novo",
  week:     "mudou os dias da sua semana",
  sports:   "mudou seus esportes",
  strength: "mudou a configuração da musculação",
};

const ENGINE_REASON = "O cálculo dos ritmos de treino foi corrigido";

export interface Staleness {
  stale:   boolean;
  reasons: StaleReason[];
  /** Ready to render: "você registrou um teste novo e mudou os dias da semana". */
  message: string;
}

/**
 * Compare a stored fingerprint against what the athlete's configuration says now.
 *
 * A plan with no fingerprint at all predates this check. It is reported stale
 * so it gets rebuilt once — those are exactly the plans carrying the old pace
 * table.
 */
export function planStaleness(
  stored: Partial<PlanFingerprint> | null | undefined,
  current: PlanFingerprint,
): Staleness {
  if (!stored) {
    return { stale: true, reasons: ["engine"], message: `${ENGINE_REASON}.` };
  }

  const reasons: StaleReason[] = [];
  if (stored.engine !== current.engine)     reasons.push("engine");
  if (stored.fitness !== current.fitness)   reasons.push("fitness");
  if (stored.week !== current.week)         reasons.push("week");
  if (stored.sports !== current.sports)     reasons.push("sports");
  if (stored.strength !== current.strength) reasons.push("strength");

  return { stale: reasons.length > 0, reasons, message: describe(reasons) };
}

function describe(reasons: StaleReason[]): string {
  const mine = reasons.filter((r): r is Exclude<StaleReason, "engine"> => r !== "engine");
  const athlete = mine.length > 0
    ? `Você ${joinPt(mine.map(r => ATHLETE_REASON[r]))}`
    : "";

  if (!reasons.includes("engine")) return athlete ? `${athlete}.` : "";
  // "também" because the athlete's own change is the second thing that happened.
  return athlete ? `${ENGINE_REASON}. Você também ${athlete.slice("Você ".length)}.` : `${ENGINE_REASON}.`;
}

function joinPt(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}
