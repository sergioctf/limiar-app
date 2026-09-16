/**
 * POST /api/coach/weekly-plan/move  { week, from, to, session }
 *
 * Move one session to another day, this week only.
 *
 * Deliberately separate from the training preferences: the run was in the
 * morning, the athlete slept through it and did the afternoon lifting instead,
 * and wants the run on Tuesday. That is not a change of routine — next week
 * should look exactly as it did. Writing to `training_prefs` here would turn
 * one bad morning into a permanent rescheduling.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { applyPlanEdits } from "@/lib/plan-edit";
import { loadWeeklyPlan, mondayOf, nextMondayOf, previousMondayOf } from "@/lib/weekly-plan";
import type { WeeklyPlanDay } from "@/types";

const DAYS: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const from = body?.from as WeeklyPlanDay["day"] | undefined;
  const to   = body?.to   as WeeklyPlanDay["day"] | undefined;
  const session = body?.session === "musculacao" ? "musculacao" : "corrida";

  if (!from || !to || !DAYS.includes(from) || !DAYS.includes(to) || from === to) {
    return NextResponse.json({ error: "Dias inválidos." }, { status: 400 });
  }

  const now = new Date();
  const week = typeof body?.week === "string" ? body.week : mondayOf(now);
  if (![previousMondayOf(now), mondayOf(now), nextMondayOf(now)].includes(week)) {
    return NextResponse.json({ error: "Semana inválida" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { plan, reportId } = await loadWeeklyPlan(admin, user.id, week);
  if (!plan || !reportId) {
    return NextResponse.json({ error: "Plano não encontrado para esta semana." }, { status: 404 });
  }

  const { plan: moved, changes, rejected } = applyPlanEdits(plan, [
    { kind: "move_session", from, to, session },
  ]);

  if (changes.length === 0) {
    return NextResponse.json(
      { error: rejected[0] ?? "Não foi possível mover esse treino." },
      { status: 400 },
    );
  }

  // Confirm the write landed — an UPDATE matching no row returns no error.
  const { data: written, error } = await admin
    .from("coach_reports")
    .update({ full_report: JSON.stringify(moved), updated_at: new Date().toISOString() })
    .eq("id", reportId).eq("user_id", user.id)
    .select("id");

  if (error || !written || written.length === 0) {
    return NextResponse.json({ error: "Não foi possível salvar a mudança." }, { status: 500 });
  }

  return NextResponse.json({ plan: moved, changes });
}
