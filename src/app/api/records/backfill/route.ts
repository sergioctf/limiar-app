/**
 * POST /api/records/backfill
 *
 * Reads the next slice of the athlete's history so their records cover all of
 * it, not just the runs they happened to open. The loop lives in the client:
 * it calls this until `done`, showing the count climbing, which keeps each
 * request inside its time budget and keeps Strava's shared rate limit visible.
 *
 * The work itself is in `lib/records-backfill.ts`, shared with the nightly sync.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { pendingRuns, freshToken, backfillEfforts } from "@/lib/records-backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Activities per call. Small enough to finish well inside maxDuration. */
const BATCH = 12;

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const pending = await pendingRuns(admin, user.id);
  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0, done: true });
  }

  const { data: conn } = await admin
    .from("strava_connections").select("*").eq("user_id", user.id).maybeSingle();
  if (!conn) {
    return NextResponse.json({ processed: 0, remaining: pending.length, reason: "no_connection" });
  }

  const token = await freshToken(admin, conn);
  if (!token) {
    return NextResponse.json({ processed: 0, remaining: pending.length, reason: "auth_failed" });
  }

  const r = await backfillEfforts(admin, user.id, token, pending, BATCH);
  return NextResponse.json({ ...r, done: r.remaining === 0 });
}
