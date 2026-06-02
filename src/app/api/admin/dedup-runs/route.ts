/**
 * GET /api/admin/dedup-runs?secret=limiar_admin_2026&dry=true
 * Finds manual runs that are duplicates of Strava runs (same date, similar distance).
 * With dry=true: only reports what would be removed.
 * With dry=false: soft-deletes the manual duplicates, keeping the Strava ones.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

function isSimilarDistance(a: number, b: number): boolean {
  if (a <= 0 && b <= 0) return true;
  const larger = Math.max(a, b);
  if (larger === 0) return true;
  return Math.abs(a - b) / larger < 0.08; // within 8%
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const dry = request.nextUrl.searchParams.get("dry") !== "false";

  const admin = createAdminClient();

  // Get all runs for the user (most recent connection)
  const { data: conn } = await admin
    .from("strava_connections")
    .select("user_id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (!conn) return NextResponse.json({ error: "No connection" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allRuns } = await admin
    .from("runs")
    .select("id, date, distance_km, source, strava_activity_id, name, deleted_at")
    .eq("user_id", conn.user_id)
    .is("deleted_at", null)
    .order("date", { ascending: false });

  if (!allRuns) return NextResponse.json({ error: "Could not fetch runs" });

  // Separate strava runs and manual runs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stravaRuns = allRuns.filter((r: any) => r.strava_activity_id !== null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manualRuns = allRuns.filter((r: any) => r.strava_activity_id === null);

  // Find manual runs that match a Strava run by date + distance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const duplicates: any[] = [];

  for (const manual of manualRuns) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = stravaRuns.find((s: any) =>
      s.date === manual.date &&
      isSimilarDistance(s.distance_km ?? 0, manual.distance_km ?? 0)
    );
    if (match) {
      duplicates.push({
        manual_id:    manual.id,
        manual_name:  manual.name,
        manual_date:  manual.date,
        manual_km:    manual.distance_km,
        strava_id:    match.id,
        strava_name:  match.name,
        strava_km:    match.distance_km,
      });
    }
  }

  if (dry) {
    return NextResponse.json({
      mode: "dry_run",
      duplicates_found: duplicates.length,
      would_delete: duplicates.map((d) => ({
        id: d.manual_id,
        name: d.manual_name,
        date: d.manual_date,
        km: d.manual_km,
        matched_strava: d.strava_name,
      })),
      total_runs: allRuns.length,
      strava_runs: stravaRuns.length,
      manual_runs: manualRuns.length,
    });
  }

  // Actually soft-delete the manual duplicates
  const idsToDelete = duplicates.map((d) => d.manual_id);
  let deleted = 0;
  const errors: string[] = [];

  for (const id of idsToDelete) {
    const { error } = await admin
      .from("runs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) errors.push(`${id}: ${error.message}`);
    else deleted++;
  }

  return NextResponse.json({
    mode: "execute",
    duplicates_found: duplicates.length,
    deleted,
    errors,
    duplicates,
  });
}
