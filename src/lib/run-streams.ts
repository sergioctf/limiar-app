/**
 * Derive per-km splits and aerobic decoupling (HR drift) from Strava streams.
 * Pure functions — no I/O. Operate on the cached StravaStreams arrays.
 */
import type { StravaStreams } from "@/lib/strava";
import { sanitisedDistance } from "@/lib/best-efforts";

export interface KmSplit {
  km: number;              // 1, 2, 3… (last may be partial)
  distanceKm: number;      // actual distance of this split (≤1)
  /** Moving seconds — the clock the athlete actually ran against. */
  durationSec: number;
  /** Wall-clock seconds, pauses included. Equal to durationSec when nothing was paused. */
  elapsedSec: number;
  /** Seconds stopped inside this kilometre. */
  pausedSec: number;
  /** Derived from moving time, so a red light never reads as a slow split. */
  paceSecPerKm: number;
  avgHr: number | null;
  elevGainM: number | null;
  fastest: boolean;        // fastest full km
}

export interface BestEffort {
  name: string;            // "400m", "1k", "1 mile", "5k", "10k"…
  distanceM: number;
  elapsedSec: number;
  paceSecPerKm: number;
  prRank: number | null;   // 1=PR, 2=2nd best… (Strava-computed, all-time)
}

/**
 * Bump when the shape or the maths of a cached analysis changes.
 *
 * `run_streams` caches the *computed* analysis, not just the raw streams, so a
 * fix to `computeSplits` reaches nobody until the cache is invalidated — the
 * 19 runs already cached would have kept serving wall-clock splits forever.
 *
 * v2: splits are timed on the `moving` stream, and carry elapsedSec/pausedSec.
 *     Older cache entries also predate our even *requesting* the moving stream,
 *     so they must be refetched, not just recomputed.
 * v3: distance is filtered by `moving` as well as time. v2 filtered only the
 *     clock, so metres covered during a paused relocation were free and the
 *     split containing them came back impossibly fast.
 * v4: GPS teleports are capped at human speed. A watch that loses signal and
 *     catches up jumps 100+ m in a single sample, flagged `moving: true`, which
 *     handed the split containing it free distance.
 */
export const ANALYSIS_VERSION = 4;

export interface RunStreamAnalysis {
  /** Absent on entries cached before versioning existed. */
  version?: number;
  splits: KmSplit[];
  hrDrift: number | null;        // % decoupling (pace:HR 2nd half vs 1st half)
  hrDriftVerdict: "excelente" | "bom" | "atencao" | null;
  latlng?: Array<[number, number]>;
  hasHr: boolean;
  bestEfforts?: BestEffort[];
}

/** Parse Strava's detailed-activity best_efforts array into our shape. */
export function parseBestEfforts(raw: unknown): BestEffort[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e): BestEffort | null => {
      const distanceM = Number(e?.distance);
      const elapsedSec = Number(e?.elapsed_time ?? e?.moving_time);
      if (!distanceM || !elapsedSec || distanceM <= 0 || elapsedSec <= 0) return null;
      return {
        name: String(e?.name ?? `${Math.round(distanceM)}m`),
        distanceM,
        elapsedSec,
        paceSecPerKm: Math.round(elapsedSec / (distanceM / 1000)),
        prRank: e?.pr_rank != null ? Number(e.pr_rank) : null,
      };
    })
    .filter((e): e is BestEffort => e !== null);
}

/**
 * Compute splits at each full kilometre using the distance+time streams,
 * averaging HR and summing positive elevation within each segment.
 */
