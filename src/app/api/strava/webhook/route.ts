/**
 * Strava Webhook — /api/strava/webhook
 *
 * GET  → verificação de assinatura (Strava envia hub.challenge)
 * POST → evento de atividade (create/update/delete)
 *
 * Fluxo de uma nova corrida:
 *  1. Strava POSTa o evento com object_id (activity_id) e owner_id (athlete_id)
 *  2. Buscamos o user pelo athlete_id na tabela strava_connections
 *  3. Baixamos a atividade da API do Strava
 *  4. Salvamos/atualizamos no banco
 *  5. Rodamos análise IA (GPT-4o-mini) e salvamos como coach_feedback
 *  6. Respondemos 200 pro Strava
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { refreshStravaToken, getStravaActivity, stravaActivityToRun } from "@/lib/strava";
import { analyzeRun } from "@/lib/ai";
import { isProbableDuplicate, formatDistanceKm } from "@/lib/utils";
import { sendPushToUser } from "@/lib/push";
import { notifyFriendsOfWorkout, workoutOf } from "@/lib/friend-notify";

// Permite até 60s (necessário para IA + Strava fetch)
export const maxDuration = 60;

// ─── GET — verificação de assinatura ────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.STRAVA_VERIFY_TOKEN) {
    return NextResponse.json({ "hub.challenge": challenge });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── POST — eventos de atividade ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: {
    object_type: string;
    object_id: number;
    aspect_type: string;
    owner_id: number;
    subscription_id?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Só processa atividades (não atletas)
  if (body.object_type !== "activity") {
    return NextResponse.json({ ok: true });
  }

  // Soft-delete: marca como deletado no banco
  if (body.aspect_type === "delete") {
    const admin = createAdminClient();
    await admin
      .from("runs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("strava_activity_id", body.object_id);
    return NextResponse.json({ ok: true });
  }

  // Só processa create e update
  if (body.aspect_type !== "create" && body.aspect_type !== "update") {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  // 1. Encontrar o usuário pelo athlete_id do Strava
  const { data: conn } = await admin
    .from("strava_connections")
    .select("*")
    .eq("athlete_id", body.owner_id)
    .single();

  if (!conn) {
    // Atleta não está registrado no Limiar — ignorar
    return NextResponse.json({ ok: true });
  }

  const userId = conn.user_id;

  try {
    // 2. Garantir token válido
    let accessToken = conn.access_token;
    if (Date.now() / 1000 > conn.expires_at - 300) {
      const refreshed = await refreshStravaToken(conn.refresh_token);
      accessToken = refreshed.access_token;
      await admin
        .from("strava_connections")
        .update({
          access_token:  refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at:    refreshed.expires_at,
          updated_at:    new Date().toISOString(),
        })
        .eq("user_id", userId);
    }

    // 3. Buscar atividade completa no Strava
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activity = await getStravaActivity(accessToken, body.object_id) as any;

    // Everything that is not a run belongs in `activities`.
    //
    // This used to return early and drop the event on the floor, which is why
    // gym sessions, rides, walks and pilates only ever appeared after the
    // athlete opened settings and pressed sync by hand — the exact chore the
    // webhook exists to remove. Runs go to `runs`; the rest go here, with the
    // calories the watch measured, straight from the detail payload.
    if (activity.type !== "Run" && activity.sport_type !== "Run") {
      const sportType: string = activity.sport_type ?? activity.type ?? "Workout";
      const date: string = activity.start_date_local
        ? String(activity.start_date_local).split("T")[0]
        : new Date().toISOString().slice(0, 10);

      const row = {
        user_id:            userId,
        strava_activity_id: activity.id,
        name:               activity.name ?? sportType,
        sport_type:         sportType,
        date,
        duration_seconds:   activity.moving_time ?? activity.elapsed_time ?? null,
        distance_m:         activity.distance ?? null,
        calories:           activity.calories ? Math.round(activity.calories) : null,
        avg_hr:             activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
        elevation_gain_m:   activity.total_elevation_gain ?? null,
        source:             "strava",
        strava_raw_json:    activity,
      };

      const { data: known } = await admin
        .from("activities").select("id")
        .eq("user_id", userId).eq("strava_activity_id", activity.id)
        .maybeSingle();

      // An edit on Strava — a renamed session, a corrected duration — should
      // land here too, not create a second row.
      if (known?.id) {
        await admin.from("activities").update(row).eq("id", known.id);
      } else {
        await admin.from("activities").insert(row);
        // Only a genuinely new session is worth announcing. An edit on Strava
        // is not a workout, and the throttle inside would swallow it anyway.
        await notifyFriendsOfWorkout(admin, userId, workoutOf(row.sport_type, {
          name:        row.name,
          distanceKm:  row.distance_m != null ? row.distance_m / 1000 : null,
          durationMin: row.duration_seconds != null ? row.duration_seconds / 60 : null,
          date:        row.date,
        }), (id, payload) => sendPushToUser(admin, id, payload));
      }

      return NextResponse.json({ ok: true, sport: sportType, stored: "activities" });
    }

    const run = stravaActivityToRun(activity, userId);

    // 4a. Se for update, atualiza os dados da corrida existente
    if (body.aspect_type === "update") {
      await admin
        .from("runs")
        .update({
          name:                    run.name,
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
          strava_raw_json:         run.strava_raw_json,
          synced_at:               new Date().toISOString(),
        })
        .eq("strava_activity_id", body.object_id)
        .eq("user_id", userId);

      return NextResponse.json({ ok: true });
    }

    // 4b. create: verificar duplicatas com corridas manuais
    const { data: existingByStrava } = await admin
      .from("runs")
      .select("id")
      .eq("strava_activity_id", body.object_id)
      .eq("user_id", userId)
      .single();

    if (existingByStrava) {
      // Já existe — ignorar
      return NextResponse.json({ ok: true, status: "already_exists" });
    }

    // Verificar se existe corrida manual com mesma data/distância
    const { data: manualRuns } = await admin
      .from("runs")
      .select("id, date, distance_km, duration_seconds")
      .eq("user_id", userId)
      .is("strava_activity_id", null)
      .is("deleted_at", null);

    const duplicate = (manualRuns ?? []).find((m: { id: string; date: string; distance_km: number; duration_seconds: number }) =>
      isProbableDuplicate(
        { date: m.date, distance_km: m.distance_km, duration_seconds: m.duration_seconds },
        {
          date: run.date ?? "",
          distance_km: run.distance_km ?? 0,
          duration_seconds: run.duration_seconds ?? 0,
        }
      )
    );

    let savedRunId: string | null = null;

    if (duplicate) {
      // Merge: atualiza corrida manual com dados do Strava
      const { data: updated } = await admin
        .from("runs")
        .update({
          strava_activity_id:      activity.id,
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
          strava_raw_json:         run.strava_raw_json,
          synced_at:               new Date().toISOString(),
        })
        .eq("id", duplicate.id)
        .select("id")
        .single();
      savedRunId = updated?.id ?? null;
    } else {
      // Inserir nova corrida
      const { data: inserted } = await admin
        .from("runs")
        .insert({ ...run, source: "strava", synced_at: new Date().toISOString() })
        .select("id")
        .single();
      savedRunId = inserted?.id ?? null;

      // A run is announced exactly like a gym session is. It was not: this
      // call lived only in the branch above, the one for everything that is
      // not a run, so the sport the app is built around was the one sport a
      // friend never heard about.
      if (savedRunId) {
        await notifyFriendsOfWorkout(admin, userId, workoutOf("Run", {
          name:        run.name,
          distanceKm:  run.distance_km ?? null,
          durationMin: run.duration_seconds != null ? run.duration_seconds / 60 : null,
          date:        run.date ?? "",
        }), (id, payload) => sendPushToUser(admin, id, payload));
      }
    }

    // 5. Análise IA (async — não bloqueia se demorar ou falhar)
    if (savedRunId) {
      try {
        // Buscar TODAS as corridas para contexto completo da IA (128k context window)
        const { data: allRuns } = await admin
          .from("runs")
          .select("*")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .order("date", { ascending: false });

        // Montar objeto run completo para a IA
        const { data: savedRun } = await admin
          .from("runs")
          .select("*")
          .eq("id", savedRunId)
          .single();

        if (savedRun) {
          const feedback = await analyzeRun(savedRun, allRuns ?? []);
          if (feedback) {
            await admin
              .from("runs")
              .update({ coach_feedback: feedback, source: "strava+ai" })
              .eq("id", savedRunId);
          }

          // Push: avisa que a corrida foi importada e analisada
          if (!duplicate) {
            const distLabel = savedRun.distance_km ? formatDistanceKm(savedRun.distance_km) : "";
            sendPushToUser(admin, userId, {
              title: "Corrida analisada! 🏃",
              body:  `${savedRun.name ?? "Sua corrida"} (${distLabel}) já tem feedback do treinador.`,
              url:   `/runs/${savedRunId}`,
              tag:   "limiar-run-analyzed",
              icon:  "/limiar_icone_app.png",
            }).catch(() => {});
          }
        }
      } catch (aiErr) {
        console.error("[Webhook] AI analysis failed (non-critical):", aiErr);
      }
    }

    // Log
    await admin.from("sync_logs").insert({
      user_id:             userId,
      source:              "strava_webhook",
      status:              "success",
      message:             `Webhook ${body.aspect_type}: activity ${body.object_id}`,
      activities_imported: duplicate ? 0 : 1,
      activities_updated:  duplicate ? 1 : 0,
      activities_ignored:  0,
    }).catch(() => {});

    return NextResponse.json({ ok: true, savedRunId });

  } catch (err) {
    console.error("[Webhook] Error processing event:", err);
    // Mesmo em erro, retornar 200 pro Strava (evita reenvio infinito)
    return NextResponse.json({ ok: true, error: "Internal error — logged" });
  }
}
