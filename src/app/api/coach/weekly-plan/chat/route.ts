/**
 * POST /api/coach/weekly-plan/chat
 * Processa feedback do atleta sobre o plano semanal.
 * Quando o AI atualiza o plano, persiste automaticamente no DB.
 * Body: { message, currentPlan, chatHistory, reportId? }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { processPlanFeedback } from "@/lib/ai";
import type { WeeklyPlanData, PlanChatMessage } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.message || !body?.currentPlan) {
    return NextResponse.json({ error: "Missing message or currentPlan" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Recent runs for AI context
  const { data: recentRuns } = await admin
    .from("runs")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .limit(10);

  const result = await processPlanFeedback(
    body.message as string,
    body.currentPlan as WeeklyPlanData,
    (body.chatHistory ?? []) as PlanChatMessage[],
    recentRuns ?? [],
  );

  if (!result) {
    return NextResponse.json({ error: "AI processing failed" }, { status: 422 });
  }

  // If AI updated the plan, persist it in the DB immediately
  if (result.updatedPlan) {
    const reportId = body.reportId as string | undefined;
    const weekStart = (result.updatedPlan as WeeklyPlanData).week_start;
    const updatedJson = JSON.stringify(result.updatedPlan);

    if (reportId) {
      // Update the specific report we know about
      await admin
        .from("coach_reports")
        .update({ full_report: updatedJson, updated_at: new Date().toISOString() })
        .eq("id", reportId)
        .eq("user_id", user.id);
    } else if (weekStart) {
      // Fallback: find by week_start
      await admin
        .from("coach_reports")
        .update({ full_report: updatedJson, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("period_type", "week")
        .eq("period_start", weekStart);
    }
  }

  return NextResponse.json(result);
}
