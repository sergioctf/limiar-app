/**
 * GET /api/admin/strava-debug?secret=limiar_admin_2026
 * Diagnóstico da integração Strava — mostra token, scope e primeiras actividades.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { refreshStravaToken } from "@/lib/strava";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Get all strava connections
  const { data: connections } = await admin
    .from("strava_connections")
    .select("user_id, athlete_id, scope, expires_at, access_token, refresh_token, updated_at");

  if (!connections || connections.length === 0) {
    return NextResponse.json({ error: "No Strava connections found" });
  }

  const conn = connections[0];
  const results: Record<string, unknown> = {
    athlete_id: conn.athlete_id,
    scope: conn.scope,
    expires_at: new Date(conn.expires_at * 1000).toISOString(),
    token_expired: Date.now() / 1000 > conn.expires_at,
    updated_at: conn.updated_at,
  };

  // Refresh if expired
  let accessToken = conn.access_token;
  if (Date.now() / 1000 > conn.expires_at - 60) {
    try {
      const refreshed = await refreshStravaToken(conn.refresh_token);
      accessToken = refreshed.access_token;
      results.token_refreshed = true;
      await admin.from("strava_connections").update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: refreshed.expires_at,
        updated_at: new Date().toISOString(),
      }).eq("user_id", conn.user_id);
    } catch (e) {
      results.refresh_error = String(e);
    }
  }

  // Test /athlete
  const athleteRes = await fetch("https://www.strava.com/api/v3/athlete", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  results.athlete_status = athleteRes.status;
  if (athleteRes.ok) {
    const a = await athleteRes.json();
    results.athlete = { id: a.id, firstname: a.firstname, lastname: a.lastname };
  } else {
    results.athlete_error = await athleteRes.text();
  }

  // Test /athlete/activities (first page, 5 items)
  const activitiesRes = await fetch(
    "https://www.strava.com/api/v3/athlete/activities?per_page=5&page=1",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  results.activities_status = activitiesRes.status;
  if (activitiesRes.ok) {
    const acts = await activitiesRes.json();
    if (Array.isArray(acts)) {
      results.activities_count_first_page = acts.length;
      results.activities_sample = acts.map((a: Record<string, unknown>) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        sport_type: a.sport_type,
        date: a.start_date_local,
        distance_m: a.distance,
      }));
    } else {
      results.activities_error = acts;
    }
  } else {
    results.activities_error = await activitiesRes.text();
  }

  return NextResponse.json(results, { status: 200 });
}
