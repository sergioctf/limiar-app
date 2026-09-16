/**
 * Best efforts — the fastest stretch of any given distance, found *inside* runs
 * that were never that distance.
 *
 * The idea is Strava's and it is the right one: your best 10 km does not have
 * to come from a race labelled "10 km". If you ran 15 km and, between km 2 and
 * km 12, covered the fastest ten consecutive kilometres of your life, that is
 * your 10 km best — the label on the activity is an accident of where you
 * stopped your watch.
 *
 * Two decisions worth stating:
 *
 *   • **Elapsed time — the race clock, not the moving clock.** This is the one
 *     place in the app that does *not* use moving time, and the reason is that
 *     a record is a *continuous* effort. Discounting a 90-second red light from
 *     the middle of a kilometre is precisely how a fake record is manufactured:
 *     you cannot claim a 3:57 km if you rested for a minute and a half inside
 *     it. Strava resolves it the same way, and that agreement is checked: of 74
 *     efforts cross-checked against Strava's own `best_efforts`, 68 matched to
 *     the second and the 6 that did not were exactly the ones where an earlier
 *     version of this file subtracted the pauses.
 *
 *     Moving time remains right for judging *execution* (see `run-time.ts` and
 *     `computeSplits`) — "did I run the workout I was given" and "is this a
 *     personal record" are different questions and want different clocks.
 *
 *   • **One effort per activity per distance.** Otherwise a single strong run
 *     would fill both the 1st and 2nd place of every distance with two nearly
 *     identical overlapping windows, and the leaderboard would say nothing
 *     about progression. Ranking happens across activities.
 */

/** Distances worth tracking, in metres, shortest first. */
export const EFFORT_DISTANCES: Array<{ m: number; label: string }> = [
  { m: 400,   label: "400 m"    },
  { m: 1000,  label: "1 km"     },
  { m: 1609,  label: "1 milha"  },
  { m: 3000,  label: "3 km"     },
  { m: 5000,  label: "5 km"     },
  { m: 10000, label: "10 km"    },
  { m: 15000, label: "15 km"    },
  { m: 21097, label: "Meia"     },
  { m: 30000, label: "30 km"    },
  { m: 42195, label: "Maratona" },
];

export interface EffortWindow {
  distanceM:    number;
  label:        string;
  /** Moving seconds across the window. */
  seconds:      number;
  paceSecPerKm: number;
  /** Where in the activity it happened, in metres from the start. */
  startM:       number;
  endM:         number;
  /** Seconds stopped inside the window. Reported, never subtracted. */
  pausedSec:    number;
}

export interface RankedEffort extends EffortWindow {
  runId:   string;
  runName: string;
  date:    string;   // YYYY-MM-DD
  /** 1 = best ever, 2 = second best. */
  rank:    number;
  /**
   * True when the mark was carved out of an activity of a different length —
   * the point of the whole feature, and the thing that makes a record look
   * believable instead of like a bug when it beats every activity of that
   * distance the athlete has ever run.
   */
  fromInsideRun?: boolean;
  /** Length of the activity it came from, km. */
  activityKm?:    number | null;
}

export interface DistanceRecord {
  distanceM: number;
  label:     string;
  best:      RankedEffort | null;
  second:    RankedEffort | null;
  /** How many activities contained a stretch this long. */
  attempts:  number;
}

/** Streams as we need them here — cumulative metres and per-sample time. */
/**
 * Slack, in metres, when deciding whether a window is long enough.
 *
 * The distance stream is cumulative floats, so an activity that covered exactly
 * 5 km can land at 4999.9999999 and be rejected for being 0.0000001 m short —
 * and whether it does depends on the direction the rounding error happened to
 * accumulate, which is not something a personal record should hinge on.
 *
 * Half a metre is orders of magnitude below GPS precision (typically 1–2% of
 * distance), so it absorbs the noise without ever promoting a genuinely short
 * effort: 4999 m still fails to be a 5 km.
 */
const EPSILON_M = 0.5;

/**
 * When a whole activity may stand in for a distance it was not labelled as.
 *
 * Streams are cached lazily — one Strava call per run, on first open — so most
 * of an athlete's history has no effort windows. Without a fallback the records
 * card would show only the handful of runs they happened to open, while the
 * dashboard (which reads whole activities) showed more; that is exactly how the
 * two screens came to disagree.
 *
 * The rule can only err conservatively:
 *   • the activity must be at least as long as the target, so its time is an
 *     upper bound on what was run for the target distance — never flattering;
 *   • 0.5% of undershoot is allowed, which is GPS noise on a course that really
 *     was the right length, not a shorter run being promoted;
 *   • 5% of overshoot at most, beyond which the pace held over the extra
 *     distance says too little about the target.
 */
