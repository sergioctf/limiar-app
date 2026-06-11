import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  refreshStravaToken,
  getStravaActivities,
  stravaActivityToRun,
  StravaApiError,
} from "@/lib/strava";
import { isProbableDuplicate } from "@/lib/utils";
import { analyzeRun } from "@/lib/ai";

// Allow up to 90s — bulk sync + AI analysis for top 3 runs
export const maxDuration = 90;

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

    // Also get existing strava_activity_ids in the activities table
    const { data: existingActivities } = await supabase
      .from("activities")
      .select("strava_activity_id")
      .eq("user_id", user.id)
      .not("strava_activity_id", "is", null);
    const existingActivityIds = new Set(
      (existingActivities ?? []).map((a) => a.strava_activity_id)
    );

    // Run sport types — go to `runs` table
    const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill"]);

    // Track newly imported run IDs for post-sync AI analysis
    const newlyImportedRunIds: string[] = [];

    // Fetch activities from Strava
    let imported = 0, updated = 0, ignored = 0, activitiesImported = 0;
    let page = 1;

    while (true) {
      const activities = await getStravaActivities(accessToken, page, 50);
      if (!Array.isArray(activities) || activities.length === 0) break;

      for (const activity of activities) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const act = activity as any;
        const sportType: string = act.sport_type ?? act.type ?? "Other";
        const isRun = RUN_TYPES.has(sportType);

        if (isRun) {
          // ── RUNS TABLE ──────────────────────────────────────────────────
          if (existingIds.has(act.id)) { ignored++; continue; }

          const run = stravaActivityToRun(act, user.id);

          const duplicate = (manualRuns ?? []).find((m) =>
            isProbableDuplicate(
              { date: m.date, distance_km: m.distance_km, duration_seconds: m.duration_seconds },
              { date: run.date ?? "", distance_km: run.distance_km ?? 0, duration_seconds: run.duration_seconds ?? 0 }
            )
          );

          if (duplicate) {
            const { error } = await admin.from("runs").update({
              strava_activity_id:      act.id,
              source:                  "strava+ai",
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
            }).eq("id", duplicate.id);

            if (!error) {
              updated++;
              existingIds.add(act.id);
              const idx = (manualRuns ?? []).indexOf(duplicate);
              if (idx !== -1) manualRuns!.splice(idx, 1);
            }
          } else {
            const { error, data: inserted } = await admin.from("runs").insert({ ...run, synced_at: new Date().toISOString() }).select("id").single();
            if (!error) {
              imported++;
              existingIds.add(act.id);
              if (inserted?.id) newlyImportedRunIds.push(inserted.id);
            }
          }
        } else {
          // ── ACTIVITIES TABLE (gym, bike, swim, etc.) ─────────────────────
          if (existingActivityIds.has(act.id)) { ignored++; continue; }

          const date: string = act.start_date_local
            ? act.start_date_local.split("T")[0]
            : new Date().toISOString().split("T")[0];

          const { error } = await admin.from("activities").insert({
            user_id:            user.id,
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

          if (!error) { activitiesImported++; existingActivityIds.add(act.id); }
        }
      }

      if (activities.length < 50) break;
      page++;
    }

    // ── 🤖 Auto-analyze top 3 newly imported runs ──────────────────────────
    // Sequential (not parallel) to respect Groq rate limits
    if (newlyImportedRunIds.length > 0) {
      try {
        const { data: allRuns } = await admin
          .from("runs")
          .select("*")
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .order("date", { ascending: false });

        const toAnalyze = newlyImportedRunIds.slice(0, 3); // max 3 per sync
        for (const runId of toAnalyze) {
          const run = (allRuns ?? []).find((r: { id: string }) => r.id === runId);
          if (!run || run.coach_feedback) continue;
          const feedback = await analyzeRun(run, allRuns ?? []);
          if (feedback) {
            await admin.from("runs")
              .update({ coach_feedback: feedback, source: "strava+ai" })
              .eq("id", runId);
          }
        }
      } catch {
        // Non-critical — don't fail the sync
      }
    }

    // Log sync
    await admin.from("sync_logs").insert({
      user_id:              user.id,
      source:               "strava",
      status:               "success",
      message:              `Corridas: ${imported} novas, ${updated} atualizadas | Atividades: ${activitiesImported} novas | Ignoradas: ${ignored}`,
      activities_imported:  imported + activitiesImported,
      activities_updated:   updated,
      activities_ignored:   ignored,
    });

    return NextResponse.json({ imported, updated, ignored, activitiesImported, success: true });
  } catch (err) {
    console.error("Strava sync error:", err);

    // Friendly, actionable messages by failure class
    let message = err instanceof Error ? err.message : "Erro no sync";
    let status  = 500;
    if (err instanceof StravaApiError) {
      if (err.status === 401 || err.status === 403) {
        message = "Conexão com o Strava expirou — desconecte e reconecte em Configurações.";
        status  = 401;
      } else if (err.status === 429) {
        message = "O Strava limitou as requisições — aguarde alguns minutos e tente de novo.";
        status  = 429;
      } else {
        message = "Strava indisponível no momento — já tentamos 3 vezes. Tente novamente em instantes.";
        status  = 502;
      }
    }

    await admin.from("sync_logs").insert({
      user_id:             user.id,
      source:              "strava",
      status:              "error",
      message,
      activities_imported: 0,
      activities_updated:  0,
      activities_ignored:  0,
    }).catch(() => {});

    return NextResponse.json({ error: message }, { status });
  }
}
