/**
 * POST /api/coach/week-fit — "Minha agenda desta semana".
 *
 *   { action: "preview", week, days }  → how the week would look on those days, and why
 *   { action: "confirm", week, days }  → apply it (or, for a week not built yet, remember it)
 *   { action: "undo",    week }        → the week as it was, and the agenda forgotten
 *
 * The server recomputes the proposal on confirm instead of trusting the one the
 * browser showed: what lands in the plan is what the engine produces from the
 * plan as it is now. Only this week (from today on) and next week.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { fitWeek, undoFit, DAY_ORDER } from "@/lib/week-fit";
import { mondayOf } from "@/lib/weekly-plan";
import { normalizePrefs } from "@/lib/workout-builder";
import { dayKeyOf } from "@/lib/session-swap";
import { athleteDateStr } from "@/lib/week";
import { addDays } from "@/lib/health-view";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

export const dynamic = "force-dynamic";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

type DayKey = WeeklyPlanDay["day"];

function validDays(raw: unknown): DayKey[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 7) return null;
  const days = Array.from(new Set(raw));
  return days.every(d => DAY_ORDER.includes(d as DayKey)) ? days as DayKey[] : null;
}

export async function POST(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Entre novamente." }, 401);

  const body = await request.json().catch(() => null) as
    { action?: unknown; week?: unknown; days?: unknown; remember?: unknown } | null;
  const action = body?.action;
  if (action !== "preview" && action !== "confirm" && action !== "undo") return json({ error: "Pedido inválido." }, 400);

  const today = athleteDateStr();
  const thisMonday = mondayOf(new Date());
  const nextMonday = addDays(thisMonday, 7);
  const week = body?.week;
  if (week !== thisMonday && week !== nextMonday) return json({ error: "Só dá para organizar esta semana ou a próxima." }, 400);
  const days = action === "undo" ? [] : validDays(body?.days);
  if (action !== "undo" && !days) return json({ error: "Escolha ao menos um dia." }, 400);

  const admin = createAdminClient();
  const [{ data: rows }, { data: profile }, { data: todayRuns }] = await Promise.all([
    admin.from("coach_reports").select("id, full_report")
      .eq("user_id", user.id).eq("period_type", "week").eq("period_start", week).limit(1),
    admin.from("profiles").select("training_prefs").eq("id", user.id).maybeSingle(),
    admin.from("runs").select("id").eq("user_id", user.id).eq("date", today).is("deleted_at", null).limit(1),
  ]);
  const row = rows?.[0];
  let plan: WeeklyPlanData | null = null;
  try {
    const parsed = row?.full_report ? JSON.parse(row.full_report as string) as WeeklyPlanData : null;
    plan = parsed && Array.isArray(parsed.days) ? parsed : null;
  } catch { plan = null; }

  const current = week === thisMonday;
  const fromDay: DayKey = current ? dayKeyOf(today) : "Mon";
  const doneDays: DayKey[] = current && (todayRuns?.length ?? 0) > 0 ? [dayKeyOf(today)] : [];
  const longRunDay = normalizePrefs(profile?.training_prefs).longRunDay ?? null;

  const save = async (next: WeeklyPlanData) => {
    const { error } = await admin.from("coach_reports")
      .update({ full_report: JSON.stringify(next) }).eq("id", row!.id).eq("user_id", user.id);
    return !error;
  };

  if (action === "undo") {
    // Forgetting the agenda is part of undoing it: otherwise a regeneration would bring it back.
    await db.from("week_availability").delete().eq("user_id", user.id).eq("week_start", week);
    if (!plan || !row) return json({ ok: true, plan: null });
    const undone = undoFit(plan);
    if ("error" in undone) return json({ error: undone.error }, 409);
    if (!(await save(undone.plan))) return json({ error: "Não foi possível desfazer." }, 500);
    return json({ ok: true, plan: undone.plan });
  }

  // A week not built yet: the agenda is remembered, and the week is built on it.
  if (!plan || !row) {
    if (action === "preview") {
      return json({ noPlan: true, message: "A semana ainda não foi montada. Confirme e ela será montada nesses dias." });
    }
    const { error } = await db.from("week_availability")
      .upsert({ user_id: user.id, week_start: week, run_days: days }, { onConflict: "user_id,week_start" });
    if (error) return json({ error: "Não foi possível guardar a sua agenda." }, 500);
    return json({ ok: true, noPlan: true, message: "Guardado. A semana será montada nesses dias quando for gerada." });
  }

  const proposal = fitWeek(plan, { available: days!, fromDay, doneDays, longRunDay });
  if ("error" in proposal) return json({ error: proposal.error }, 409);

  if (action === "preview") {
    return json({
      proposal: {
        days: proposal.plan.days, explanation: proposal.explanation, unchanged: proposal.unchanged,
        beforeKm: proposal.beforeKm, afterKm: proposal.afterKm,
      },
    });
  }

  if (!(await save(proposal.plan))) return json({ error: "Não foi possível reorganizar a semana." }, 500);
  /*
   * A agenda só é guardada quando o atleta declarou uma.
   *
   * O ajuste depois de um treino perdido usa "os dias que sobraram" como
   * disponibilidade, e isso não é a agenda de ninguém — gravar aquilo como
   * "só consigo treinar nesses dias" seria colocar na boca dele uma frase que
   * ele não disse, e que voltaria na próxima geração da semana.
   */
  if (body?.remember !== false) {
    // Kept as planning data: what the week was built around, and what the coach can learn from.
    await db.from("week_availability")
      .upsert({ user_id: user.id, week_start: week, run_days: days }, { onConflict: "user_id,week_start" })
      .then(() => {}, () => {});
  }
  return json({ ok: true, plan: proposal.plan, explanation: proposal.explanation });
}
