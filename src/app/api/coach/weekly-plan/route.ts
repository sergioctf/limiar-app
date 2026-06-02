/**
 * POST /api/coach/weekly-plan
 * Body: { paces?, force? }
 *
 * - Se já existe plano para esta semana E force !== true → retorna plano salvo (sem gastar tokens)
 * - Se force === true OU não há plano → gera novo plano com AI
 * - Upsert: atualiza o report existente da semana (ou cria se não existir)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generateStructuredWeeklyPlan } from "@/lib/ai";
import type { WeeklyPlanData } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const paces      = body?.paces ?? null;
  const forceRegen = body?.force === true;

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

  // ── Check for existing plan this week ──────────────────────────────────────
  if (!forceRegen) {
    const { data: existing } = await admin
      .from("coach_reports")
      .select("id, full_report")
      .eq("user_id", user.id)
      .eq("period_type", "week")
      .eq("period_start", weekStartStr)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existing?.full_report) {
      try {
        const cachedPlan = JSON.parse(existing.full_report) as WeeklyPlanData;
        // Validate it has days array (it's a structured plan, not old text format)
        if (Array.isArray(cachedPlan.days) && cachedPlan.days.length > 0) {
          return NextResponse.json({ plan: cachedPlan, saved: true, cached: true, reportId: existing.id });
        }
      } catch { /* invalid JSON — fall through to regenerate */ }
    }
  }

  // ── Generate new plan with AI ──────────────────────────────────────────────

  // Recent runs (last 30 for AI context)
  const { data: recentRuns } = await admin
    .from("runs")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .limit(30);

  // Next upcoming race (graceful fallback)
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
        name:        raceData[0].name as string,
        date:        raceData[0].race_date as string,
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
  } catch { /* table may not exist yet */ }

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

  // ── Upsert: update existing report or insert new one ──────────────────────
  const trainingDays = plan.days.filter(d => d.type !== "rest").length;
  const reportPayload = {
    user_id:      user.id,
    title:        `Plano da semana — ${weekStartStr}`,
    report_date:  new Date().toISOString().slice(0, 10),
    period_type:  "week",
    period_start: weekStartStr,
    period_end:   weekEndStr,
    summary:      plan.ai_message ?? `${trainingDays} treinos planejados`,
    full_report:  JSON.stringify(plan),
    updated_at:   new Date().toISOString(),
  };

  // Try to find and update existing report for this week first
  const { data: existingForUpdate } = await admin
    .from("coach_reports")
    .select("id")
    .eq("user_id", user.id)
    .eq("period_type", "week")
    .eq("period_start", weekStartStr)
    .limit(1)
    .single();

  let reportId: string | null = null;
  if (existingForUpdate?.id) {
    await admin
      .from("coach_reports")
      .update(reportPayload)
      .eq("id", existingForUpdate.id);
    reportId = existingForUpdate.id;
  } else {
    const { data: newReport } = await admin
      .from("coach_reports")
      .insert(reportPayload)
      .select("id")
      .single();
    reportId = newReport?.id ?? null;
  }

  return NextResponse.json({ plan, saved: true, cached: false, reportId });
}
