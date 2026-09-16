/**
 * POST /api/coach/today-swap { action: "easy" | "tomorrow" | "undo" }
 *
 * The athlete's own call on today's session. The server does not require low
 * readiness — the athlete decides, and may know something no sensor does — but
 * it refuses a move that would stack two hard days, and it never touches a day
 * other than today and, for a move, tomorrow.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { applySwap, undoSwap, dayKeyOf, type SwapKind } from "@/lib/session-swap";
import { loadRecoveryInputs } from "@/lib/recovery-load";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as { action?: string } | null;
  const action = body?.action;
  if (action !== "easy" && action !== "tomorrow" && action !== "undo") {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const admin = createAdminClient();
  const inputs = await loadRecoveryInputs(admin, user.id);
  if (!inputs.plan || !inputs.planReportId) {
    return NextResponse.json({ error: "Nenhum plano para esta semana." }, { status: 404 });
  }

  const todayKey = dayKeyOf(inputs.today);

  if (action !== "undo" && inputs.recovery.sessionDone) {
    return NextResponse.json({ error: "O treino de hoje já foi feito." }, { status: 409 });
  }

  const r = inputs.recovery;
  const reason = r.score != null ? `Recuperação ${r.score}/100` : "Escolha do atleta";
  const result = action === "undo"
    ? undoSwap(inputs.plan, todayKey)
    : applySwap(inputs.plan, todayKey, action as SwapKind, reason);

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });

  const { error } = await admin.from("coach_reports")
    .update({ full_report: JSON.stringify(result.plan) })
    .eq("id", inputs.planReportId).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Não foi possível salvar a troca." }, { status: 500 });

  // The coach inbox's older readiness proposal for today is settled by this —
  // leaving it pending would offer the same decision twice.
  await admin.from("plan_suggestions")
    .update({ status: action === "undo" ? "dismissed" : "accepted" })
    .eq("user_id", user.id).eq("date", inputs.today).eq("status", "pending")
    .then(() => {}, () => {});

  const today = result.plan.days.find(d => d.day === todayKey) ?? null;
  return NextResponse.json({ ok: true, action, today });
}
