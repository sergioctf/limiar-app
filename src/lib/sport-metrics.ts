/**
 * Sport-specific metrics. Running is measured in min/km, but that unit is
 * meaningless for the other sports: swimmers think in min/100 m and cyclists in
 * km/h. Heart-rate zones also differ — cycling LTHR sits below running LTHR for
 * the same athlete, so reusing the running zones on the bike overstates effort.
 */
import { toSportKey, type PrimarySport, type SportKey } from "@/lib/sports";

/** Swimming pace, in seconds per 100 m. */
export function swimPacePer100m(distanceM: number | null, durationSeconds: number | null): number | null {
  if (!distanceM || !durationSeconds || distanceM <= 0 || durationSeconds <= 0) return null;
  return Math.round((durationSeconds / distanceM) * 100);
}

/** Cycling average speed, in km/h. */
export function cyclingSpeedKmh(distanceM: number | null, durationSeconds: number | null): number | null {
  if (!distanceM || !durationSeconds || distanceM <= 0 || durationSeconds <= 0) return null;
  return Math.round((distanceM / 1000) / (durationSeconds / 3600) * 10) / 10;
}

/** Format seconds as m:ss (for pace-style values). */
export function formatMinSec(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The headline metric for a session, in the unit that sport is actually
 * measured in. Returns null when there isn't enough data.
 */
export function primarySportMetric(activity: {
  sport_type?: string | null;
  distance_m?: number | null;
  duration_seconds?: number | null;
}): { label: string; value: string } | null {
  const key = toSportKey(activity.sport_type);
  const dist = activity.distance_m ?? null;
  const dur  = activity.duration_seconds ?? null;

  if (key === "natacao") {
    const pace = swimPacePer100m(dist, dur);
    return pace ? { label: "Ritmo", value: `${formatMinSec(pace)}/100m` } : null;
  }

  if (key === "ciclismo") {
    const speed = cyclingSpeedKmh(dist, dur);
    return speed ? { label: "Velocidade média", value: `${speed} km/h` } : null;
  }

  if (key === "corrida") {
    if (!dist || !dur) return null;
    return { label: "Pace", value: `${formatMinSec(Math.round(dur / (dist / 1000)))}/km` };
  }

  // Strength work is measured in time under load.
  if (key === "musculacao" && dur) {
    return { label: "Duração", value: `${Math.round(dur / 60)} min` };
  }

  return null;
}

// ─── Heart-rate zones per sport ──────────────────────────────────────────────

export interface SportZone {
  zone:  number;
  name:  string;
  min:   number;
  max:   number;
  focus: string;
}

/**
 * Cycling LTHR runs roughly 5-10 bpm below running LTHR for the same athlete
 * (less eccentric load, supported body weight, smaller muscle mass recruited).
 * Swimming sits lower still — horizontal position and water pressure raise
 * stroke volume, and the diving reflex suppresses heart rate.
 */
export const LTHR_OFFSET: Record<PrimarySport, number> = {
  corrida:    0,
  ciclismo:  -8,
  natacao:  -13,
  musculacao: 0,
};

const ZONE_BANDS: Array<{ zone: number; name: string; lo: number; hi: number; focus: string }> = [
  { zone: 1, name: "Recuperação",  lo: 0.00, hi: 0.85, focus: "regenerativo, conversa fácil" },
  { zone: 2, name: "Aeróbico",     lo: 0.85, hi: 0.89, focus: "base aeróbica, volume" },
  { zone: 3, name: "Tempo",        lo: 0.89, hi: 0.94, focus: "ritmo forte controlado" },
  { zone: 4, name: "Limiar",       lo: 0.94, hi: 1.00, focus: "limiar de lactato" },
  { zone: 5, name: "VO2max",       lo: 1.00, hi: 1.06, focus: "potência aeróbica máxima" },
];

/**
 * Heart-rate zones for a given sport, derived from the athlete's RUNNING LTHR
 * (which is what the 3 km test measures) adjusted by the sport's offset.
 */
export function zonesForSport(runningLthr: number, sport: SportKey): SportZone[] {
  // Tier 2 sports have no measured offset of their own, so they borrow the
  // running zones unchanged. Zero is the conservative reading: it never tells
  // the athlete a zone is easier than it actually is.
  const lthr = runningLthr + (LTHR_OFFSET[sport as PrimarySport] ?? 0);
  return ZONE_BANDS.map(b => ({
    zone:  b.zone,
    name:  b.name,
    min:   Math.round(lthr * b.lo),
    max:   Math.round(lthr * b.hi),
    focus: b.focus,
  }));
}

/**
 * Swim pace targets per 100 m, derived from a threshold (CSS-like) pace.
 * Critical Swim Speed is the swimming analogue of running threshold pace.
 */
export function swimPaceTargets(cssSecondsPer100m: number): Array<{ name: string; range: string; focus: string }> {
  const at = (mult: number) => formatMinSec(Math.round(cssSecondsPer100m * mult));
  return [
    { name: "Técnica / leve", range: `${at(1.15)}–${at(1.25)}`, focus: "foco na braçada, respiração" },
    { name: "Aeróbico",       range: `${at(1.06)}–${at(1.12)}`, focus: "séries longas, volume" },
    { name: "Limiar (CSS)",   range: `${at(0.98)}–${at(1.03)}`, focus: "séries de 200-400m" },
    { name: "VO2max",         range: `${at(0.90)}–${at(0.96)}`, focus: "tiros de 50-100m" },
  ];
}

/**
 * Cycling effort targets by speed are unreliable (wind, gradient, surface), so
 * we express bike intensity by heart rate and perceived effort instead.
 */
export const BIKE_EFFORT_NOTE =
  "No ciclismo, velocidade varia muito com vento, relevo e piso — use a faixa de FC como referência, não km/h.";
