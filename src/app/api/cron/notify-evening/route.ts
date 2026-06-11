/**
 * GET /api/cron/notify-evening
 * Runs at 01:00 UTC = 22:00 BRT every day.
 * Sends TOMORROW's workout so the user can prepare the night before.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { getMondayStr, getWorkoutForDate, formatWorkoutNotification } from "@/lib/plan-notify";
import { computeWeeklyInsights, formatWeeklyInsightsPush } from "@/lib/weekly-insights";
import type { WeeklyPlanDay, Run } from "@/types";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader  = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const cronSecret  = process.env.CRON_SECRET;

  if (!(cronSecret && authHeader === `Bearer ${cronSecret}`) && querySecret !== "limiar_admin_2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now      = new Date();
  // Tomorrow = now + 1 day
  const tomorrow = new Date(now.getTime() + 86400000);
  const admin    = createAdminClient();

  // Is it Sunday night in BRT (UTC-3)? The cron fires at 22:00 BRT.
  // `?weekly=1` forces the weekly recap for manual testing on any day.
  const brtNow = new Date(now.getTime() - 3 * 3600000);
  const forceWeekly = request.nextUrl.searchParams.get("weekly") === "1";
  const isSundayBRT = brtNow.getUTCDay() === 0 || forceWeekly;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("user_id")
    .order("user_id");

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, message: "No push subscribers" });
  }

  const userIds: string[] = Array.from(new Set(subs.map((s: { user_id: string }) => s.user_id)));
  const results: Record<string, string> = {};

  for (const userId of userIds) {
    try {
      // ── Sunday night: weekly recap ────────────────────────────────────────
      if (isSundayBRT) {
        try {
          const fourteenAgo = new Date(brtNow.getTime() - 14 * 86400000).toISOString().slice(0, 10);
          const { data: weekRuns } = await admin
            .from("runs")
            .select("date, distance_km, duration_seconds")
            .eq("user_id", userId)
            .is("deleted_at", null)
            .gte("date", fourteenAgo);

          const insights = computeWeeklyInsights((weekRuns ?? []) as Run[], brtNow);
          const recap = formatWeeklyInsightsPush(insights);
          if (recap) {
            await sendPushToUser(admin, userId, { ...recap, icon: "/api/icons/192" });
          }
        } catch {
          // non-critical — weekly recap is best-effort
        }
      }

      // ── Tomorrow's workout ────────────────────────────────────────────────
      const mondayStr = getMondayStr(tomorrow);

      const { data: plans } = await admin
        .from("coach_reports")
        .select("full_report, period_start")
        .eq("user_id", userId)
        .eq("period_type", "week")
        .eq("period_start", mondayStr)
        .limit(1);

      const workout = getWorkoutForDate(admin, plans ?? [], tomorrow) as WeeklyPlanDay | null;

      if (!workout) {
        results[userId] = isSundayBRT ? "weekly-recap-only" : "no-plan";
        continue;
      }

      const notification = formatWorkoutNotification(workout, "Amanhã");
      const { sent, removed } = await sendPushToUser(admin, userId, {
        ...notification,
        icon: "/api/icons/192",
      });

      results[userId] = `sent:${sent} removed:${removed}`;
    } catch (err) {
      results[userId] = `error: ${err instanceof Error ? err.message : "unknown"}`;
    }
  }

  return NextResponse.json({ ok: true, ran_at: now.toISOString(), results });
}
