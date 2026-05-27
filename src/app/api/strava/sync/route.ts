import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  refreshStravaToken,
  getStravaActivities,
  stravaActivityToRun,
} from "@/lib/strava";
import { isProbableDuplicate } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  try {
    // Get Strava connection
    const { data: conn } = await supabase
      .from("strava_connections")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!conn) {
      return NextResponse.json({ error: "Strava não conectado" }, { status: 400 });
    }

    // Refresh token if expired
    let accessToken = conn.access_token;
    if (Date.now() / 1000 > conn.expires_at - 300) {
      const refreshed = await refreshStravaToken(conn.refresh_token);
      accessToken = refreshed.access_token;
      await admin.from("strava_connections").update({
        access_token:  refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at:    refreshed.expires_at,
        updated_at:    new Date().toISOString(),
      }).eq("user_id", user.id);
    }

    // Get existing strava_activity_ids to avoid duplicates (already synced)
    const { data: existingSynced } = await supabase
      .from("runs")
      .select("strava_activity_id")
      .eq("user_id", user.id)
      .not("strava_activity_id", "is", null);

    const existingIds = new Set((existingSynced ?? []).map((r) => r.strava_activity_id));

    // Get manual/seed runs (no strava_activity_id) for deduplication
    const { data: manualRuns } = await supabase
      .from("runs")
      .select("id, date, distance_km, duration_seconds, source")
      .eq("user_id", user.id)
      .is("strava_activity_id", null)
      .is("deleted_at", null);

    // Fetch activities from Strava
    let imported = 0, updated = 0, ignored = 0;
    let page = 1;

    while (true) {
      const activities = await getStravaActivities(accessToken, page, 50);
      if (!Array.isArray(activities) || activities.length === 0) break;

      // Filter only runs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runs = activities.filter((a: any) => a.type === "Run");

      for (const activity of runs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const act = activity as any;

        // Skip if already linked to this Strava activity
        if (existingIds.has(act.id)) {
          ignored++;
          continue;
        }

        const run = stravaActivityToRun(act, user.id);

        // Check if a manual/seed run is a probable duplicate
        const duplicate = (manualRuns ?? []).find((m) =>
          isProbableDuplicate(
            { date: m.date, distance_km: m.distance_km, duration_seconds: m.duration_seconds },
            {
              date: run.date ?? "",
              distance_km: run.distance_km ?? 0,
              duration_seconds: run.duration_seconds ?? 0,
            }
          )
        );

        if (duplicate) {
          // Merge: update the existing manual/seed run with Strava objective data
          const { error } = await admin
            .from("runs")
            .update({
              strava_activity_id:      act.id,
              source:                  "strava+ai",
              // Overwrite objective fields with Strava's authoritative values
              distance_km:             run.distance_km,
              duration_seconds:        run.duration_seconds,
              moving_time_seconds:     run.moving_time_seconds,
              elapsed_time_seconds:    run.elapsed_time_seconds,
              avg_pace_seconds_per_km: run.avg_pace_seconds_per_km,
              avg_speed_mps:           run.avg_speed_mps,
              max_speed_mps:           run.max_speed_mps,
              avg_hr:                  run.avg_hr,
              max_hr:                  run.max_hr,
              elevation_gain_m:        run.elevation_gain_m,
              avg_cadence:             run.avg_cadence,
              calories:                run.calories,
              map_polyline:            run.map_polyline,
              device_name:             run.device_name,
              strava_raw_json:         run.strava_raw_json,
              synced_at:               new Date().toISOString(),
            })
            .eq("id", duplicate.id);

          if (!error) {
            updated++;
            existingIds.add(act.id);
            // Remove from manualRuns pool so it can't match again
            const idx = (manualRuns ?? []).indexOf(duplicate);
            if (idx !== -1) manualRuns!.splice(idx, 1);
          }
        } else {
          // No match — insert as a fresh Strava run
          const { error } = await admin.from("runs").insert({
            ...run,
            synced_at: new Date().toISOString(),
          });

          if (!error) {
            imported++;
            existingIds.add(act.id);
          }
        }
      }

      if (activities.length < 50) break;
      page++;
    }

    // Log sync
    await admin.from("sync_logs").insert({
      user_id:              user.id,
      source:               "strava",
      status:               "success",
      message:              `Importadas: ${imported}, Atualizadas: ${updated}, Ignoradas: ${ignored}`,
      activities_imported:  imported,
      activities_updated:   updated,
      activities_ignored:   ignored,
    });

    return NextResponse.json({ imported, updated, ignored, success: true });
  } catch (err) {
    console.error("Strava sync error:", err);
    const message = err instanceof Error ? err.message : "Sync error";

    await admin.from("sync_logs").insert({
      user_id:             user.id,
      source:              "strava",
      status:              "error",
      message,
      activities_imported: 0,
      activities_updated:  0,
      activities_ignored:  0,
    }).catch(() => {});

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
