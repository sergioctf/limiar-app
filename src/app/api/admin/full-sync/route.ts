/**
 * GET /api/admin/full-sync?secret=limiar_admin_2026
 * Full historical sync: fetches ALL Strava activities and inserts any that are
 * not already in the DB. Safe to run multiple times — skips already-synced IDs.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { refreshStravaToken, stravaActivityToRun } from "@/lib/strava";

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill"]);

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Get Strava connection (most recent)
  const { data: conn } = await admin
    .from("strava_connections")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (!conn) return NextResponse.json({ error: "No Strava connection found" }, { status: 400 });

  // Refresh token if needed
  let accessToken = conn.access_token;
  if (Date.now() / 1000 > conn.expires_at - 60) {
    const refreshed = await refreshStravaToken(conn.refresh_token);
    accessToken = refreshed.access_token;
    await admin.from("strava_connections").update({
      access_token:  refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at:    refreshed.expires_at,
      updated_at:    new Date().toISOString(),
    }).eq("id", conn.id);
  }

  const userId: string = conn.user_id;

  // Build sets of already-synced IDs
  const { data: syncedRuns } = await admin
    .from("runs")
    .select("strava_activity_id")
    .eq("user_id", userId)
    .not("strava_activity_id", "is", null);

  const { data: syncedActivities } = await admin
    .from("activities")
    .select("strava_activity_id")
    .eq("user_id", userId)
    .not("strava_activity_id", "is", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncedRunIds = new Set((syncedRuns ?? []).map((r: any) => Number(r.strava_activity_id)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncedActivityIds = new Set((syncedActivities ?? []).map((a: any) => Number(a.strava_activity_id)));

  let runsInserted = 0, activitiesInserted = 0, skipped = 0, errors = 0;
  let page = 1;
  const errorDetails: string[] = [];

  while (true) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      errorDetails.push(`Page ${page} fetch failed: ${res.status}`);
      break;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acts: any[] = await res.json();
    if (!Array.isArray(acts) || acts.length === 0) break;

    for (const act of acts) {
      const sportType: string = act.sport_type ?? act.type ?? "Other";
      const isRun = RUN_TYPES.has(sportType);
      const actId = Number(act.id);

      // Skip already-synced
      if (isRun && syncedRunIds.has(actId)) { skipped++; continue; }
      if (!isRun && syncedActivityIds.has(actId)) { skipped++; continue; }

      try {
        if (isRun) {
          const run = stravaActivityToRun(act, userId);
          const { error } = await admin.from("runs").insert({
            ...run,
            synced_at: new Date().toISOString(),
          });
          if (error) {
            // If it's a duplicate key, just skip silently
            if (error.message.includes("duplicate") || error.message.includes("unique")) {
              skipped++;
            } else {
              errorDetails.push(`Run ${actId}: ${error.message}`);
              errors++;
            }
          } else {
            runsInserted++;
            syncedRunIds.add(actId);
          }
        } else {
          const date: string = act.start_date_local
            ? act.start_date_local.split("T")[0]
            : new Date().toISOString().split("T")[0];

          const { error } = await admin.from("activities").insert({
            user_id:            userId,
            strava_activity_id: act.id,
            name:               act.name ?? sportType,
            sport_type:         sportType,
            date,
            duration_seconds:   act.moving_time ?? act.elapsed_time ?? null,
            distance_m:         act.distance ?? null,
            calories:           act.calories ? Math.round(act.calories) : null,
            avg_hr:             act.average_heartrate ? Math.round(act.average_heartrate) : null,
            elevation_gain_m:   act.total_elevation_gain ?? null,
            source:             "strava",
            strava_raw_json:    act,
          });
          if (error) {
            if (error.message.includes("duplicate") || error.message.includes("unique")) {
              skipped++;
            } else {
              errorDetails.push(`Activity ${actId}: ${error.message}`);
              errors++;
            }
          } else {
            activitiesInserted++;
            syncedActivityIds.add(actId);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errorDetails.push(`Unexpected error for ${actId}: ${msg}`);
        errors++;
      }
    }

    if (acts.length < 200) break;
    page++;
  }

  return NextResponse.json({
    success: errors === 0,
    runs_inserted: runsInserted,
    activities_inserted: activitiesInserted,
    skipped,
    errors,
    pages_fetched: page,
    error_details: errorDetails.slice(0, 20),
  });
}
