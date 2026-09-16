/**
 * GET /api/records
 *
 * Personal records by distance — best and runner-up — over the athlete's whole
 * history. See `lib/records.ts` for how a record is decided, and
 * `lib/best-efforts.ts` for the window search that makes a 10 km record
 * findable inside a 15 km run.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { effortsInActivity } from "@/lib/best-efforts";
import { buildRecords, type RunForRecords, type StoredEffort } from "@/lib/records";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const RUN_COLS =
  "id, name, date, distance_km, duration_seconds, moving_time_seconds, elapsed_time_seconds, strava_activity_id";
const EFFORT_COLS =
  "run_id, distance_m, seconds, pace_sec_km, start_m, end_m, run_date, paused_sec";

/**
 * Fill the table from streams already cached.
 *
 * Efforts are normally written when a run's streams are fetched, so an athlete
 * who has been using the app for months would open this page and find it empty
 * until they happened to re-open old runs — the records existed, we simply had
 * never looked. This reads the cache we already hold, so it costs no Strava
 * calls. Runs with no cached streams are the backfill route's job.
 */
async function backfillFromCache(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  userId: string,
): Promise<number> {
  const { data: cached } = await admin
    .from("run_streams").select("run_id, streams").eq("user_id", userId).limit(200);
  if (!cached || cached.length === 0) return 0;

  const runIds = cached.map((c: { run_id: string }) => c.run_id);
  const { data: runs } = await admin.from("runs").select("id, date, distance_km").in("id", runIds);
  const metaById = new Map(
    ((runs ?? []) as Array<{ id: string; date: string; distance_km: number }>).map(r => [r.id, r]),
  );

  const rows: Array<Record<string, unknown>> = [];
  for (const c of cached as Array<{ run_id: string; streams: unknown }>) {
    const meta = metaById.get(c.run_id);
    if (!meta) continue;
    const date = meta.date;
    for (const e of effortsInActivity(c.streams as never, meta.distance_km)) {
      rows.push({
        run_id: c.run_id, user_id: userId, distance_m: e.distanceM,
        seconds: e.seconds, pace_sec_km: e.paceSecPerKm,
        start_m: e.startM, end_m: e.endM, paused_sec: e.pausedSec, run_date: date,
      });
    }
  }
  if (rows.length === 0) return 0;

  let { error } = await admin
    .from("run_best_efforts").upsert(rows, { onConflict: "run_id,distance_m" });
  if (error?.message?.includes("paused_sec")) {
    const semPausa = rows.map(({ paused_sec: _omit, ...r }) => r);
    ({ error } = await admin
      .from("run_best_efforts").upsert(semPausa, { onConflict: "run_id,distance_m" }));
  }
  if (error) { console.error("[records] backfill:", error.message); return 0; }
  return rows.length;
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  /*
   * `paused_sec` arrived in a later migration than the table. Selecting a column
   * that does not exist fails the whole query, which would render the records
   * page as "unavailable" on a database where 024 ran but 025 has not.
   */
  const read = (withPaused: boolean) => admin
    .from("run_best_efforts")
    .select(withPaused ? EFFORT_COLS : EFFORT_COLS.replace(", paused_sec", ""))
    .eq("user_id", user.id);

  let { data: rows, error } = await read(true);
  if (error?.message?.includes("paused_sec")) ({ data: rows, error } = await read(false));

  if (!error && (rows ?? []).length === 0) {
    const filled = await backfillFromCache(admin, user.id);
    if (filled > 0) {
      ({ data: rows, error } = await read(true));
      if (error?.message?.includes("paused_sec")) ({ data: rows, error } = await read(false));
    }
  }

  if (error) {
    // Almost always the migration not being applied yet. Say so rather than
    // rendering an empty page that reads as "you have no records".
    console.error("[records]", error.message);
    return NextResponse.json({ records: [], reason: "unavailable" });
  }

  const { data: runRows } = await admin
    .from("runs").select(RUN_COLS).eq("user_id", user.id).is("deleted_at", null);

  type RunRow = RunForRecords & { strava_activity_id: number | null };
  const runs = (runRows ?? []) as RunRow[];
  // The zero-distance sentinel marks a run the backfill has already read; it is
  // bookkeeping, not a mark.
  const efforts = ((rows ?? []) as StoredEffort[]).filter(e => e.distance_m > 0);

  const records = buildRecords(runs, efforts);

  /*
   * Backfill progress, so the card can say "searching 14 of 61 runs" and offer
   * to finish the job instead of quietly presenting a partial history as if it
   * were the whole thing.
   */
  const scanned = new Set(((rows ?? []) as StoredEffort[]).map(e => e.run_id));
  const backfillable = runs.filter(r => r.strava_activity_id && !scanned.has(r.id)).length;

  return NextResponse.json({
    records,
    activitiesAnalysed: scanned.size,
    activitiesTotal: runs.length,
    backfillable,
    /* Raw windows, so the dashboard's month-over-month comparison is built from
     * the same candidate list as the record it sits under. */
    efforts: efforts.map(e => ({
      run_id: e.run_id, distance_m: e.distance_m,
      seconds: e.seconds, run_date: e.run_date,
    })),
  });
}