export const STANDIN_OVER_MAX  = 1.05;
export const STANDIN_UNDER_MIN = 0.995;

export function activityStandsInFor(activityKm: number, targetM: number): boolean {
  const ratio = (activityKm * 1000) / targetM;
  return ratio >= STANDIN_UNDER_MIN && ratio <= STANDIN_OVER_MAX;
}

/**
 * The fastest a human runs, in metres per second.
 *
 * 12.5 m/s is 45 km/h — comfortably above the ~12.4 m/s peak of a world-record
 * 100 m, so it can never clip real running, and far below what this guards
 * against: on one of Sérgio's runs, four consecutive samples advanced 106 m
 * each in one second — 383 km/h — because the GPS lost signal and then caught
 * up in a single jump. Strava flagged every one of them `moving: true`, so the
 * moving stream is no defence.
 *
 * Left alone it produced a "400 m in 2 seconds" and a "1 km in 32 seconds" in
 * the records table. Seven of 295 efforts were affected.
 */
const MAX_HUMAN_MPS = 12.5;

/**
 * Cumulative distance with GPS teleports removed.
 *
 * A sample is credited with at most the distance a human could cover in the
 * time it spans. The phantom metres are dropped rather than redistributed: we
 * cannot know how long the athlete actually took to cover ground the watch
 * never recorded, and for a *record* the conservative answer is the honest one.
 */
export function sanitisedDistance(distance: number[], time: number[]): number[] {
  const out = new Array<number>(distance.length);
  out[0] = 0;
  for (let i = 1; i < distance.length; i++) {
    const dd = distance[i] - distance[i - 1];
    const dt = time[i] - time[i - 1];
    const ceiling = Math.max(0, dt) * MAX_HUMAN_MPS;
    out[i] = out[i - 1] + (dd > 0 ? Math.min(dd, ceiling) : 0);
  }
  return out;
}

export interface EffortStreams {
  distance?: number[];
  time?:     number[];
  moving?:   boolean[];
}

/**
 * Cumulative *stopped* seconds at each sample.
 *
 * Not used to discount anything — the window is timed on the wall clock. It is
 * reported alongside the effort so a record set across a long red light can be
 * shown as what it is, rather than silently presented as a clean run.
 */
function pausedClock(time: number[], moving?: boolean[]): number[] {
  const out = new Array<number>(time.length);
  out[0] = 0;
  const usable = moving && moving.length === time.length;
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    out[i] = out[i - 1] + (usable && !moving![i] && dt > 0 ? dt : 0);
  }
  return out;
}

/**
 * The fastest window of exactly `targetM` metres.
 *
 * Two pointers, so it is linear per distance rather than quadratic. The window
 * edge is interpolated between samples: GPS logs roughly every second, which at
 * 5:00/km is a ~3 m quantum — enough to shuffle the order of two efforts a
 * second apart if we snapped to sample boundaries instead.
 */
export function fastestWindow(
  s: EffortStreams,
  targetM: number,
  label = `${targetM} m`,
): EffortWindow | null {
  const rawDist = s.distance, time = s.time;
  if (!rawDist || !time || rawDist.length < 2 || rawDist.length !== time.length) return null;

  const dist = sanitisedDistance(rawDist, time);
  if (dist[dist.length - 1] - dist[0] < targetM - EPSILON_M) return null;

  // The race clock. `paused` only annotates the result; it never shortens it.
  const clock = time;
  const paused = pausedClock(time, s.moving);

  let best: EffortWindow | null = null;
  let i = 0;

  for (let j = 1; j < dist.length; j++) {
    // Advance the trailing edge while the window is still longer than needed.
    while (i + 1 < j && dist[j] - dist[i + 1] >= targetM - EPSILON_M) i++;
    if (dist[j] - dist[i] < targetM - EPSILON_M) continue;

    // Interpolate the exact point where the window is `targetM` long.
    // Clamp so a window accepted via the epsilon does not interpolate to a
    // start before the activity began.
    const wantStartM = Math.max(dist[0], dist[j] - targetM);
    const segM = dist[i + 1] - dist[i];
    const frac = segM > 0 ? (wantStartM - dist[i]) / segM : 0;
    const startClock = clock[i] + (clock[i + 1] - clock[i]) * Math.min(Math.max(frac, 0), 1);

    const seconds = clock[j] - startClock;
    if (seconds <= 0) continue;

    if (!best || seconds < best.seconds) {
      best = {
        distanceM: targetM,
        label,
        seconds: Math.round(seconds),
        paceSecPerKm: Math.round(seconds / (targetM / 1000)),
        startM: Math.round(wantStartM),
        endM: Math.round(dist[j]),
        pausedSec: Math.max(0, Math.round(paused[j] - paused[i])),
      };
    }
  }

  return best;
}

