/**
 * Today's recovery, decided once and said the same way everywhere.
 *
 * Readiness used to be computed in four places — the Saúde page, the morning
 * notification, the plan suggestion route and the coach inbox — each with its
 * own baseline window and its own idea of what "today's session" was. The
 * notification said one score at 05:30, the screen another at 08:00, and the
 * suggestion was built on a third. An athlete who notices two different numbers
 * for the same morning stops trusting both.
 *
 * Every surface now asks this function.
 */
import type { Readiness, ReadinessVerdict } from "@/lib/readiness";
import {
  readinessOn, sessionAdvice, buildVital, CALIBRATION_NIGHTS, type LoadDay,
} from "@/lib/health-view";
import { swapOffer, dayKeyOf, HARD_SESSION, type SwapOffer } from "@/lib/session-swap";
import type { HealthCheckin, WeeklyPlanData, WeeklyPlanDay, WellnessData } from "@/types";

export type RecoveryBasis = "watch" | "checkin" | "load" | "none";

export interface RecoveryToday {
  date: string;
  readiness: Readiness;
  score: number | null;
  verdict: ReadinessVerdict | null;
  /** What the number stands on, so every surface can say so. */
  basis: RecoveryBasis;
  /** Watch readings are arriving but the HRV baseline is not ready yet. */
  calibratingNights: number | null;
  /**
   * Nothing but training load behind the number, and no check-in today.
   * The one case where asking the athlete two questions changes the answer.
   */
  needsCheckin: boolean;
  session: WeeklyPlanDay | null;
  sessionDone: boolean;
  advice: { headline: string; detail: string };
  /** One line for the dashboard and a lock screen. */
  short: string;
  offer: SwapOffer | null;
}

export function buildRecoveryToday(input: {
  date: string;
  rows: WellnessData[];
  load: Record<string, LoadDay>;
  checkin: HealthCheckin | null;
  plan: WeeklyPlanData | null;
  /** Tomorrow's session when it lives in next week's plan (Sunday). */
  tomorrowOverride?: WeeklyPlanDay | null;
  doneKm: number;
  strengthDone: boolean;
}): RecoveryToday {
  const readiness = readinessOn(input.date, input.rows, input.load, input.checkin);
  const scored = readiness.components.length > 0;

  const hasWatch = readiness.components.some(c => c.auto && c.key !== "tsb");
  const hasCheckin = readiness.components.some(c => !c.auto);
  const hrv = buildVital("hrv", input.rows, input.date);
  const calibratingNights = !hasWatch && hrv.value != null && hrv.calibrating
    ? Math.max(1, CALIBRATION_NIGHTS - hrv.nBaseline)
    : null;

  const basis: RecoveryBasis = hasWatch ? "watch" : hasCheckin ? "checkin" : scored ? "load" : "none";

  const key = dayKeyOf(input.date);
  const session = input.plan?.days.find(d => d.day === key) ?? null;
  const tomorrowKey = dayKeyOf(addDay(input.date));
  const tomorrow = input.tomorrowOverride !== undefined
    ? input.tomorrowOverride
    : key === "Sun" ? null : input.plan?.days.find(d => d.day === tomorrowKey) ?? null;

  const sessionDone = session != null && session.type !== "rest"
    && (session.type === "strength" ? input.strengthDone : input.doneKm > 0);

  const advice = sessionAdvice(readiness, session, {
    doneKm: input.doneKm, strengthDone: input.strengthDone, tomorrow,
  });

  const hard = session != null && HARD_SESSION.has(session.type);
  const v = scored ? readiness.verdict : null;
  const short = sessionDone ? "Treino de hoje feito"
    : v === "alta" ? (hard ? "Pronto para o treino forte" : "Corpo recuperado")
    : v === "moderada" ? "Treine com margem"
    : v === "baixa" ? (hard ? "Recuperação baixa — dá para aliviar" : "Recuperação baixa — vá bem leve")
    : "Sem dados de recuperação";

  return {
    date: input.date,
    readiness,
    score: scored ? readiness.score : null,
    verdict: v,
    basis,
    calibratingNights,
    needsCheckin: basis !== "watch" && calibratingNights == null && input.checkin == null,
    session,
    sessionDone,
    advice,
    short,
    offer: swapOffer({ plan: input.plan, todayKey: key, verdict: v, done: sessionDone }),
  };
}

function addDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The label a surface puts beside the number, naming what it stands on. */
export function basisLabel(
  r: Pick<RecoveryToday, "basis" | "calibratingNights"> & { readiness?: Pick<Readiness, "coverage"> },
): string {
  if (r.basis === "watch") {
    // A score missing part of its inputs says so, next to where it says "relógio".
    const cov = r.readiness?.coverage;
    return cov && cov.present < cov.expected
      ? "Relógio + carga · " + cov.present + " de " + cov.expected + " sinais"
      : "Relógio + carga";
  }
  if (r.calibratingNights) return `Relógio calibrando · faltam ${r.calibratingNights} noites`;
  if (r.basis === "checkin") return "Check-in + carga";
  if (r.basis === "load") return "Só carga de treino";
  return "Sem dados";
}
