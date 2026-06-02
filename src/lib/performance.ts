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
  hrmax_estimate: number;  // estimated from test avg_hr / 0.95
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

// ─── Friel HR Zones ───────────────────────────────────────────────────────────

/**
 * LTHR estimate from 3km test average HR.
 * Athletes sustain ~92.5% of LTHR during a ~12-min maximal effort.
 */
function estimateLTHR(avgHr: number): number {
  return Math.round(avgHr * 0.925);
}

/**
 * HRmax estimate from 3km test average HR.
 * Athletes average ~95% of HRmax during a maximal 3km effort.
 */
function estimateHRmax(avgHr: number): number {
  return Math.round(avgHr / 0.95);
}

/**
 * Build 5 Friel HR zones from LTHR.
 */
function buildHRZones(lthr: number): HRZone[] {
  return [
    {
      zone: 1,
      name: "Recuperação",
      description: "Corrida muito leve, recuperação ativa. Conversa fácil.",
      min_bpm: 0,
      max_bpm: Math.round(lthr * 0.81) - 1,
      color: "bg-blue-500",
      textColor: "text-blue-400",
    },
    {
      zone: 2,
      name: "Base Aeróbica",
      description: "Base aeróbica principal. A maior parte do volume deve ser aqui.",
      min_bpm: Math.round(lthr * 0.81),
      max_bpm: Math.round(lthr * 0.89),
      color: "bg-green-500",
      textColor: "text-green-400",
    },
    {
      zone: 3,
      name: "Aeróbico Moderado",
      description: "Esforço moderado a confortavelmente difícil. Use com cautela.",
      min_bpm: Math.round(lthr * 0.90),
      max_bpm: Math.round(lthr * 0.93),
      color: "bg-yellow-500",
      textColor: "text-yellow-400",
    },
    {
      zone: 4,
      name: "Limiar Anaeróbico",
      description: "Ritmo de corrida de limiar. Treinos de tempo e progressivos.",
      min_bpm: Math.round(lthr * 0.94),
      max_bpm: Math.round(lthr * 0.99),
      color: "bg-orange-500",
      textColor: "text-orange-400",
    },
    {
      zone: 5,
      name: "VO2max",
      description: "Esforço máximo. Tiros curtos de alta intensidade.",
      min_bpm: Math.round(lthr * 1.00),
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
 * Build 6 training paces from vVO2max (m/min).
 */
function buildTrainingPaces(vVO2max: number): TrainingPace[] {
  const pace = (pct: number) => mminToSecKm(vVO2max * pct);

  return [
    {
      name: "recovery",
      label: "Regenerativo",
      pace_min_sec: pace(0.56),
      pace_max_sec: pace(0.60),
      description: "Corrida muito leve de recuperação. Ideal para o dia seguinte a treinos intensos.",
      color: "text-blue-400",
    },
    {
      name: "easy",
      label: "Rodagem / Fácil",
      pace_min_sec: pace(0.62),
      pace_max_sec: pace(0.72),
      description: "Ritmo de rodagem. Base aeróbica. Maioria do seu volume semanal.",
      color: "text-green-400",
    },
    {
      name: "marathon",
      label: "Maratona",
      pace_min_sec: pace(0.78),
      pace_max_sec: pace(0.83),
      description: "Ritmo alvo de maratona. Longões e corridas de ritmo controlado.",
      color: "text-teal-400",
    },
    {
      name: "threshold",
      label: "Limiar / Tempo",
      pace_min_sec: pace(0.85),
      pace_max_sec: pace(0.88),
      description: "Ritmo de limiar anaeróbico. Treinos de tempo (20-40 min contínuos).",
      color: "text-yellow-400",
    },
    {
      name: "interval",
      label: "Intervalo / VO2max",
      pace_min_sec: pace(0.95),
      pace_max_sec: pace(1.00),
      description: "Ritmo de tiro para VO2max. Repetições de 3-5 min com recuperação.",
      color: "text-orange-400",
    },
    {
      name: "repetition",
      label: "Repetição / Velocidade",
      pace_min_sec: pace(1.05),
      pace_max_sec: pace(1.12),
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
 */
export function computeMetrics(
  distanceM: number,
  timeSeconds: number,
  avgHr?: number
): PerformanceMetrics {
  const vdot       = computeVDOT(distanceM, timeSeconds);
  const vVO2max    = vvo2maxFromVDOT(vdot);  // m/min
  const vo2max     = vdot; // VDOT ≈ VO2max in ml/kg/min

  const paceSecPerKm = mminToSecKm(distanceM / (timeSeconds / 60));

  // HR values — fall back to pace-based if no HR provided
  const lthr          = avgHr ? estimateLTHR(avgHr) : 0;
  const hrmaxEstimate = avgHr ? estimateHRmax(avgHr) : 0;

  const zones      = avgHr ? buildHRZones(lthr) : [];
  const paces      = buildTrainingPaces(vVO2max);
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
