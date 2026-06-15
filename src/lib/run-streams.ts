/**
 * Derive per-km splits and aerobic decoupling (HR drift) from Strava streams.
 * Pure functions — no I/O. Operate on the cached StravaStreams arrays.
 */
import type { StravaStreams } from "@/lib/strava";

export interface KmSplit {
  km: number;              // 1, 2, 3… (last may be partial)
  distanceKm: number;      // actual distance of this split (≤1)
  durationSec: number;
  paceSecPerKm: number;
  avgHr: number | null;
  elevGainM: number | null;
  fastest: boolean;        // fastest full km
}

export interface RunStreamAnalysis {
  splits: KmSplit[];
  hrDrift: number | null;        // % decoupling (pace:HR 2nd half vs 1st half)
  hrDriftVerdict: "excelente" | "bom" | "atencao" | null;
  latlng?: Array<[number, number]>;
  hasHr: boolean;
}

/**
 * Compute splits at each full kilometre using the distance+time streams,
 * averaging HR and summing positive elevation within each segment.
 */
export function computeSplits(s: StravaStreams): KmSplit[] {
  const dist = s.distance, time = s.time;
  if (!dist || !time || dist.length < 2 || dist.length !== time.length) return [];

  const splits: KmSplit[] = [];
  let kmIndex = 1;
  let segStartIdx = 0;

  const pushSplit = (endIdx: number, boundaryKm: number) => {
    const startD = dist[segStartIdx], endD = dist[endIdx];
    const startT = time[segStartIdx], endT = time[endIdx];
    const distanceKm = (endD - startD) / 1000;
    const durationSec = endT - startT;
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
    splits,
    hrDrift: drift,
    hrDriftVerdict: verdict,
    latlng: s.latlng,
    hasHr: !!s.heartrate && s.heartrate.length > 0,
  };
}
