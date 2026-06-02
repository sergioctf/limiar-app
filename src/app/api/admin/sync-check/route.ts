/**
 * GET /api/admin/sync-check?secret=limiar_admin_2026
 * Diagnóstico completo: conta quantas atividades existem no Strava vs na BD.
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

  // Get Strava connection
  const { data: conn } = await admin
    .from("strava_connections")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (!conn) return NextResponse.json({ error: "No connection" });

  // Refresh token if needed
  let accessToken = conn.access_token;
  if (Date.now() / 1000 > conn.expires_at - 60) {
    const refreshed = await refreshStravaToken(conn.refresh_token);
    accessToken = refreshed.access_token;
  }

  // Count activities on Strava (fetch all pages with per_page=200)
  const stravaByType: Record<string, number> = {};
  const stravaIds: number[] = [];
  let page = 1;
  let totalStrava = 0;

  while (true) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acts: any[] = await res.json();
    if (!Array.isArray(acts) || acts.length === 0) break;

    for (const a of acts) {
      const t = a.sport_type ?? a.type ?? "Other";
      stravaByType[t] = (stravaByType[t] ?? 0) + 1;
      stravaIds.push(a.id);
      totalStrava++;
    }
    if (acts.length < 200) break;
    page++;
  }

  // Count what's in the DB
  const { count: runsCount } = await admin
    .from("runs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", conn.user_id)
    .not("strava_activity_id", "is", null)
    .is("deleted_at", null);

  const { count: activitiesCount } = await admin
    .from("activities")
    .select("*", { count: "exact", head: true })
    .eq("user_id", conn.user_id)
    .is("deleted_at", null);

  // Find IDs already in DB
  const { data: syncedRuns } = await admin
    .from("runs")
    .select("strava_activity_id")
    .eq("user_id", conn.user_id)
    .not("strava_activity_id", "is", null);

  const { data: syncedActivities } = await admin
    .from("activities")
    .select("strava_activity_id")
    .eq("user_id", conn.user_id)
    .not("strava_activity_id", "is", null);

  const syncedIds = new Set([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(syncedRuns ?? []).map((r: any) => r.strava_activity_id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(syncedActivities ?? []).map((a: any) => a.strava_activity_id),
  ]);

  const missing = stravaIds.filter((id) => !syncedIds.has(id));

  return NextResponse.json({
    strava: {
      total: totalStrava,
      pages_fetched: page,
      by_type: stravaByType,
    },
    db: {
      runs_with_strava_id: runsCount,
      activities: activitiesCount,
    },
    missing_count: missing.length,
    missing_ids_sample: missing.slice(0, 10),
  });
}
