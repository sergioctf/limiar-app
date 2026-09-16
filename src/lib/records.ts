/**
 * The single place that decides what an athlete's record at a distance is.
 *
 * There were three answers to that question living in the codebase at once —
 * the dashboard bucketed whole activities by average pace, the coach card read
 * only stream-derived windows, and the friend profile had a third rule of its
 * own — so the same athlete had three different 5 km records depending on which
 * screen you opened. Everything now funnels through `buildCandidates` below.
 *
 * A candidate comes from one of two sources, in order of precision:
 *
 *   1. **A measured window** (`run_best_efforts`), found by searching inside the
 *      activity's streams. This is the real answer: the fastest 10 km you ran
 *      may sit between km 2 and km 12 of a 15 km run.
 *   2. **A whole activity**, when we have no streams for it. Streams are fetched
 *      lazily, so most of a long history has none. The stand-in rule can only
 *      err conservatively — see `activityStandsInFor`.
 *
 * A measured window always beats a stand-in *for the same run*, because it is
 * the same effort timed precisely.
 */
import {
  rankEfforts, activityStandsInFor, EFFORT_DISTANCES,
  type RankedEffort, type DistanceRecord,
} from "@/lib/best-efforts";
import { elapsedSeconds } from "@/lib/run-time";

/** The run fields records need. Deliberately narrow so callers can `select` little. */
export interface RunForRecords {
  id:                    string;
  name?:                 string | null;
  date:                  string;
  distance_km:           number;
  duration_seconds:      number;
  moving_time_seconds?:  number | null;
  elapsed_time_seconds?: number | null;
}

/** One measured window, as stored. */
export interface StoredEffort {
  run_id:      string;
  distance_m:  number;
  seconds:     number;
  run_date:    string;
  pace_sec_km?: number | null;
  start_m?:     number | null;
  end_m?:       number | null;
  paused_sec?:  number | null;
}

/**
 * Every candidate mark, measured and stood-in, across all tracked distances.
 *
 * Exposed rather than kept private because the dashboard needs the raw list to
 * build its month-over-month comparison from the same basis as the record it
 * sits under — otherwise the trend can contradict the number above it.
 */
export function buildCandidates(
  runs: RunForRecords[],
  efforts: StoredEffort[],
): RankedEffort[] {
  const runById = new Map(runs.map(r => [r.id, r]));
  const out: RankedEffort[] = [];

  const labelFor = (m: number) => EFFORT_DISTANCES.find(d => d.m === m)?.label ?? `${m} m`;

  // ── Measured windows ──────────────────────────────────────────────────────
  const measured = new Set<string>();
  for (const e of efforts) {
    measured.add(`${e.run_id}|${e.distance_m}`);
    const run = runById.get(e.run_id);
    const activityM = run ? run.distance_km * 1000 : null;
    out.push({
      distanceM:    e.distance_m,
      label:        labelFor(e.distance_m),
      seconds:      e.seconds,
      paceSecPerKm: e.pace_sec_km ?? Math.round(e.seconds / (e.distance_m / 1000)),
      startM:       e.start_m ?? 0,
      endM:         e.end_m ?? e.distance_m,
      pausedSec:    e.paused_sec ?? 0,
      runId:        e.run_id,
      runName:      run?.name ?? "Corrida",
      date:         e.run_date,
      rank:         0,
      // The mark was carved out of an activity of a materially different length.
      fromInsideRun: activityM != null && Math.abs(activityM - e.distance_m) > 500,
      activityKm:    run?.distance_km ?? null,
    });
  }

  // ── Whole-activity stand-ins ──────────────────────────────────────────────
  for (const { m, label } of EFFORT_DISTANCES) {
    for (const r of runs) {
      if (measured.has(`${r.id}|${m}`)) continue;
      if (!activityStandsInFor(r.distance_km, m)) continue;
      const seconds = elapsedSeconds(r);
      if (!seconds || seconds <= 0) continue;
      out.push({
        distanceM: m, label, seconds,
        paceSecPerKm: Math.round(seconds / (m / 1000)),
        startM: 0, endM: Math.round(r.distance_km * 1000), pausedSec: 0,
        runId: r.id, runName: r.name ?? "Corrida", date: r.date, rank: 0,
        fromInsideRun: false,
        activityKm: r.distance_km,
      });
    }
  }

  return out;
}

/** Best and runner-up per distance, from the whole history. */
export function buildRecords(
  runs: RunForRecords[],
  efforts: StoredEffort[],
): DistanceRecord[] {
  return rankEfforts(buildCandidates(runs, efforts));
}

/** Seconds of the athlete's best mark at a distance, or null. */
export function bestAt(records: DistanceRecord[], metres: number): number | null {
  return records.find(r => r.distanceM === metres)?.best?.seconds ?? null;
}
