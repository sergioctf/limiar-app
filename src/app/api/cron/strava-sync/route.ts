/**
 * GET /api/cron/strava-sync — daily, 06:30 BRT.
 *
 * Two jobs, both about the same promise: the athlete never presses sync.
 *
 *  1. Make sure the push subscription exists and points here. Without it the
 *     webhook is a receiver with no sender, and nothing arrives on its own.
 *  2. Catch up on anything the webhook missed. Strava retries a delivery a few
 *     times and then gives up — a deploy, a cold start or a timeout during
 *     those seconds loses the activity permanently, and the athlete only finds
 *     out when a run is absent from their week.
 *
 * The catch-up is cheap by design: one page of recent activities per connected
 * athlete, and anything already stored is skipped.
 *
 * Daily rather than hourly because the hosting plan allows one run a day. That
 * is the right cadence for a safety net anyway — the webhook is what delivers
 * in real time, and this only exists for what it drops.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authorizeCron } from "@/lib/cron-auth";
import { refreshStravaToken, getStravaActivities, stravaActivityToRun, enrichActivitiesWithCalories } from "@/lib/strava";
import { ensureSubscription, stravaCredentials, callbackUrl } from "@/lib/strava-subscription";
import { pendingRuns, backfillEfforts } from "@/lib/records-backfill";
import { notifyFriendsOfWorkout, workoutOf } from "@/lib/friend-notify";
import { sendPushToUser } from "@/lib/push";

export const maxDuration = 60;

/** How far back the safety net looks. Longer than any plausible outage. */
const LOOKBACK_DAYS = 3;

/**
 * Activities per athlete whose records get read each night.
 *
 * Records are supposed to span a whole history, but the athlete only sees the
 * button for it on their own records card — and a friend's profile shows *their*
 * records, which they may never have pressed anything to build. So the history
 * fills itself in, slowly, for everyone.
 *
 * Eight is deliberately small. Strava's limit is 100 requests per 15 minutes
 * across the entire application, and this cron already spends one call per
 * athlete on the catch-up above; with six connected athletes a nightly pass
 * costs well under half the window, and a 60-run history completes inside a
 * fortnight without anyone waiting on a spinner.
 */
const BACKFILL_PER_NIGHT = 8;

