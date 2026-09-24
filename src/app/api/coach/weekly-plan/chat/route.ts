/**
 * POST /api/coach/weekly-plan/chat — conversar sobre a semana.
 *
 * Duas chamadas, e a diferença entre elas é a Fase 3 inteira:
 *
 *   { message, currentPlan }      → **propõe**: traduz o pedido em edições
 *                                   estruturadas, calcula o que mudaria e
 *                                   devolve. Nada é salvo.
 *   { apply: true, edits, week }  → **aplica**: refaz as edições sobre o plano
 *                                   como ele está agora, e salva.
 *
 * Até 24/09 havia uma chamada só, que aplicava direto. O modelo nunca escreveu
 * o plano — ele escolhe de um vocabulário fixo (`plan-edit.ts`) e o motor
 * aplica —, mas o atleta descobria a mudança depois de feita. A ADR-05 diz o
 * contrário: propõe, ele confirma.
 *
 * No aplicar, o servidor **não confia no plano que o navegador mostrou**: ele
 * carrega o plano salvo e reaplica as edições ali. O que entra no banco é o que
 * o motor produz a partir do estado real, não o que passou pela rede.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { processPlanFeedback, extractAthleteNotes } from "@/lib/ai";
import { normalizePlanEdits, applyPlanEdits } from "@/lib/plan-edit";
import { noteExpiry, stillValidFilter, weekStartsAt } from "@/lib/athlete-notes";
import type { WeeklyPlanData, PlanChatMessage } from "@/types";

/** Builds an athlete profile string from DB notes */
async function loadAthleteProfile(
  admin: ReturnType<typeof createAdminClient>, userId: string,
  /** A semana da conversa: vale o que valia para ela. */
  weekStart: string | null,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("athlete_notes")
      .select("category, content")
      .eq("user_id", userId)
      .eq("active", true)
      .or(stillValidFilter(weekStart ? weekStartsAt(weekStart) : new Date()))
      .order("created_at", { ascending: false })
      .limit(30);

    if (!data || data.length === 0) return null;

    return data.map((n: { category: string; content: string }) => `[${n.category}] ${n.content}`).join("\n");
  } catch {
    return null;
  }
}

/** O plano guardado para aquela semana — a única versão em que se confia. */
async function loadStoredPlan(
  admin: ReturnType<typeof createAdminClient>, userId: string, weekStart: string,
): Promise<{ id: string; plan: WeeklyPlanData } | null> {
  const { data } = await admin
    .from("coach_reports").select("id, full_report")
    .eq("user_id", userId).eq("period_type", "week").eq("period_start", weekStart)
    .limit(1);
  const row = data?.[0];
  if (!row?.full_report) return null;
  try {
    const plan = JSON.parse(row.full_report as string) as WeeklyPlanData;
    return Array.isArray(plan.days) ? { id: row.id as string, plan } : null;
  } catch { return null; }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const admin = createAdminClient();

  // ── Aplicar o que foi proposto e confirmado ───────────────────────────────
  if (body?.apply === true) {
    const week = typeof body.week === "string" ? body.week : null;
    const edits = normalizePlanEdits(body.edits);
    if (!week || edits.length === 0) {
      return NextResponse.json({ error: "Nada para aplicar." }, { status: 400 });
    }

    const stored = await loadStoredPlan(admin, user.id, week);
    if (!stored) return NextResponse.json({ error: "Plano desta semana não encontrado." }, { status: 404 });

    const { plan, changes, rejected } = applyPlanEdits(stored.plan, edits);
    if (changes.length === 0) {
      return NextResponse.json({
        applied: false,
        assistantMessage:
          `O plano mudou desde a proposta e não há mais o que aplicar.${rejected.length ? ` ${rejected.join(" ")}` : ""}`,
      });
    }

    const { data: written, error } = await admin.from("coach_reports")
      .update({ full_report: JSON.stringify(plan), updated_at: new Date().toISOString() })
      .eq("id", stored.id).eq("user_id", user.id).select("id");

    if (error || !written?.length) {
      return NextResponse.json({
        applied: false,
        assistantMessage: "Não consegui salvar a mudança. Recarregue a página e tente de novo.",
      });
    }

    return NextResponse.json({
      applied: true,
      updatedPlan: plan,
      changes,
      rejected,
      assistantMessage: `Feito:\n${changes.map(c => `• ${c}`).join("\n")}`,
    });
  }

  // ── Propor ────────────────────────────────────────────────────────────────
  if (!body?.message || !body?.currentPlan) {
    return NextResponse.json({ error: "Missing message or currentPlan" }, { status: 400 });
  }

  const currentPlan = body.currentPlan as WeeklyPlanData;
  const reportId = body.reportId as string | undefined;
  const athleteProfile = await loadAthleteProfile(admin, user.id, currentPlan?.week_start ?? null);

  const { data: recentRuns } = await admin
    .from("runs").select("*")
    .eq("user_id", user.id).is("deleted_at", null)
    .order("date", { ascending: false }).limit(10);

  const result = await processPlanFeedback(
    body.message as string,
    currentPlan,
    (body.chatHistory ?? []) as PlanChatMessage[],
    recentRuns ?? [],
    athleteProfile,
  );

  if (!result) {
    return NextResponse.json({ error: "AI processing failed" }, { status: 422 });
  }

  try {
    await admin.from("coach_chat_messages").insert([
      { user_id: user.id, report_id: reportId ?? null, role: "user", content: body.message as string },
      { user_id: user.id, report_id: reportId ?? null, role: "assistant", content: result.assistantMessage },
    ]);
  } catch {
    // Não crítico — a conversa vale mesmo sem o registro.
  }

  /*
   * A memória guarda o que ele disse, não o que vai ser aplicado: agenda e
   * preferência ditas aqui valem só para a semana desta conversa.
   */
  const chatWeek = currentPlan?.week_start ?? null;
  extractAthleteNotes(body.message as string, result.assistantMessage)
    .then(async (notes) => {
      if (notes.length === 0) return;
      try {
        await admin.from("athlete_notes").insert(
          notes.map(n => ({
            user_id: user.id, category: n.category, content: n.content,
            source: "chat", active: true, expires_at: noteExpiry(n.category, chatWeek),
          })),
        );
      } catch { /* tabela ausente num projeto antigo */ }
    })
    .catch(() => {});

  /*
   * A proposta volta sem nada gravado. `edits` são as edições já normalizadas —
   * é isso que o app devolve no "Aplicar", para o servidor refazer a conta
   * sobre o plano guardado.
   */
  return NextResponse.json({
    assistantMessage: result.assistantMessage,
    edits: result.edits,
    changes: result.changes,
    rejected: result.rejected,
    preview: result.updatedPlan,
  });
}
