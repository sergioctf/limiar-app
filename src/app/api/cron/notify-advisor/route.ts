/**
 * GET /api/cron/notify-advisor
 * Fridays at 21:00 BRT (00:00 UTC Saturday).
 *
 * Tells the athlete when the advisor has something worth acting on — a lift
 * that has not moved in a month, a movement that has been in the plan since
 * March. Those findings are useless if they only exist on a screen nobody
 * opens between sessions.
 *
 * Only pending findings raised this week, only the highest-severity one, and
 * only for athletes who have some. Silence is the normal outcome.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { authorizeCron } from "@/lib/cron-auth";
import { mondayOf } from "@/lib/weekly-plan";

export const maxDuration = 60;

interface Row {
  user_id: string;
  title: string;
  proposal: string;
  severity: string;
  area: string;
}

const RANK: Record<string, number> = { alta: 0, media: 1, baixa: 2 };

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const week = mondayOf(new Date());

  let rows: Row[] = [];
  try {
    const { data } = await admin
      .from("advisor_suggestions")
      .select("user_id, title, proposal, severity, area")
      .eq("status", "pending")
      .eq("week_start", week)
      .limit(500);
    rows = (data ?? []) as Row[];
  } catch {
    return NextResponse.json({ ok: true, skipped: "no_table" });
  }

  // One notification per athlete, carrying the finding that matters most.
  const byUser = new Map<string, Row[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  const results: Record<string, string> = {};
  for (const [userId, findings] of Array.from(byUser.entries())) {
    const top = [...findings].sort((a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3))[0];
    // Low-severity observations are not worth interrupting anyone for.
    if ((RANK[top.severity] ?? 3) > 1) { results[userId] = "skip:baixa"; continue; }

    const others = findings.length - 1;
    try {
      const { sent } = await sendPushToUser(admin, userId, {
        title: top.title,
        body: others > 0
          ? `${top.proposal} (+${others} observação${others > 1 ? "ões" : ""} no treinador)`
          : top.proposal,
        url:  "/coach",
        tag:  `limiar-advisor-${week}`,
        icon: "/api/icons/192",
      });
      results[userId] = sent > 0 ? `sent:${sent}` : "no_subscription";
    } catch (err) {
      results[userId] = `error:${err instanceof Error ? err.message : "unknown"}`;
    }
  }

  return NextResponse.json({ ok: true, week, athletes: byUser.size, results });
}
