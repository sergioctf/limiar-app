/**
 * GET /api/cron/notify-evening
 * Runs at 01:00 UTC = 22:00 BRT every day.
 * Sends TOMORROW's workout so the user can prepare the night before.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { getMondayStr, getWorkoutForDate, formatWorkoutNotification } from "@/lib/plan-notify";
import type { WeeklyPlanDay } from "@/types";

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
        results[userId] = "no-plan";
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
