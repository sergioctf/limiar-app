/**
 * GET /api/cron/notify-evening
 * Runs at 01:00 UTC = 22:00 BRT every day.
 * Sends TOMORROW's workout so the user can prepare the night before.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { wantsNotification } from "@/lib/notification-prefs";
import {
  getMondayStr, getWorkoutForDate, formatWorkoutNotification, toBrt, brtDateIn,
} from "@/lib/plan-notify";
import { computeWeeklyInsights, formatWeeklyInsightsPush } from "@/lib/weekly-insights";
import type { WeeklyPlanDay, Run } from "@/types";
import { authorizeCron } from "@/lib/cron-auth";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now   = new Date();
  const admin = createAdminClient();

  // The cron fires at 01:00 UTC = 22:00 BRT of the PREVIOUS day, so every date
  // decision has to be made on the athlete's calendar, not UTC. Deriving
  // "tomorrow" from UTC here used to skip a day and announce the wrong workout.
  const brtNow      = toBrt(now);
  const brtTomorrow = brtDateIn(1, now);

  // `?weekly=1` forces the weekly recap for manual testing on any day.
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

  /*
   * Who opted out of this particular notification.
   *
   * Granting push permission is one decision; wanting every kind of message the
   * app sends is another. Someone who wants the 05:30 workout but not the
   * evening preview used to have to revoke the permission and lose both.
   *
   * Read once for the whole batch rather than once per athlete.
   */
  const { data: prefRows } = await admin
    .from("profiles").select("id, notification_prefs").in("id", userIds);
  const optedOut = new Set(
    ((prefRows ?? []) as Array<{ id: string; notification_prefs: unknown }>)
      .filter(r => !wantsNotification(r.notification_prefs, "tomorrowWorkout"))
      .map(r => r.id),
  );


  for (const userId of userIds) {
    if (optedOut.has(userId)) { results[userId] = "opted-out"; continue; }

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
      const mondayStr = getMondayStr(brtTomorrow);

      const { data: plans } = await admin
        .from("coach_reports")
        .select("full_report, period_start")
        .eq("user_id", userId)
        .eq("period_type", "week")
        .eq("period_start", mondayStr)
        .limit(1);

      const workout = getWorkoutForDate(admin, plans ?? [], brtTomorrow) as WeeklyPlanDay | null;

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
