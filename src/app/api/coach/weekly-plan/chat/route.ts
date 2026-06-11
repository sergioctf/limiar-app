/**
 * POST /api/coach/weekly-plan/chat
 * Processa feedback do atleta sobre o plano semanal.
 *
 * Fase 3 — Coach Memory:
 * 1. Carrega perfil do atleta (athlete_notes) como contexto para a IA
 * 2. Salva mensagens em coach_chat_messages
 * 3. Extrai novas notas da conversa e salva em athlete_notes
 * 4. Persiste plano atualizado em coach_reports (como antes)
 *
 * Body: { message, currentPlan, chatHistory, reportId? }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { processPlanFeedback, extractAthleteNotes } from "@/lib/ai";
import type { WeeklyPlanData, PlanChatMessage } from "@/types";

/** Builds an athlete profile string from DB notes */
async function loadAthleteProfile(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string | null> {
  try {
    const { data } = await admin
      .from("athlete_notes")
      .select("category, content")
      .eq("user_id", userId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!data || data.length === 0) return null;

    const lines = data.map((n: { category: string; content: string }) =>
      `[${n.category}] ${n.content}`
    );
    return lines.join("\n");
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.message || !body?.currentPlan) {
    return NextResponse.json({ error: "Missing message or currentPlan" }, { status: 400 });
  }

  const admin = createAdminClient();
  const reportId = body.reportId as string | undefined;

  // ── 1. Load athlete profile for AI context ────────────────────────────────
  const athleteProfile = await loadAthleteProfile(admin, user.id);

  // ── 2. Recent runs for AI context ────────────────────────────────────────
  const { data: recentRuns } = await admin
    .from("runs")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .limit(10);

  // ── 3. Process with AI ───────────────────────────────────────────────────
  const result = await processPlanFeedback(
    body.message as string,
    body.currentPlan as WeeklyPlanData,
    (body.chatHistory ?? []) as PlanChatMessage[],
    recentRuns ?? [],
    athleteProfile,
  );

  if (!result) {
    return NextResponse.json({ error: "AI processing failed" }, { status: 422 });
  }

  // ── 4. Save messages to DB ────────────────────────────────────────────────
  try {
    await admin.from("coach_chat_messages").insert([
      {
        user_id:   user.id,
        report_id: reportId ?? null,
        role:      "user",
        content:   body.message as string,
      },
      {
        user_id:   user.id,
        report_id: reportId ?? null,
        role:      "assistant",
        content:   result.assistantMessage,
      },
    ]);
  } catch {
    // Non-critical — don't fail the request if messages table doesn't exist yet
  }

  // ── 5. Extract & save athlete notes asynchronously ───────────────────────
  // Fire-and-forget: don't await so we don't slow down the response
  extractAthleteNotes(body.message as string, result.assistantMessage)
    .then(async (notes) => {
      if (notes.length === 0) return;
      try {
        await admin.from("athlete_notes").insert(
          notes.map(n => ({
            user_id:  user.id,
            category: n.category,
            content:  n.content,
            source:   "chat",
            active:   true,
          }))
        );
      } catch {
        // Graceful fallback if table doesn't exist yet
      }
    })
    .catch(() => {});

  // ── 6. If AI updated the plan, persist it ────────────────────────────────
  if (result.updatedPlan) {
    const weekStart = (result.updatedPlan as WeeklyPlanData).week_start;
    const updatedJson = JSON.stringify(result.updatedPlan);

    if (reportId) {
      await admin
        .from("coach_reports")
        .update({ full_report: updatedJson, updated_at: new Date().toISOString() })
        .eq("id", reportId)
        .eq("user_id", user.id);
    } else if (weekStart) {
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
