/**
 * POST /api/coach/weekly-plan
 * Gera um resumo semanal IA e salva como coach_report.
 * Requer autenticação.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generateWeeklySummary } from "@/lib/ai";

export async function POST(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Current week bounds (Monday to Sunday)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEndStr   = weekEnd.toISOString().slice(0, 10);

  // Fetch this week's runs
  const { data: weekRuns } = await admin
    .from("runs")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .gte("date", weekStartStr)
    .lte("date", weekEndStr)
    .order("date", { ascending: true });

  // Fetch recent context (last 4 weeks)
  const fourWeeksAgo = new Date(weekStart);
  fourWeeksAgo.setDate(weekStart.getDate() - 28);
  const { data: recentRuns } = await admin
    .from("runs")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .gte("date", fourWeeksAgo.toISOString().slice(0, 10))
    .lt("date", weekStartStr)
    .order("date", { ascending: false })
    .limit(20);

  // Fetch next goal for context
  const { data: goals } = await admin
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["active", "upcoming"])
    .order("race_date", { ascending: true })
    .limit(1);

  const nextGoal = goals?.[0] ?? null;
  let weeksToGoal: number | undefined;
  if (nextGoal?.race_date) {
    const msToRace = new Date(nextGoal.race_date).getTime() - Date.now();
    weeksToGoal = Math.max(0, Math.round(msToRace / (7 * 24 * 60 * 60 * 1000)));
  }

  const summary = await generateWeeklySummary(
    weekRuns ?? [],
    recentRuns ?? [],
    nextGoal?.race_name,
    weeksToGoal
  );

  if (!summary) {
    return NextResponse.json({ error: "AI generation failed or no runs this week" }, { status: 422 });
  }

  // Save as coach_report
  const { data: report, error } = await admin
    .from("coach_reports")
    .insert({
      user_id:      user.id,
      title:        `Resumo da semana — ${weekStartStr}`,
      report_date:  new Date().toISOString().slice(0, 10),
      period_type:  "week",
      period_start: weekStartStr,
      period_end:   weekEndStr,
      summary,
      full_report:  summary,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[weekly-plan] DB insert error:", error);
    // Still return the summary even if save failed
    return NextResponse.json({ summary, saved: false });
  }

  return NextResponse.json({ summary, saved: true, report });
}
