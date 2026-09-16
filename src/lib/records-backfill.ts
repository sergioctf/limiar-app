/**
 * Walking an athlete's history to find the records already in it.
 *
 * Effort windows are computed when an activity's streams are fetched, and
 * streams are fetched lazily — one Strava call, when the athlete opens a run.
 * So records drawn from that alone cover whatever the athlete happened to click
 * on: 14 of Sérgio's 61 runs, when he asked why his records looked thin.
 *
 * Shared by the button on the records card and the nightly sync, because both
 * want the same bounded, resumable pass. Two constraints shape it:
 *
 *   • **Strava's rate limit** — 100 requests per 15 minutes, 1000 per day, and
 *     it is per *application*, so every athlete shares one budget. Hence a hard
 *     cap per call rather than "drain the history".
 *   • **Storage** — a stream payload is hundreds of kilobytes and we need it
 *     only long enough to reduce it to a dozen numbers. The streams are thrown
 *     away; `run_streams` still caches the ones the athlete opens, where the
 *     splits and the map genuinely need them.
 */
import { getStravaStreams, refreshStravaToken, StravaApiError } from "@/lib/strava";
import { effortsInActivity } from "@/lib/best-efforts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = import("@supabase/supabase-js").SupabaseClient<any, any, any>;

export interface BackfillResult {
  processed:   number;
  remaining:   number;
  rateLimited: boolean;
}

interface PendingRun { id: string; strava_activity_id: number; date: string; distance_km: number }

/** Runs that could yield efforts but have not been read yet. */
export async function pendingRuns(admin: Admin, userId: string): Promise<PendingRun[]> {
  const [{ data: runs }, { data: done }] = await Promise.all([
    admin.from("runs")
      .select("id, strava_activity_id, date, distance_km")
      .eq("user_id", userId)
      .not("strava_activity_id", "is", null)
      .is("deleted_at", null)
      // Newest first: recent form matters most, and if the rate limit cuts the
      // pass short the athlete still gets the half they care about.
      .order("date", { ascending: false }),
    admin.from("run_best_efforts").select("run_id").eq("user_id", userId),
  ]);

  const seen = new Set((done ?? []).map((d: { run_id: string }) => d.run_id));
  return ((runs ?? []) as PendingRun[]).filter(r => !seen.has(r.id));
}

/** A valid access token for this connection, refreshing if needed. */
export async function freshToken(
  admin: Admin,
  conn: { user_id: string; access_token: string; refresh_token: string; expires_at: number },
): Promise<string | null> {
  if (conn.access_token && conn.expires_at > Math.floor(Date.now() / 1000) + 60) {
    return conn.access_token;
  }
  if (!conn.refresh_token) return null;
  try {
    const fresh = await refreshStravaToken(conn.refresh_token);
    await admin.from("strava_connections").update({
      access_token:  fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at:    fresh.expires_at,
      updated_at:    new Date().toISOString(),
    }).eq("user_id", conn.user_id);
    return fresh.access_token;
  } catch {
    return null;
  }
}

/**
 * Read up to `limit` pending activities and store their efforts.
 *
 * A run that yields nothing — anything under 400 m — still gets a zero-distance
 * sentinel row, so the pass does not retry it forever. `buildRecords` filters
 * those out; they are bookkeeping, not marks.
 */
export async function backfillEfforts(
  admin: Admin,
  userId: string,
  token: string,
  pending: PendingRun[],
  limit: number,
): Promise<BackfillResult> {
  const batch = pending.slice(0, limit);
  const rows: Array<Record<string, unknown>> = [];
  let processed = 0;
  let rateLimited = false;

  for (const run of batch) {
    try {
      const streams = await getStravaStreams(token, run.strava_activity_id);
      // The activity's own distance vetoes a stream that disagrees with it.
      const found = effortsInActivity(streams, run.distance_km);
      for (const e of found) {
        rows.push({
          run_id: run.id, user_id: userId, distance_m: e.distanceM,
          seconds: e.seconds, pace_sec_km: e.paceSecPerKm,
          start_m: e.startM, end_m: e.endM, paused_sec: e.pausedSec,
          run_date: run.date,
        });
      }
      if (found.length === 0) {
        rows.push({
          run_id: run.id, user_id: userId, distance_m: 0, seconds: 0,
          pace_sec_km: 0, start_m: 0, end_m: 0, paused_sec: 0, run_date: run.date,
        });
      }
      processed++;
    } catch (err) {
      if (err instanceof StravaApiError && err.status === 429) { rateLimited = true; break; }
      // One unreadable activity must not stall the history. Not counting it as
      // processed means the next pass retries it.
      console.error("[backfill]", run.id, err);
    }
  }

  if (rows.length > 0) {
    const { error } = await admin
      .from("run_best_efforts").upsert(rows, { onConflict: "run_id,distance_m" });
    if (error) {
      console.error("[backfill] upsert:", error.message);
      return { processed: 0, remaining: pending.length, rateLimited };
    }
  }

  return { processed, remaining: pending.length - processed, rateLimited };
}
