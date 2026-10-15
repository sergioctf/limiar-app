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
import { AUTO_SPORTS, loadIcuConnection, pushIcuSession, removeIcuDay } from "@/lib/icu-push";
import { normalizePrefs } from "@/lib/workout-builder";
import { isoDateOfWeekDay } from "@/lib/week";
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

  /*
    O relógio acompanha a mudança.

    Mover a quarta para a sexta no app e deixar o treino antigo na quarta é o
    relógio apitando por um treino que já não existe — e dois treinos na semana
    onde só há um (Sérgio, 15/10). O dia de origem é limpo e o de destino
    recebe o treino.

    Melhor esforço, depois da escrita: a mudança de dia já aconteceu e já está
    salva. O intervals.icu fora do ar não pode desfazê-la.
  */
  void syncWatch(admin, user.id, moved, week, from, to).catch(() => {});

  return NextResponse.json({ plan: moved, changes });
}

async function syncWatch(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  plan: Awaited<ReturnType<typeof loadWeeklyPlan>>["plan"],
  week: string,
  from: WeeklyPlanDay["day"],
  to: WeeklyPlanDay["day"],
) {
  const conn = await loadIcuConnection(admin, userId);
  if (!conn) return;

  const { data: perfil } = await admin.from("profiles").select("training_prefs").eq("id", userId).maybeSingle();
  const { measureBy } = normalizePrefs((perfil as { training_prefs?: unknown } | null)?.training_prefs);

  const dataOrigem = isoDateOfWeekDay(week, from);
  const apagados = dataOrigem ? await removeIcuDay(conn, dataOrigem, week, from) : 0;

  const destino = plan?.days?.find(d => d.day === to);
  if (!destino || destino.type === "rest") return;

  /*
    O que estava lá, vai junto.

    Corrida, natação e bike são reenviadas sempre — são o que vai ao relógio
    sozinho. A musculação só é reenviada se **já havia** um evento nosso no dia
    de origem: ela não é automática, e mover um treino não é o momento de criar
    no relógio algo que o atleta nunca mandou. Mas se ele mandou, mover o dia
    tem que mover o que ele mandou.
  */
  const automatico = AUTO_SPORTS.includes(destino.sport ?? "corrida");
  if (automatico || apagados > 0) {
    await pushIcuSession(conn, { session: destino, weekStart: week, measureBy });
  }
}
