/**
 * POST /api/integrations/intervals/sync — pull recent nights, throttled.
 *
 * Called quietly whenever the athlete opens the app, so it has to be cheap to
 * call often: inside the throttle window it answers from memory without
 * touching intervals.icu at all. `?force=1` is the "sincronizar agora" button.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { syncIntervals } from "@/lib/intervals-sync";

export const maxDuration = 30;

/**
 * How stale the data may get before opening the app reads again.
 *
 * Twenty minutes felt reasonable for a nightly signal and wrong in practice:
 * Garmin delivers during the day too — resting heart rate, HRV and steps landed
 * on Monday afternoon — and intervals.icu passes them on within minutes of a
 * watch sync. An athlete who syncs the band and opens the app should see it.
 * Five minutes still keeps screen-to-screen browsing from turning into a stream
 * of requests, and it is one call per athlete against a limit of thousands a day.
 */
const THROTTLE_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: conn, error } = await admin
    .from("intervals_connections").select("last_sync_at")
    .eq("user_id", user.id).maybeSingle();

  if (error || !conn) return NextResponse.json({ ok: false, connected: false });

  const force = request.nextUrl.searchParams.get("force") === "1";
  const last = conn.last_sync_at ? new Date(conn.last_sync_at).getTime() : 0;
  if (!force && Date.now() - last < THROTTLE_MS) {
    return NextResponse.json({ ok: true, connected: true, skipped: true, saved: 0 });
  }

  const result = await syncIntervals(admin, user.id);
  return NextResponse.json({ connected: true, ...result }, { status: result.ok ? 200 : 502 });
}
