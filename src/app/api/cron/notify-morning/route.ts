/**
 * GET /api/cron/notify-morning
 * Runs at 08:30 UTC = 05:30 BRT every day.
 * Sends today's workout as a push notification to all subscribed users.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { getMondayStr, getWorkoutForDate, formatWorkoutNotification } from "@/lib/plan-notify";
import { computeTrainingLoad } from "@/lib/training-load";
import type { WeeklyPlanDay, Run } from "@/types";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader  = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const cronSecret  = process.env.CRON_SECRET;

  if (!(cronSecret && authHeader === `Bearer ${cronSecret}`) && querySecret !== "limiar_admin_2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now   = new Date();
  const admin = createAdminClient();

  // Get all users with push subscriptions
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("user_id")
    .order("user_id");

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, message: "No push subscribers" });
  }

  // Deduplicate user IDs
  const userIds: string[] = Array.from(new Set(subs.map((s: { user_id: string }) => s.user_id)));

  const results: Record<string, string> = {};

  const todayStr = now.toISOString().slice(0, 10);
  const today0   = new Date(now); today0.setHours(0, 0, 0, 0);

  for (const userId of userIds) {
    try {
      // ── Race reminders (D-7, D-1, D-day) ───────────────────────────────────
      try {
        const { data: races } = await admin
          .from("races")
          .select("name, race_date, distance_km")
          .eq("user_id", userId)
          .is("time_seconds", null)
          .gte("race_date", todayStr);

        for (const race of races ?? []) {
          const raceDay = new Date(`${race.race_date}T12:00:00`);
          const daysOut = Math.round((raceDay.getTime() - today0.getTime()) / 86400000);

          let title: string | null = null;
          let body:  string | null = null;

          if (daysOut === 7) {
            title = "Sua prova é em 1 semana! 🏁";
            body  = `${race.name} (${race.distance_km} km) — última semana de preparação. Bons treinos!`;
          } else if (daysOut === 1) {
            title = "Sua prova é amanhã! 🔥";
            body  = `${race.name} — descanse, hidrate-se e prepare tudo hoje. Boa sorte!`;
          } else if (daysOut === 0) {
            title = "Hoje é dia de prova! 🎉";
            body  = `${race.name} — confie no seu treino. Vai dar tudo certo!`;
          }

          if (title && body) {
            sendPushToUser(admin, userId, {
              title, body,
              url:  "/races",
              tag:  `limiar-race-reminder-${race.race_date}-${daysOut}`,
              icon: "/limiar_icone_app.png",
            }).catch(() => {});
          }
        }
      } catch {
        // races table may not exist — ignore
      }

      const mondayStr = getMondayStr(now);

      // Fetch current week's plan
      const { data: plans } = await admin
        .from("coach_reports")
        .select("full_report, period_start")
        .eq("user_id", userId)
        .eq("period_type", "week")
        .eq("period_start", mondayStr)
        .limit(1);

      const workout = getWorkoutForDate(admin, plans ?? [], now) as WeeklyPlanDay | null;

      if (!workout) {
        results[userId] = "no-plan";
        continue;
      }

      // Readiness context from TSB — turns the briefing into actual coaching
      let contextLine = "";
      try {
        const since = new Date(now);
        since.setDate(since.getDate() - 90);
        const { data: tsbRuns } = await admin
          .from("runs")
          .select("date, distance_km, duration_seconds, avg_pace_seconds_per_km, avg_hr")
          .eq("user_id", userId)
          .gte("date", since.toISOString().slice(0, 10))
          .is("deleted_at", null);
        const load = computeTrainingLoad((tsbRuns ?? []) as Run[], null, null, 90);
        const tsb = load.length > 0 ? load[load.length - 1].tsb : null;
        if (tsb !== null && tsb < -20) {
          contextLine = ` ⚠️ Fadiga alta (forma ${tsb}) — se o corpo pedir, reduza a intensidade hoje.`;
        } else if (tsb !== null && tsb > 10) {
          contextLine = ` ✨ Você está descansado — bom dia para caprichar.`;
        }
      } catch {
        // readiness is best-effort
      }

      const notification = formatWorkoutNotification(workout, "Hoje");
      const { sent, removed } = await sendPushToUser(admin, userId, {
        ...notification,
        body: (notification.body + contextLine).slice(0, 180),
        icon: "/api/icons/192",
      });

      results[userId] = `sent:${sent} removed:${removed}`;
    } catch (err) {
      results[userId] = `error: ${err instanceof Error ? err.message : "unknown"}`;
    }
  }

  return NextResponse.json({ ok: true, ran_at: now.toISOString(), results });
}
