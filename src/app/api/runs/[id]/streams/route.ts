/**
 * GET /api/runs/[id]/streams
 * Returns per-km splits, HR drift and the GPS track for a run.
 * Fetches from Strava once and caches in run_streams (rate-limit friendly).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { refreshStravaToken, getStravaStreams, StravaApiError } from "@/lib/strava";
import { analyzeStreams } from "@/lib/run-streams";

export const maxDuration = 30;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runId = params.id;
  const admin = createAdminClient();

  // The run must belong to the user and have a Strava activity id
  const { data: run } = await admin
    .from("runs")
    .select("id, user_id, strava_activity_id")
    .eq("id", runId)
    .maybeSingle();

  if (!run || run.user_id !== user.id) {
    return NextResponse.json({ error: "Corrida não encontrada" }, { status: 404 });
  }
  if (!run.strava_activity_id) {
    return NextResponse.json({ analysis: null, reason: "no_strava" });
  }

  // Cache hit?
  const { data: cached } = await admin
    .from("run_streams")
    .select("analysis")
    .eq("run_id", runId)
    .maybeSingle();
  if (cached?.analysis) {
    return NextResponse.json({ analysis: cached.analysis, cached: true });
  }

  // Need the user's Strava token
  const { data: conn } = await admin
    .from("strava_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conn) return NextResponse.json({ analysis: null, reason: "no_connection" });

  let accessToken = conn.access_token;
  try {
    if (Date.now() / 1000 > conn.expires_at - 300) {
      const refreshed = await refreshStravaToken(conn.refresh_token);
      accessToken = refreshed.access_token;
      await admin.from("strava_connections").update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: refreshed.expires_at,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);
    }

    const streams = await getStravaStreams(accessToken, run.strava_activity_id);
    const analysis = analyzeStreams(streams);

    // Cache (best-effort; don't fail the response if the write errors)
    await admin.from("run_streams").upsert({
      run_id: runId,
      user_id: user.id,
      streams,
      analysis,
      fetched_at: new Date().toISOString(),
    }, { onConflict: "run_id" }).then(() => {}, () => {});

    return NextResponse.json({ analysis, cached: false });
  } catch (err) {
    if (err instanceof StravaApiError && err.status === 429) {
      return NextResponse.json({ error: "Limite do Strava atingido — tente em alguns minutos." }, { status: 429 });
    }
    console.error("[runs/streams] error:", err);
    return NextResponse.json({ analysis: null, reason: "fetch_failed" }, { status: 200 });
  }
}
