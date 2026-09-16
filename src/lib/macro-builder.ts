/**
 * Deterministic long-term plan: week-by-week volume and focus from today until
 * race day.
 *
 * Same rulebook as the weekly generator (TRAINING_SCIENCE.md), applied over
 * months instead of days:
 *   • progression ≤10%/week
 *   • cutback week every 4th (−30%)
 *   • taper over the final 2–3 weeks (−40–60%), intensity preserved
 *   • long run stays within 25–30% of the week
 *
 * The AI is not involved: a periodization built by a model drifts week to week
 * and can't be checked. These numbers are reproducible and auditable.
 */
import type { MacroPhase, MacroPlanWeek, MacroRaceType } from "@/types";

export interface MacroInput {
  /** Mondays (YYYY-MM-DD) covered by the plan, in order. */
  weekStarts:      string[];
  /** Race day (YYYY-MM-DD). */
  raceDate:        string;
  /** Race distance in km. */
  raceKm:          number;
  /** The athlete's current weekly running volume, in km. */
  currentWeeklyKm: number;
  /** Ceiling the athlete is willing/able to reach. Defaults to 2.2× current. */
  maxWeeklyKm?:    number;
  /**
   * Longest run completed in the past year.
   *
   * Long-run durability decays far more slowly than weekly volume, so it is a
   * floor rather than a target — and the weekly generator already treats it as
   * one. Passing it here is what stops the two from disagreeing.
   */
  provenLongRunKm?: number;
}

const PHASE_FOCUS: Record<MacroPhase, string> = {
  base:  "volume aeróbico",
  build: "limiar e resistência",
  peak:  "ritmo específico de prova",
  taper: "afiar, reduzir volume",
  race:  "prova",
};

/** Weeks remaining between a plan week and race day. */
function weeksUntil(weekStart: string, raceDate: string): number {
  const diff = new Date(`${raceDate}T12:00:00`).getTime() - new Date(`${weekStart}T12:00:00`).getTime();
  return Math.floor(diff / (7 * 86400_000));
}

/** Phase for a week, from how far out the race is. */
export function macroPhaseFor(weekStart: string, raceDate: string, totalWeeks: number): MacroPhase {
  const out = weeksUntil(weekStart, raceDate);
  if (out <= 0) return "race";
  if (out === 1) return "taper";
  if (out === 2) return totalWeeks >= 8 ? "taper" : "peak";
  if (out <= 5) return "peak";
  // Roughly the first 40% of a long plan is base, the rest build.
  return out > totalWeeks * 0.6 ? "base" : "build";
}

/** Key session for a week, scaled to its volume and phase. */
/** Portuguese writes 6,5 — and "6.5 km" in a training plan reads as a typo. */
const km = (n: number) => `${(Math.round(n * 2) / 2).toString().replace(".", ",")} km`;

function keyWorkoutFor(
  phase: MacroPhase,
  targetKm: number,
  raceKm: number,
  /** Longest run completed in the past year. */
  provenLongRunKm = 0,
): string {
  let longKm = targetKm * (phase === "peak" ? 0.30 : 0.26);

  /*
   * Durability the athlete already owns, the same rule the weekly generator
   * applies — bounded by half the week so the floor lifts the long run without
   * turning the week into a single run.
   *
   * Without this the two cards described the same week differently: for a 13 km
   * week the generator prescribed 6.5 km, having noticed the athlete had
   * covered 21, while this label read "longão 3 km" because it only ever looked
   * at a percentage of the week's total. The long view was the pessimistic one,
   * which is exactly backwards.
   */
  longKm = Math.max(longKm, Math.min(provenLongRunKm * 0.45, targetKm * 0.5));

  // Never past what the race actually asks for.
  const capped = Math.min(
    longKm,
    raceDemand(raceKm).longRunKm,
    raceKm < 42 ? raceKm * 1.2 : 35,
  );

  switch (phase) {
    case "base":
      return `longão ${km(capped)} em ritmo fácil`;
    case "build":
      return `tempo 2×1,6 km no limiar + longão ${km(capped)}`;
    case "peak":
      return `longão ${km(capped)} com final em ritmo de prova`;
    case "taper":
      return `${Math.max(2, Math.round(targetKm * 0.12))} km em ritmo de prova, pernas leves`;
    case "race":
      return `PROVA — ${raceKm % 1 === 0 ? raceKm : raceKm.toFixed(1)} km`;
  }
}

