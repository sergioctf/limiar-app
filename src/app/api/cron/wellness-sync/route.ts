/**
 * GET /api/cron/wellness-sync — daily, 08:00 BRT.
 *
 * The athlete who never opens the app still gets a readiness score built from
 * last night. Opening the app syncs too; this is the safety net for the mornings
 * they go straight out the door.
 *
 * 08:00 rather than earlier: the night reaches intervals.icu only after the band
 * syncs to the phone, which for most people happens after they wake up.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authorizeCron } from "@/lib/cron-auth";
import { syncIntervals } from "@/lib/intervals-sync";
import { dispatchMorning } from "@/lib/morning-dispatch";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: conns, error } = await admin.from("intervals_connections").select("user_id");
  if (error) {
    const morning = await dispatchMorning(admin, { final: true });
    return NextResponse.json({ ok: false, error: "tabela ausente (migration 026?)", morning });
  }

  const results: Record<string, unknown> = {};
  for (const { user_id } of (conns ?? []) as Array<{ user_id: string }>) {
    const r = await syncIntervals(admin, user_id);
    // Ids truncated: this lands in Vercel logs, which is no place for a full uuid.
    results[user_id.slice(0, 8)] = r.ok ? { saved: r.saved, latest: r.latest } : { error: r.error };
  }

  // Final pass of the morning notification: whoever is still waiting hears
  // about their day now, with the night if it came and without if it did not.
  const morning = await dispatchMorning(admin, { final: true });

  return NextResponse.json({ ok: true, athletes: Object.keys(results).length, results, morning });
}
