/**
 * Limiar Performance Calculations
 * Jack Daniels VDOT, Friel HR Zones, Training Paces, Riegel Race Predictions
 */

export interface HRZone {
  zone: number;
  name: string;
  description: string;
  min_bpm: number;
  max_bpm: number | null;
  color: string;     // tailwind bg- class
  textColor: string; // tailwind text- class
}

export interface TrainingPace {
  name: string;
  label: string;
  pace_min_sec: number; // sec/km slower end
  pace_max_sec: number; // sec/km faster end
  description: string;
  color: string; // tailwind text- class
}

export interface RacePrediction {
  distance_label: string;
  distance_km: number;
  predicted_seconds: number;
}

export interface PerformanceMetrics {
  vo2max: number;
  vdot: number;
  lthr: number;            // estimated LTHR from test avg_hr
  hrmax_estimate: number;  // measured max when recorded, else derived from avg_hr
  pace_sec_per_km: number; // test pace
  zones: HRZone[];
  paces: TrainingPace[];
  predictions: RacePrediction[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format seconds-per-km as "m:ss"
 */
export function paceToString(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format total seconds as "h:mm:ss" or "mm:ss" if < 1 hour
 */
export function timeToString(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Jack Daniels VDOT ────────────────────────────────────────────────────────

/**
 * Compute VDOT from a race/time trial result.
 * Formula from Jack Daniels' Running Formula.
 *
 * @param distanceM  distance in metres
 * @param timeSeconds  total time in seconds
 */
function computeVDOT(distanceM: number, timeSeconds: number): number {
  const T = timeSeconds / 60; // minutes
  const v = distanceM / T;    // m/min

  const pctVO2max =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * T) +
    0.2989558 * Math.exp(-0.1932605 * T);

  const O2cost = -4.60 + 0.182258 * v + 0.000104 * v * v;

  const vdot = O2cost / pctVO2max;
  return vdot;
}

/**
 * Derive vVO2max (m/min) from VDOT by solving the quadratic:
 *   0.000104·v² + 0.182258·v - (vdot + 4.60) = 0
 */
function vvo2maxFromVDOT(vdot: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(vdot + 4.60);
  const vVO2max = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return vVO2max; // m/min
}

/** Oxygen cost (ml/kg/min) of running at `v` metres per minute. */
function o2CostOf(v: number): number {
  return 0.000104 * v * v + 0.182258 * v - 4.60;
}

/**
 * The velocity (m/min) whose oxygen cost is `o2` — the inverse of `o2CostOf`.
 *
 * This is the function the pace table was missing. Daniels states his training
 * intensities as percentages of VO2MAX, and VO2 does not scale linearly with
 * speed: the relationship is the quadratic above. Multiplying vVO2max by 0.62
 * therefore does not give you the pace at 62% of VO2max — it gives you
 * something appreciably slower, and the gap widens the easier the run gets.
 */
function velocityForO2(o2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  return (-b + Math.sqrt(b * b + 4 * a * (o2 + 4.60))) / (2 * a);
}

/** Fraction of VO2max an athlete can hold for `minutes` (Daniels–Gilbert). */
function sustainableFraction(minutes: number): number {
  return 0.8
    + 0.1894393 * Math.exp(-0.012778 * minutes)
    + 0.2989558 * Math.exp(-0.1932605 * minutes);
}

/**
 * Race time (seconds) Daniels' equations predict for `metres` at a given VDOT.
 *
 * Solved by bisection because duration appears on both sides: the fraction of
 * VO2max you can sustain depends on how long you are out there, which depends
 * on how fast you go. Forty iterations converge well past the precision anyone
 * can run to.
 *
 * Exported because it is the honest anchor for the training paces below — and
 * because a test that checks paces against anything else is checking them
 * against an opinion.
 */
export function danielsRaceTime(vdot: number, metres: number): number {
  let lo = 30;         // seconds — faster than any human over any distance
  let hi = 60 * 60 * 12;
  for (let i = 0; i < 200; i++) {
    const t = (lo + hi) / 2;
    const predicted = o2CostOf(metres / (t / 60)) / sustainableFraction(t / 60);
    if (predicted > vdot) lo = t; else hi = t;
  }
  return (lo + hi) / 2;
}

// ─── Friel HR Zones ───────────────────────────────────────────────────────────

/**
 * LTHR estimate from a 3 km test.
 *
 * A ~12-15 minute maximal effort is run above lactate threshold, so threshold
 * heart rate sits *below* the test's average — but only modestly. The usual
 * conversion for a short time trial is ~95% of its average HR; the 92.5% this
 * used before pushed every zone about 4 bpm low, which is exactly what it looks
 * like from the road: easy runs capped under a heart rate you pass while
 * jogging.
 *
 * (An earlier comment here said athletes "sustain ~92.5% of LTHR" during the
 * test, which describes the inverse relationship. The code was right about the
 * direction and wrong about the size.)
 *
 * When the athlete recorded a max HR, it bounds the result: threshold sits at
 * roughly 85-92% of true HRmax, and no estimate should cross that ceiling.
 *
 * This is still an estimate. The protocol that actually measures LTHR is a
 * 30-minute time trial, averaging the final 20 minutes — a 3 km test is a proxy
 * for it, not a substitute.
 */
function estimateLTHR(avgHr: number, maxHr?: number): number {
  const fromAverage = avgHr * 0.95;
  if (maxHr && maxHr > 0) return Math.round(Math.min(fromAverage, maxHr * 0.92));
  return Math.round(fromAverage);
}

/**
 * HRmax from the test — measured when the athlete recorded it, estimated when
 * they did not.
 *
 * Reporting `avgHr / 0.95` next to a max the athlete actually recorded is how
 * the app ended up claiming 187 bpm for a test whose peak was 184. A measured
 * number always wins over a derived one.
 */
function estimateHRmax(avgHr: number, maxHr?: number): number {
  if (maxHr && maxHr > 0) return Math.round(maxHr);
  return Math.round(avgHr / 0.95);
}

/**
 * Build 5 Friel HR zones from LTHR.
 *
 * Each zone's ceiling comes from Friel's percentage of LTHR; each zone's floor
 * is the previous ceiling plus one. Deriving both ends from percentages left
 * holes: with LTHR 165, zone 2 topped at 147 (89%) and zone 3 opened at 149
 * (90%), so a run averaging 148 bpm belonged to no zone at all. Same at 154 and
 * 164. Contiguity has to be built in, not hoped for from rounding.
 */
function buildHRZones(lthr: number): HRZone[] {
  const ceiling = (pct: number) => Math.round(lthr * pct);

  const z1Max = ceiling(0.81) - 1;
  const z2Max = ceiling(0.89);
  const z3Max = ceiling(0.93);
  // Zone 5 starts *at* threshold — that boundary is the entire point of
  // LTHR-based zones, so it is anchored rather than rounded. Friel's 99% ceiling
  // for zone 4 and a contiguous band cannot both survive the rounding, and this
  // is the one that carries meaning.
  const z4Max = lthr - 1;

  return [
    {
      zone: 1,
      name: "Recuperação",
      description: "Corrida muito leve, recuperação ativa. Conversa fácil.",
      min_bpm: 0,
      max_bpm: z1Max,
      color: "bg-blue-500",
      textColor: "text-blue-400",
    },
    {
      zone: 2,
      name: "Base Aeróbica",
      description: "Base aeróbica principal. A maior parte do volume deve ser aqui.",
      min_bpm: z1Max + 1,
      max_bpm: z2Max,
      color: "bg-green-500",
      textColor: "text-green-400",
    },
    {
      zone: 3,
      name: "Aeróbico Moderado",
      description: "Esforço moderado a confortavelmente difícil. Use com cautela.",
      min_bpm: z2Max + 1,
      max_bpm: z3Max,
      color: "bg-yellow-500",
      textColor: "text-yellow-400",
    },
    {
      zone: 4,
      name: "Limiar Anaeróbico",
      description: "Ritmo de corrida de limiar. Treinos de tempo e progressivos.",
      min_bpm: z3Max + 1,
      max_bpm: z4Max,
      color: "bg-orange-500",
      textColor: "text-orange-400",
    },
    {
      zone: 5,
      name: "VO2max",
      description: "Esforço máximo. Tiros curtos de alta intensidade.",
      min_bpm: z4Max + 1,
      max_bpm: null,
      color: "bg-red-500",
      textColor: "text-red-400",
    },
  ];
}

// ─── Training Paces ───────────────────────────────────────────────────────────

/**
 * Convert m/min to sec/km: (1000 / v) * 1 = 60000/v ... wait,
 * v is in m/min, so 1 km = 1000 m, time = 1000/v min = (1000/v)*60 sec
 */
function mminToSecKm(vMmin: number): number {
  return (1000 / vMmin) * 60;
}

/**
 * The six training paces.
 *
 * Anchored two different ways, because the zones are defined two different ways
 * and pretending otherwise is what put every easy run half a minute per
 * kilometre too slow.
 *
 *   • Easy and recovery are *physiological*: a share of VO2max. They come from
 *     the oxygen cost curve, inverted — 65% of VO2max, not 65% of top speed.
 *
 *   • Marathon, threshold, interval and repetition are *race paces*, by
 *     Daniels' own definition: marathon pace is marathon pace, threshold is
 *     what you could hold for an hour, interval is 3–5 km pace, repetition is
 *     1500 m pace. So they are computed from the race times his equations
 *     predict, rather than from a percentage applied to a velocity.
 *
 * The previous version multiplied vVO2max by Daniels' %VO2max figures. Those
 * two agree exactly at 100% and diverge as the intensity drops, which is why
 * the interval pace looked right, threshold was 6 s/km off, easy was 29 s/km
 * off and the recovery pace was a walk.
 */
function buildTrainingPaces(vdot: number): TrainingPace[] {
  /** Pace (sec/km) at a given share of VO2max. */
  const atPercent = (pct: number) => mminToSecKm(velocityForO2(vdot * pct));
  /** Pace (sec/km) of a race over `metres`. */
  const atRace = (metres: number) => danielsRaceTime(vdot, metres) / (metres / 1000);

  // Threshold is the hour: `sustainableFraction(60)` is precisely the share of
  // VO2max that definition resolves to, so no separate race distance is needed.
  const threshold = atPercent(sustainableFraction(60));
  const marathon  = atRace(42195);
  const repetition = atRace(1500);

  return [
    {
      name: "recovery",
      label: "Regenerativo",
      pace_min_sec: atPercent(0.59),
      pace_max_sec: atPercent(0.65),
      description: "Corrida muito leve de recuperação. Ideal para o dia seguinte a treinos intensos.",
      color: "text-blue-400",
    },
    {
      name: "easy",
      label: "Rodagem / Fácil",
      pace_min_sec: atPercent(0.65),
      pace_max_sec: atPercent(0.74),
      description: "Ritmo de rodagem. Base aeróbica. Maioria do seu volume semanal.",
      color: "text-green-400",
    },
    {
      name: "marathon",
      // A band around the predicted marathon rather than a single number: it is
      // a target to settle into, and nobody holds one pace for three hours.
      label: "Maratona",
      pace_min_sec: marathon * 1.02,
      pace_max_sec: marathon * 0.98,
      description: "Ritmo alvo de maratona. Longões e corridas de ritmo controlado.",
      color: "text-teal-400",
    },
    {
      name: "threshold",
      // Tight on purpose. Threshold has a physiological edge — run it 10 s/km
      // fast and it stops being threshold work and starts costing recovery.
      label: "Limiar / Tempo",
      pace_min_sec: threshold * 1.015,
      pace_max_sec: threshold * 0.985,
      description: "Ritmo de limiar anaeróbico. Treinos de tempo (20-40 min contínuos).",
      color: "text-yellow-400",
    },
    {
      name: "interval",
      label: "Intervalo / VO2max",
      pace_min_sec: atRace(5000),
      pace_max_sec: atRace(3000),
      description: "Ritmo de tiro para VO2max. Repetições de 3-5 min com recuperação.",
      color: "text-orange-400",
    },
    {
      name: "repetition",
      label: "Repetição / Velocidade",
      pace_min_sec: repetition,
      pace_max_sec: repetition * 0.96,
      description: "Ritmo de repetição neuromuscular. Tiros curtos de 200-400m.",
      color: "text-red-400",
    },
  ];
}

// ─── Riegel Race Predictions ──────────────────────────────────────────────────

/**
 * Riegel formula: T2 = T1 × (D2/D1)^1.06
 *
 * @param testDistanceM   reference distance in metres
 * @param testTimeSeconds  reference time in seconds
 */
function buildRacePredictions(
  testDistanceM: number,
  testTimeSeconds: number
): RacePrediction[] {
  const targets: Array<{ label: string; km: number }> = [
    { label: "5 km",       km: 5     },
    { label: "10 km",      km: 10    },
    { label: "Meia",       km: 21.1  },
    { label: "Maratona",   km: 42.2  },
  ];

  return targets.map(({ label, km }) => {
    const d2 = km * 1000;
    const predicted = testTimeSeconds * Math.pow(d2 / testDistanceM, 1.06);
    return {
      distance_label: label,
      distance_km: km,
      predicted_seconds: Math.round(predicted),
    };
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Compute all performance metrics from a test result.
 *
 * @param distanceM    distance covered in metres (typically 3000)
 * @param timeSeconds  total time in seconds
 * @param avgHr        optional average heart rate during the test
 * @param maxHr        optional peak heart rate; measured beats estimated
 */
export function computeMetrics(
  distanceM: number,
  timeSeconds: number,
  avgHr?: number,
  maxHr?: number
): PerformanceMetrics {
  // Degenerate input has to stop here rather than propagate.
  //
  // A zero distance or time makes the velocity infinite (or zero), and every
  // pace downstream becomes Infinity — which renders as a real-looking number,
  // gets stored, and quietly poisons the plan, the zones and the advisor. The
  // API validates its own inputs, but this function is the root of the app and
  // must not depend on every caller remembering to.
  if (!Number.isFinite(distanceM) || !Number.isFinite(timeSeconds)
      || distanceM <= 0 || timeSeconds <= 0) {
    return {
      vo2max: 0, vdot: 0, lthr: 0, hrmax_estimate: 0, pace_sec_per_km: 0,
      zones: [], paces: [], predictions: [],
    };
  }

  const vdot       = computeVDOT(distanceM, timeSeconds);
  const vo2max     = vdot; // VDOT ≈ VO2max in ml/kg/min

  const paceSecPerKm = mminToSecKm(distanceM / (timeSeconds / 60));

  // HR values — fall back to pace-based if no HR provided
  const lthr          = avgHr ? estimateLTHR(avgHr, maxHr) : 0;
  const hrmaxEstimate = avgHr ? estimateHRmax(avgHr, maxHr) : 0;

  const zones      = avgHr ? buildHRZones(lthr) : [];
  const paces      = buildTrainingPaces(vdot);
  const predictions = buildRacePredictions(distanceM, timeSeconds);

  return {
    vo2max:          Math.round(vo2max * 10) / 10,
    vdot:            Math.round(vdot * 10) / 10,
    lthr,
    hrmax_estimate:  hrmaxEstimate,
    pace_sec_per_km: paceSecPerKm,
    zones,
    paces,
    predictions,
  };
}