export function computeSplits(s: StravaStreams): KmSplit[] {
  const rawDist = s.distance, time = s.time;
  if (!rawDist || !time || rawDist.length < 2 || rawDist.length !== time.length) return [];

  /*
   * The `time` stream counts from the activity's start, so a pause shows up as
   * a jump between consecutive samples — 300, 301, 480 — and `endT - startT`
   * silently swallows it. Timing the split on Strava's `moving` flag instead
   * charges only the seconds the athlete was running.
   *
   * This is what made a paused interval session read as a blown one: stand
   * still for 90 s between reps and the kilometre containing the recovery came
   * back a minute and a half slow, so previsto × executado accused a workout
   * that had been executed exactly as prescribed.
   *
   * Older cached streams have no `moving` array; those fall back to wall clock,
   * which is the previous behaviour, so nothing regresses.
   */
  /*
   * Both axes are rebuilt on the `moving` flag, and they have to move together.
   *
   * Filtering only the clock produced impossibly fast splits: when a watch is
   * paused in one place and resumed in another, the distance stream still
   * carries the jump while those samples are flagged `moving: false`. On one of
   * Sérgio's runs that was 526 metres awarded at zero time cost. A kilometre
   * whose boundary fell inside that window came back a minute fast.
   *
   * So `dist` below is distance covered *while running*. The consequence worth
   * knowing: on a run with a paused relocation, the splits sum to slightly less
   * than the activity's total distance — which is the honest answer, because
   * the missing metres were not run.
   */
  const mvFlag = s.moving;
  const usable = mvFlag && mvFlag.length === time.length;

  // Teleports first: a 106 m/s sample is the GPS catching up, not a stride.
  const clean = sanitisedDistance(rawDist, time);

  const dist = new Array<number>(rawDist.length);
  const clock = new Array<number>(time.length);
  dist[0] = 0; clock[0] = 0;
  for (let i = 1; i < time.length; i++) {
    const counts = !usable || mvFlag![i];
    const dt = time[i] - time[i - 1];
    const dd = clean[i] - clean[i - 1];
    clock[i] = clock[i - 1] + (counts && dt > 0 ? dt : 0);
    dist[i]  = dist[i - 1]  + (counts && dd > 0 ? dd : 0);
  }

  const splits: KmSplit[] = [];
  let kmIndex = 1;
  let segStartIdx = 0;

  const pushSplit = (endIdx: number, boundaryKm: number) => {
    const distanceKm = (dist[endIdx] - dist[segStartIdx]) / 1000;
    const elapsed = time[endIdx] - time[segStartIdx];
    const durationSec = clock[endIdx] - clock[segStartIdx];
    if (distanceKm <= 0 || durationSec <= 0) return;

    // Average HR over the segment
    let avgHr: number | null = null;
    if (s.heartrate) {
      let sum = 0, n = 0;
      for (let i = segStartIdx; i <= endIdx; i++) {
        if (typeof s.heartrate[i] === "number") { sum += s.heartrate[i]; n++; }
      }
      avgHr = n > 0 ? Math.round(sum / n) : null;
    }

    // Positive elevation gain
    let elevGainM: number | null = null;
    if (s.altitude) {
      let gain = 0;
      for (let i = segStartIdx + 1; i <= endIdx; i++) {
        const d = s.altitude[i] - s.altitude[i - 1];
        if (d > 0) gain += d;
      }
      elevGainM = Math.round(gain);
    }

    splits.push({
      km: boundaryKm,
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationSec: Math.round(durationSec),
      elapsedSec: Math.round(elapsed),
      pausedSec: Math.max(0, Math.round(elapsed - durationSec)),
      paceSecPerKm: Math.round(durationSec / distanceKm),
      avgHr,
      elevGainM,
      fastest: false,
    });
    segStartIdx = endIdx;
  };

  for (let i = 1; i < dist.length; i++) {
    if (dist[i] >= kmIndex * 1000) {
      pushSplit(i, kmIndex);
      kmIndex++;
    }
  }
  // Trailing partial km
  if (segStartIdx < dist.length - 1 && dist[dist.length - 1] > (kmIndex - 1) * 1000) {
    pushSplit(dist.length - 1, kmIndex);
  }

  // Mark fastest FULL km (distanceKm ≈ 1)
  const fullKms = splits.filter(sp => sp.distanceKm >= 0.95);
  if (fullKms.length > 0) {
    const best = fullKms.reduce((a, b) => (b.paceSecPerKm < a.paceSecPerKm ? b : a));
    best.fastest = true;
  }

  return splits;
}

/**
 * Aerobic decoupling: how much the HR:pace relationship drifts from the first
 * half to the second half of a run. <5% excellent, 5-8% good, >8% attention.
 * Standard endurance-durability metric (Friel / TrainingPeaks "Pw:Hr").
 */
export function computeHrDrift(s: StravaStreams): { drift: number | null; verdict: RunStreamAnalysis["hrDriftVerdict"] } {
  const dist = s.distance, time = s.time, hr = s.heartrate;
  if (!dist || !time || !hr || dist.length < 20) return { drift: null, verdict: null };

  const mid = Math.floor(dist.length / 2);

  const ratioFor = (a: number, b: number): number | null => {
    const dKm = (dist[b] - dist[a]) / 1000;
    const dSec = time[b] - time[a];
    if (dKm <= 0 || dSec <= 0) return null;
    const speed = dKm / (dSec / 3600); // km/h
    let sum = 0, n = 0;
    for (let i = a; i <= b; i++) if (typeof hr[i] === "number") { sum += hr[i]; n++; }
    if (n === 0) return null;
    const avgHr = sum / n;
    if (avgHr <= 0) return null;
    return speed / avgHr; // efficiency: km/h per bpm
  };

  const first = ratioFor(0, mid);
  const second = ratioFor(mid, dist.length - 1);
  if (first === null || second === null || first === 0) return { drift: null, verdict: null };

  // Decoupling = drop in efficiency in the 2nd half (positive = slowed at same HR)
  const drift = Math.round(((first - second) / first) * 1000) / 10;
  const verdict = drift < 5 ? "excelente" : drift <= 8 ? "bom" : "atencao";
  return { drift, verdict };
}

export function analyzeStreams(s: StravaStreams): RunStreamAnalysis {
  const splits = computeSplits(s);
  const { drift, verdict } = computeHrDrift(s);
  return {
    version: ANALYSIS_VERSION,
    splits,
    hrDrift: drift,
    hrDriftVerdict: verdict,
    latlng: s.latlng,
    hasHr: !!s.heartrate && s.heartrate.length > 0,
  };
}
