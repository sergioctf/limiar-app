/**
 * GET /api/push/diagnose?secret=… → non-sensitive health of the push setup.
 *
 * Reports whether the VAPID pair loads, key lengths, the normalized subject and
 * how many subscriptions exist (by push service host). Never returns key
 * material — only lengths and a short public-key prefix, which is enough to
 * confirm the server and the browser are using the SAME public key.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { pushConfigHealth } from "@/lib/push";
import { authorizeAdmin } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
  if (!authorizeAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const health = pushConfigHealth();

  let subscriptions: { total: number; byHost: Record<string, number> } = { total: 0, byHost: {} };
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("push_subscriptions").select("endpoint");
    const rows = (data ?? []) as Array<{ endpoint: string }>;
    const byHost: Record<string, number> = {};
    for (const r of rows) {
      let host = "invalid";
      try { host = new URL(r.endpoint).host; } catch { /* keep 'invalid' */ }
      byHost[host] = (byHost[host] ?? 0) + 1;
    }
    subscriptions = { total: rows.length, byHost };
  } catch (err) {
    return NextResponse.json({ vapid: health, subscriptionsError: String(err) });
  }

  return NextResponse.json({ vapid: health, subscriptions });
}