/**
 * How far a stream's distance may sit from the activity's own recorded distance
 * before the stream is not describing the run we think it is.
 *
 * Derived from 27 real activities rather than picked:
 *
 *   • Where the `moving` flag exists, the stream's *moving* distance lands
 *     within 1.8% of the recorded distance — Strava's activity distance is the
 *     moving distance, so the two reconcile almost exactly.
 *   • Where it does not (older cached streams), the raw total runs up to 13.3%
 *     high on runs with long stops, and there is no way to correct it.
 *
 * So the tolerance is tight when we can reconcile and loose when we cannot.
 * Both are far below the case this exists for: one activity recorded as 5.0 km
 * whose stream ran to 8756 m with only 11 seconds of pause — a 75% disagreement
 * that yielded a 16:42 "5 km record" for an athlete who runs 10 km in 55:08.
 */
const STREAM_TRUST_WITH_MOVING = 0.10;
const STREAM_TRUST_RAW         = 0.25;

/**
 * Whether the stream can be trusted to describe this activity.
 *
 * Returns true when we have nothing to check against — an unverifiable stream is
 * the status quo, and refusing every one of them would empty the records table.
 */
export function streamMatchesActivity(
  s: EffortStreams,
  recordedKm: number | null | undefined,
): boolean {
  const d = s.distance, t = s.time;
  if (!d?.length || !t?.length) return false;
  if (!recordedKm || recordedKm <= 0) return true;

  const usable = s.moving && s.moving.length === t.length;
  let metres = 0;
  if (usable) {
    for (let i = 1; i < d.length; i++) {
      const dd = d[i] - d[i - 1];
      if (s.moving![i] && dd > 0) metres += dd;
    }
  } else {
    metres = d[d.length - 1] - d[0];
  }

  const tol = usable ? STREAM_TRUST_WITH_MOVING : STREAM_TRUST_RAW;
  return Math.abs(metres / 1000 - recordedKm) / recordedKm <= tol;
}

/**
 * Every tracked distance the activity was long enough to contain.
 *
 * Pass `recordedKm` wherever it is known. Without it the stream is taken on
 * faith, which is how a corrupt one reached the records table.
 */
export function effortsInActivity(
  s: EffortStreams,
  recordedKm?: number | null,
): EffortWindow[] {
  if (recordedKm != null && !streamMatchesActivity(s, recordedKm)) return [];
  const out: EffortWindow[] = [];
  for (const d of EFFORT_DISTANCES) {
    const w = fastestWindow(s, d.m, d.label);
    if (w) out.push(w);
  }
  return out;
}

/**
 * Rank efforts across activities, keeping the best and the runner-up.
 *
 * Ties go to the older activity: if you match a time you set in March, March
 * keeps the crown. Beating it requires actually beating it.
 */
export function rankEfforts(all: RankedEffort[]): DistanceRecord[] {
  const byDistance = new Map<number, RankedEffort[]>();
  for (const e of all) {
    const list = byDistance.get(e.distanceM) ?? [];
    list.push(e);
    byDistance.set(e.distanceM, list);
  }

  return EFFORT_DISTANCES.map(({ m, label }) => {
    const list = (byDistance.get(m) ?? []).slice().sort(
      (a, b) => a.seconds - b.seconds || a.date.localeCompare(b.date),
    );
    return {
      distanceM: m,
      label,
      best:   list[0] ? { ...list[0], rank: 1 } : null,
      second: list[1] ? { ...list[1], rank: 2 } : null,
      attempts: list.length,
    };
  }).filter(r => r.attempts > 0);
}
