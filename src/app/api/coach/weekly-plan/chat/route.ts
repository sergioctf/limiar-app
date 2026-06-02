/**
 * POST /api/coach/weekly-plan/chat
 * Processa feedback do atleta sobre o plano semanal e retorna plano atualizado ou resposta.
 * Body: { message: string, currentPlan: WeeklyPlanData, chatHistory: PlanChatMessage[] }
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

  return NextResponse.json(result);
}
