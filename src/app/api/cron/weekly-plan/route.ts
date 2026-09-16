/**
 * GET /api/cron/weekly-plan
 * Runs every Monday at 00:00 (America/Sao_Paulo ≈ 03:00 UTC).
 *
 * Generates the training plan for the week that just started and pre-generates
 * the following week, so the athlete always has two weeks visible without
 * waiting on the AI. Existing plans are kept — only missing weeks are created.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureWeeklyPlan, mondayOf, nextMondayOf } from "@/lib/weekly-plan";
import { authorizeCron } from "@/lib/cron-auth";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now   = new Date();
  const weeks = [mondayOf(now), nextMondayOf(now)];

  // Only athletes who have actually trained get a plan (avoids burning tokens
  // on dormant accounts).
  const { data: activeUsers } = await admin
    .from("runs")
    .select("user_id")
    .gte("date", new Date(now.getTime() - 60 * 86400000).toISOString().slice(0, 10))
    .is("deleted_at", null);

  const userIds: string[] = Array.from(
    new Set(((activeUsers ?? []) as Array<{ user_id: string }>).map(r => r.user_id)),
  );
  const results: Record<string, string> = {};

  for (const userId of userIds) {
    const perWeek: string[] = [];
    for (const week of weeks) {
      try {
        const res = await ensureWeeklyPlan(admin, userId, week);
        perWeek.push(`${week}:${res.plan ? (res.cached ? "cached" : "generated") : "failed"}`);
      } catch (err) {
        perWeek.push(`${week}:error(${err instanceof Error ? err.message : "unknown"})`);
      }
    }
    results[userId] = perWeek.join(" ");
  }

  return NextResponse.json({ ok: true, ran_at: now.toISOString(), weeks, users: userIds.length, results });
}
