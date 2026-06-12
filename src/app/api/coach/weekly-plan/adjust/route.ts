/**
 * POST /api/coach/weekly-plan/adjust
 * Proactive coach: when the athlete deviated from the plan (missed/partial
 * workouts) or TSB is dangerously low, the AI replans the REMAINING days of
 * the current week. Past days are preserved untouched.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { adjustWeeklyPlanProactive } from "@/lib/ai";
import { computeWeekAdherence } from "@/lib/plan-adherence";
import { computeTrainingLoad } from "@/lib/training-load";
import { getMondayStr } from "@/lib/plan-notify";
import type { WeeklyPlanData, WeeklyPlanDay, Run } from "@/types";

export const maxDuration = 60;

const DAY_KEYS: WeeklyPlanDay["day"][] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const mondayStr = getMondayStr(now);

  // Current week plan
  const { data: reports } = await admin
    .from("coach_reports")
    .select("id, full_report")
    .eq("user_id", user.id)
    .eq("period_type", "week")
    .eq("period_start", mondayStr)
    .limit(1);

  const report = reports?.[0];
  if (!report?.full_report) {
    return NextResponse.json({ error: "Nenhum plano para esta semana" }, { status: 404 });
  }

  let plan: WeeklyPlanData;
  try {
    plan = JSON.parse(report.full_report) as WeeklyPlanData;
  } catch {
    return NextResponse.json({ error: "Plano corrompido" }, { status: 500 });
  }

  // Runs (90d for TSB) + this week's activities for adherence
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const [{ data: runs }, { data: activities }] = await Promise.all([
    admin
      .from("runs")
      .select("date, distance_km, duration_seconds, avg_pace_seconds_per_km, avg_hr, type")
      .eq("user_id", user.id)
      .gte("date", since.toISOString().slice(0, 10))
      .is("deleted_at", null),
    admin
      .from("activities")
      .select("date, sport_type")
      .eq("user_id", user.id)
      .gte("date", mondayStr)
      .is("deleted_at", null),
  ]);

  const runRows = (runs ?? []) as Array<{ date: string; distance_km: number; duration_seconds: number }>;

  const adherence = computeWeekAdherence(
    mondayStr,
    plan,
    runRows,
    (activities ?? []) as Array<{ date: string; sport_type: string }>,
  );
  if (!adherence) {
    return NextResponse.json({ error: "Plano sem dias válidos" }, { status: 500 });
  }

  // TSB from training load (no test data needed — pace fallback inside)
  let tsb: number | null = null;
  try {
    const load = computeTrainingLoad(runRows as unknown as Run[], null, null, 90);
    tsb = load.length > 0 ? load[load.length - 1].tsb : null;
  } catch {
    tsb = null;
  }

  const STATUS_PT: Record<string, string> = {
    done: "✓ feito", partial: "~ parcial", missed: "✗ PERDIDO",
    rest_ok: "descanso ok", extra: "treino extra", upcoming: "ainda por vir",
  };
  const adherenceSummary = adherence.days
    .map(d => `${d.day} (${d.dayPt}): planejado "${d.planned.label}"${d.planned.distance_km ? ` ${d.planned.distance_km}km` : ""} → ${STATUS_PT[d.status]}${d.actualKm > 0 ? ` (${d.actualKm}km feitos)` : ""}`)
    .join("\n");

  // Anything to fix? (missed/partial so far, or high fatigue)
  const needsAdjust = adherence.missedCount > 0 || adherence.partialCount > 0 || (tsb !== null && tsb < -20);
  if (!needsAdjust) {
    return NextResponse.json({ adjusted: false, message: "Semana dentro do planejado — nenhum ajuste necessário." });
  }

  const todayKey = DAY_KEYS[now.getDay()];
  const result = await adjustWeeklyPlanProactive(plan, adherenceSummary, tsb, todayKey);
  if (!result) {
    return NextResponse.json({ error: "IA indisponível no momento — tente novamente." }, { status: 502 });
  }

  // Persist the adjusted plan in the same report row
  const { error: saveError } = await admin
    .from("coach_reports")
    .update({ full_report: JSON.stringify(result.plan) })
    .eq("id", report.id);

  if (saveError) {
    return NextResponse.json({ error: "Falha ao salvar o plano ajustado" }, { status: 500 });
  }

  return NextResponse.json({ adjusted: true, message: result.message, plan: result.plan });
}
