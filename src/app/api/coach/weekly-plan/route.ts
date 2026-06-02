/**
 * POST /api/coach/weekly-plan
 * Gera um plano semanal estruturado (JSON 7 dias) e salva como coach_report.
 * Body: { paces?: { easy, threshold, long, interval } }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generateStructuredWeeklyPlan } from "@/lib/ai";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const paces = body?.paces ?? null;

  const admin = createAdminClient();

  // Current week bounds (Monday–Sunday)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  // Recent runs (last 30 for AI context)
  const { data: recentRuns } = await admin
    .from("runs")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .limit(30);

  // Next upcoming race (graceful fallback if table doesn't exist)
  let nextRace = null;
  try {
    const todayStr = now.toISOString().slice(0, 10);
    const { data: raceData } = await admin
      .from("races")
      .select("name, race_date, distance_km")
      .eq("user_id", user.id)
      .gt("race_date", todayStr)
      .is("time_seconds", null)
      .order("race_date", { ascending: true })
      .limit(1);
    if (raceData?.[0]) {
      nextRace = {
        name: raceData[0].name as string,
        date: raceData[0].race_date as string,
        distance_km: raceData[0].distance_km as number,
      };
    }
  } catch { /* races table may not exist yet */ }

  // Latest VDOT (graceful fallback)
  let vdot: number | null = null;
  try {
    const { data: testData } = await admin
      .from("performance_tests")
      .select("vdot")
      .eq("user_id", user.id)
      .order("test_date", { ascending: false })
      .limit(1);
    vdot = (testData?.[0]?.vdot as number | null) ?? null;
  } catch { /* performance_tests table may not exist yet */ }

  const plan = await generateStructuredWeeklyPlan(
    weekStartStr,
    recentRuns ?? [],
    paces,
    nextRace,
    vdot,
  );

  if (!plan) {
    return NextResponse.json({ error: "AI generation failed" }, { status: 422 });
  }

  // Save as coach_report — full_report holds the JSON plan
  const trainingDays = plan.days.filter(d => d.type !== "rest").length;
  const { data: report, error } = await admin
    .from("coach_reports")
    .insert({
      user_id:      user.id,
      title:        `Plano da semana — ${weekStartStr}`,
      report_date:  new Date().toISOString().slice(0, 10),
      period_type:  "week",
      period_start: weekStartStr,
      period_end:   weekEndStr,
      summary:      plan.ai_message ?? `${trainingDays} treinos planejados`,
      full_report:  JSON.stringify(plan),
    })
    .select("*")
    .single();

  if (error) {
    console.error("[weekly-plan] DB insert error:", error);
    return NextResponse.json({ plan, saved: false });
  }

  return NextResponse.json({ plan, saved: true, report });
}