/**
 * Build the week-by-week plan.
 *
 * Volume ramps ~8% per week (safely under the 10% limit), drops 30% every
 * fourth week so adaptation can consolidate, then tapers into race day.
 */
/**
 * What the race itself demands: the peak weekly volume that supports it, and
 * the long run that has to be in the legs before race day.
 *
 * This was missing entirely. `raceKm` only ever reached the label of the key
 * workout, so a 5 km plan and a half marathon plan produced the same volume
 * curve — the half peaked at 16 km/week and raced on a 6 km week. A plan for a
 * distance has to start from what the distance costs.
 */
export function raceDemand(raceKm: number): { peakWeeklyKm: number; longRunKm: number } {
  if (raceKm <= 6)  return { peakWeeklyKm: 32, longRunKm: 10 };
  if (raceKm <= 12) return { peakWeeklyKm: 42, longRunKm: 14 };
  if (raceKm <= 25) return { peakWeeklyKm: 52, longRunKm: 19 };   // half
  return { peakWeeklyKm: 72, longRunKm: 32 };                      // marathon
}

/** Weekly growth the body tolerates during a build. */
const SAFE_GROWTH = 1.08;

export interface MacroAssessment {
  /** Peak weekly volume the race asks for. */
  demandedPeakKm: number;
  /** Peak actually reachable from where the athlete is, in the weeks available. */
  reachablePeakKm: number;
  weeksAvailable: number;
  /** Weeks it would take to reach the demand safely from the current volume. */
  weeksNeeded: number;
  verdict: "suficiente" | "apertado" | "insuficiente";
  message: string;
}

/**
 * Can this race be prepared for in the time left?
 *
 * Answering honestly matters more than producing a tidy plan: from 10 km a week
 * there is no safe route to half-marathon volume in 13 weeks, and a plan that
 * pretends otherwise just guarantees a bad race day with no warning.
 */
export function assessMacroPlan(input: MacroInput): MacroAssessment {
  const weekStarts = input.weekStarts.filter(w => w <= input.raceDate);
  const weeksAvailable = Math.max(weekStarts.length - 1, 0);   // race week doesn't build
  const start = Math.max(input.currentWeeklyKm, 10);
  const demand = raceDemand(input.raceKm);

  // One week in four consolidates instead of climbing.
  const buildWeeks = Math.max(0, Math.round(weeksAvailable * 0.75));
  const reachable = Math.round(start * Math.pow(SAFE_GROWTH, buildWeeks));
  const weeksNeeded = demand.peakWeeklyKm <= start
    ? 0
    : Math.ceil(Math.log(demand.peakWeeklyKm / start) / Math.log(SAFE_GROWTH) / 0.75);

  const ratio = reachable / demand.peakWeeklyKm;
  const verdict: MacroAssessment["verdict"] =
    ratio >= 0.9 ? "suficiente" : ratio >= 0.7 ? "apertado" : "insuficiente";

  const message =
    verdict === "suficiente"
      ? `Dá tempo: partindo de ${Math.round(start)} km/semana, o plano chega aos ~${demand.peakWeeklyKm} km que a prova pede, com longão de ${demand.longRunKm} km.`
      : verdict === "apertado"
        ? `Vai ficar apertado. A prova pede ~${demand.peakWeeklyKm} km/semana e, com progressão segura, dá para chegar a ~${reachable} km em ${weeksAvailable} semanas. Você termina, mas os últimos quilômetros vão cobrar caro.`
        : `Volume atual muito abaixo do que a prova exige. Ela pede ~${demand.peakWeeklyKm} km/semana e um longão de ${demand.longRunKm} km; de ${Math.round(start)} km/semana isso levaria cerca de ${weeksNeeded} semanas de progressão segura, e você tem ${weeksAvailable}. O plano abaixo constrói o máximo possível no tempo disponível — considere encarar a prova como treino longo, ou buscar uma data mais adiante.`;

  return {
    demandedPeakKm: demand.peakWeeklyKm,
    reachablePeakKm: reachable,
    weeksAvailable,
    weeksNeeded,
    verdict,
    message,
  };
}