interface Connection {
  user_id:       string;
  athlete_id:    number | null;
  access_token:  string | null;
  refresh_token: string | null;
  expires_at:    number | null;
}

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const results: Record<string, unknown> = {};

  // ── 1. The subscription ───────────────────────────────────────────────────
  const creds = stravaCredentials();
  const callback = callbackUrl();
  if (!creds) {
    results.subscription = "sem credenciais";
  } else if (!callback) {
    // Better to say this than to hand Strava a localhost URL and read a 400.
    results.subscription = "sem URL pública — configure NEXT_PUBLIC_APP_URL";
  } else {
    try {
      const r = await ensureSubscription(creds, callback);
      results.subscription = r.status;
      results.callback = callback;
    } catch (err) {
      results.subscription = `erro: ${err instanceof Error ? err.message : "desconhecido"}`;
      results.callback = callback;
    }
  }

  // ── 2. The catch-up ───────────────────────────────────────────────────────
  const { data: connections } = await admin
    .from("strava_connections")
    .select("user_id, athlete_id, access_token, refresh_token, expires_at")
    .limit(500);

  const since = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86400;
  const imported: Record<string, number> = {};
  const importedActivities: Record<string, number> = {};

  const backfilled: Record<string, string> = {};

  for (const conn of (connections ?? []) as Connection[]) {
    try {
      let token = conn.access_token;

      // Expiry is checked with a minute of slack: a token that dies mid-request
      // fails the whole athlete's catch-up for an hour.
      if (!token || (conn.expires_at ?? 0) <= Math.floor(Date.now() / 1000) + 60) {
        if (!conn.refresh_token) continue;
        const fresh = await refreshStravaToken(conn.refresh_token);
        token = fresh.access_token;
        await admin.from("strava_connections").update({
          access_token:  fresh.access_token,
          refresh_token: fresh.refresh_token,
          expires_at:    fresh.expires_at,
          updated_at:    new Date().toISOString(),
        }).eq("user_id", conn.user_id);
      }

      /*
       * Records history, before anything else in the loop.
       *
       * This used to sit after the import, past two `continue`s that fire when
       * the athlete has no new activities — and since the webhook delivers runs
       * live, the catch-up almost never finds any. So the backfill was
       * unreachable on nearly every night: five days after shipping it, three
       * athletes were still at 0 of 61, 0 of 62 and 3 of 91 runs read.
       *
       * It belongs here because it has nothing to do with whether there was
       * anything to import. Best-effort: a failure must not cost the athlete
       * the activity sync, which is this cron's actual job.
       */
      try {
        const pending = await pendingRuns(admin, conn.user_id);
        if (pending.length > 0) {
          const r = await backfillEfforts(admin, conn.user_id, token, pending, BACKFILL_PER_NIGHT);
          backfilled[conn.user_id] = `${r.processed}/${pending.length}${r.rateLimited ? " (limite)" : ""}`;
        }
      } catch (err) {
        console.error("[strava-sync] backfill", conn.user_id, err);
      }

      const all = (await getStravaActivities(token, 1, 30, since)) as Array<{
        id: number; type?: string; sport_type?: string; calories?: number | null;
      }>;

      // Runs and everything else go to different tables. Filing a gym session
      // as a zero-kilometre "easy run" — which this path once did — pollutes
      // the volume history that every prescribed distance is computed from.
      const activities = all.filter(a => a.type === "Run" || a.sport_type === "Run");
      const others     = all.filter(a => a.type !== "Run" && a.sport_type !== "Run");

      // ── Non-run activities ────────────────────────────────────────────────
      // The webhook now delivers these live; this is the same safety net the
      // runs get, for the same reason: a dropped delivery is silent.
      if (others.length > 0) {
        const { data: knownActs } = await admin
          .from("activities").select("strava_activity_id")
          .eq("user_id", conn.user_id)
          .in("strava_activity_id", others.map(a => String(a.id)));

        const seenActs = new Set((knownActs ?? []).map((r: { strava_activity_id: unknown }) => String(r.strava_activity_id)));
        const missingActs = others.filter(a => !seenActs.has(String(a.id)));

        if (missingActs.length > 0) {
          const enriched = await enrichActivitiesWithCalories(token, missingActs);
          const rows = enriched.map(a => {
            const x = a as typeof a & Record<string, unknown>;
            const sport = (x.sport_type ?? x.type ?? "Workout") as string;
            return {
              user_id:            conn.user_id,
              strava_activity_id: x.id,
              name:               (x.name as string) ?? sport,
              sport_type:         sport,
              date:               x.start_date_local
                                    ? String(x.start_date_local).split("T")[0]
                                    : new Date().toISOString().slice(0, 10),
              duration_seconds:   (x.moving_time ?? x.elapsed_time ?? null) as number | null,
              distance_m:         (x.distance ?? null) as number | null,
              calories:           x.calories ? Math.round(Number(x.calories)) : null,
              avg_hr:             x.average_heartrate ? Math.round(Number(x.average_heartrate)) : null,
              elevation_gain_m:   (x.total_elevation_gain ?? null) as number | null,
              source:             "strava",
              strava_raw_json:    x,
            };
          });
          const { error } = await admin.from("activities").insert(rows);
          if (!error) {
            importedActivities[conn.user_id] = rows.length;
            // The safety net catches up on three days at once; only what
            // happened today is worth a friend's attention, and that filter
            // lives inside the call.
            for (const r of rows) {
              await notifyFriendsOfWorkout(admin, conn.user_id, workoutOf(r.sport_type, {
                name:        r.name,
                distanceKm:  r.distance_m != null ? Number(r.distance_m) / 1000 : null,
                durationMin: r.duration_seconds != null ? Number(r.duration_seconds) / 60 : null,
                date:        r.date,
              }), (id, payload) => sendPushToUser(admin, id, payload));
            }
          }
        }
      }

      if (activities.length === 0) continue;

      const ids = activities.map(a => String(a.id));
      const { data: known } = await admin
        .from("runs").select("strava_activity_id")
        .eq("user_id", conn.user_id)
        .in("strava_activity_id", ids);

      const seen = new Set((known ?? []).map((r: { strava_activity_id: unknown }) => String(r.strava_activity_id)));
      const missing = activities.filter(a => !seen.has(String(a.id)));
      if (missing.length === 0) continue;

      // No AI analysis here. The webhook writes coach feedback on arrival; this
      // path exists to stop an activity from being lost, and a missing comment
      // is a far smaller problem than a missing run.
      const withCalories = await enrichActivitiesWithCalories(token, missing);
      const rows = withCalories.map(a => stravaActivityToRun(a, conn.user_id));
      const { error } = await admin.from("runs").insert(rows);
      if (!error) {
        imported[conn.user_id] = rows.length;
        for (const r of rows) {
          await notifyFriendsOfWorkout(admin, conn.user_id, workoutOf("Run", {
            name:        r.name,
            distanceKm:  r.distance_km ?? null,
            durationMin: r.duration_seconds != null ? r.duration_seconds / 60 : null,
            date:        r.date ?? "",
          }), (id, payload) => sendPushToUser(admin, id, payload));
        }
      }

    } catch (err) {
      imported[conn.user_id] = -1;
      results[`erro_${conn.user_id.slice(0, 8)}`] = err instanceof Error ? err.message : "desconhecido";
    }
  }

  return NextResponse.json({
    ok: true,
    ...results,
    athletes: (connections ?? []).length,
    imported,
    importedActivities,
    backfilled,
  });
}