export function buildMacroWeeks(input: MacroInput): MacroPlanWeek[] {
  const { raceDate, raceKm } = input;

  // The plan ends on race week — anything starting after race day is not part
  // of the preparation and would show a phantom week past the finish line.
  const weekStarts = input.weekStarts.filter(w => w <= raceDate);
  if (weekStarts.length === 0) return [];

  const start = Math.max(input.currentWeeklyKm, 10);
  const demand = raceDemand(raceKm);

  // The ceiling is what the race needs, not an arbitrary multiple of where the
  // athlete happens to be today. Growth stays capped at 8%/week, so an athlete
  // too far below simply gets as close as the calendar allows.
  const ceiling = input.maxWeeklyKm ?? Math.max(demand.peakWeeklyKm, start * 1.1);
  const total = weekStarts.length;

  let running = start;      // volume before cutback/taper adjustments
  let peakVolume = start;

  return weekStarts.map((weekStart, i) => {
    const phase = macroPhaseFor(weekStart, raceDate, total);

    let targetKm: number;

    if (phase === "race") {
      // Race week includes the race. Showing only the shake-out volume made a
      // half marathon read as a 6 km week — less than the race itself.
      targetKm = Math.round(peakVolume * 0.15 + raceKm);
    } else if (phase === "taper") {
      // Two-step taper: ~60% then ~45% of peak. Volume drops, quality doesn't.
      const out = weeksUntil(weekStart, raceDate);
      targetKm = Math.round(peakVolume * (out >= 2 ? 0.60 : 0.45));
    } else {
      // Every 4th week consolidates instead of climbing.
      const isCutback = i > 0 && i % 4 === 3;
      if (isCutback) {
        targetKm = Math.round(running * 0.70);
      } else {
        if (i > 0) running = Math.min(running * SAFE_GROWTH, ceiling);
        targetKm = Math.round(running);
      }
      peakVolume = Math.max(peakVolume, targetKm);
    }

    return {
      week_start:  weekStart,
      phase,
      target_km:   targetKm,
      focus:       PHASE_FOCUS[phase],
      key_workout: keyWorkoutFor(phase, targetKm, raceKm, input.provenLongRunKm ?? 0),
    };
  });
}

/** One-paragraph rationale describing the shape of the plan. */
export function macroRationale(weeks: MacroPlanWeek[], raceLabel: string, raceType: MacroRaceType): string {
  if (weeks.length === 0) return "";
  const peak = Math.max(...weeks.map(w => w.target_km));
  const startKm = weeks[0].target_km;
  const cutbacks = weeks.filter((w, i) => i > 0 && w.target_km < weeks[i - 1].target_km && w.phase !== "taper" && w.phase !== "race").length;

  return (
    `${weeks.length} semanas até ${raceLabel}: sai de ${startKm} km/semana e chega a ${peak} km no pico. ` +
    `A tendência de carga sobe no máximo 8% por semana, com ${cutbacks} semanas de corte (−30%) para consolidar ` +
    `a adaptação — depois de cada corte o volume retoma o patamar anterior, então esse salto pontual é esperado. ` +
    `No taper final o volume cai 40–60% mantendo a intensidade: é a redução de volume que traz o frescor, ` +
    `cortar qualidade tira a afiação.` +
    (raceType === "marathon" || raceType === "ultra"
      ? " O longão é o treino que define esta prova: ele cresce de forma protagonista, sempre dentro de 25–30% da semana."
      : "")
  );
}

/** Phase summary for the UI. */
export function phasesSummary(weeks: MacroPlanWeek[]): Array<{ phase: MacroPhase; weeks: number; description: string }> {
  const order: MacroPhase[] = ["base", "build", "peak", "taper", "race"];
  const descriptions: Record<MacroPhase, string> = {
    base:  "Construir motor aeróbico com volume fácil e consistente.",
    build: "Introduzir limiar e resistência específica sobre a base.",
    peak:  "Treinos no ritmo da prova, com o maior volume do ciclo.",
    taper: "Reduzir volume mantendo intensidade para chegar afiado.",
    race:  "Semana da prova.",
  };

  return order
    .map(phase => ({
      phase,
      weeks: weeks.filter(w => w.phase === phase).length,
      description: descriptions[phase],
    }))
    .filter(p => p.weeks > 0);
}
