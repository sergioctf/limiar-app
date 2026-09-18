/**
 * The coach's check before today's session.
 *
 *   GET                              → today's decision: nothing, a note, or a question
 *   POST { action: "prompted" }      → the pop-up was shown (it shows once a day)
 *   POST { answer: TodayAnswer }     → the athlete's answer, applied as they chose it
 *
 * The decision itself is `todayCheck` (deterministic). This route only gathers
 * the inputs, remembers that it asked — so tomorrow knows — and applies the
 * answer through the same tools the athlete already has: the adaptation for a
 * shorter session, the recovery swap for an easy run or tomorrow.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { loadRecoveryInputs } from "@/lib/recovery-load";
import { addDays } from "@/lib/health-view";
import { canMoveToTomorrow, applySwap, dayKeyOf } from "@/lib/session-swap";
import { adaptOptions, applyAdaptation } from "@/lib/session-adapt";
import { loadAdaptContext } from "@/lib/adapt-context";
import { todayCheck, type TodayAnswer, type TodayCheckHistory } from "@/lib/today-check";
import type { RunContext } from "@/lib/run-feedback";
import type { WeeklyPlanData } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

const ANSWERS: TodayAnswer[] = ["keep", "shorter", "easy", "tomorrow"];

type Db = ReturnType<typeof createClient>;

async function decide(db: Db, userId: string) {
  const admin = createAdminClient();
  const inputs = await loadRecoveryInputs(admin, userId);
  const today = inputs.today;

  // What the athlete said after the runs of the last three days.
  const { data: recentRuns } = await db.from("runs").select("id, date")
    .eq("user_id", userId).is("deleted_at", null)
    .gte("date", addDays(today, -3)).lt("date", today);
  const runDate = new Map(((recentRuns ?? []) as Array<{ id: string; date: string }>).map(r => [r.id, r.date]));
  let recentFeedback: Array<{ date: string; effort: number | null; context: RunContext | null }> = [];
  if (runDate.size > 0) {
    const { data } = await db.from("run_feedback").select("run_id, effort, context")
      .eq("user_id", userId).in("run_id", Array.from(runDate.keys()));
    recentFeedback = ((data ?? []) as Array<{ run_id: string; effort: number | null; context: RunContext | null }>)
      .map(f => ({ date: runDate.get(f.run_id)!, effort: f.effort, context: f.context }));
  }

  // The coach's own previous checks. Before migration 033 the table does not
  // exist: the check still works, it just cannot remember that it asked.
  const past = await db.from("today_checks").select("date, action, answer, score, prompted_at")
    .eq("user_id", userId).gte("date", addDays(today, -7));
  const remembers = !past.error;
  const rows = (past.data ?? []) as Array<TodayCheckHistory & { prompted_at: string | null }>;

  const todayKey = dayKeyOf(today);
  const check = todayCheck({
    today,
    session: inputs.recovery.session,
    sessionDone: inputs.recovery.sessionDone,
    rows: inputs.rows,
    load: inputs.load,
    checkin: inputs.checkin,
    recentFeedback,
    history: rows,
    canTomorrow: inputs.plan ? canMoveToTomorrow(inputs.plan, todayKey) : false,
  });
  return { inputs, check, remembers, row: rows.find(r => r.date === today) ?? null, today, todayKey };
}

export async function GET() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Entre novamente." }, 401);

  const { check, remembers, row, today } = await decide(db, user.id);

  // Remember the day's decision the first time it is made, so tomorrow knows.
  if (check.action !== "none" && remembers && !row) {
    await db.from("today_checks").insert({
      user_id: user.id, date: today, session_label: check.session?.label ?? null,
      action: check.action, score: check.score,
      signals: check.signals.map(s => ({ key: s.key, source: s.source, weight: s.weight })),
    }).then(() => {}, () => {});
  }

  return json({
    date: today,
    check,
    answer: row?.answer ?? null,
    prompted: !!row?.prompted_at,
  });
}

export async function POST(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Entre novamente." }, 401);

  const body = await request.json().catch(() => null) as { action?: unknown; answer?: unknown } | null;
  if (!body) return json({ error: "Pedido inválido." }, 400);

  if (body.action === "prompted") {
    const today = (await decide(db, user.id)).today;
    await db.from("today_checks").update({ prompted_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("date", today);
    return json({ ok: true });
  }

  const answer = body.answer as TodayAnswer;
  if (!ANSWERS.includes(answer)) return json({ error: "Resposta inválida." }, 400);

  const { inputs, check, row, today, todayKey } = await decide(db, user.id);
  if (row?.answer) return json({ error: "Você já respondeu hoje." }, 409);
  // The day's session may have changed since the question was asked — done, swapped, adapted.
  if (check.action !== "ask" || !check.options.some(o => o.value === answer)) {
    return json({ error: "Essa opção não vale mais para o treino de hoje." }, 409);
  }

  const admin = createAdminClient();
  const reason = `Checagem do dia: ${check.signals.map(s => s.phrase).join("; ")}`.slice(0, 280);
  let next: WeeklyPlanData | null = null;
  let reportId: string | null = inputs.planReportId;

  if (answer === "shorter") {
    const loaded = await loadAdaptContext(user.id).catch(() => null);
    const planned = loaded?.plan.days.find(d => d.day === todayKey) ?? null;
    if (!loaded || !planned) return json({ error: "Não há plano para hoje." }, 404);
    const { options } = adaptOptions(planned, "fatigue", loaded.ctx);
    const option = options.find(o => o.id === "shorter") ?? options[0];
    if (!option) return json({ error: "Não encontramos uma versão mais curta deste treino." }, 409);
    const applied = applyAdaptation(loaded.plan, todayKey, option.day, {
      when: "before", reason: "fatigue", source: "option",
      preserves: option.preserves, changes: option.changes,
    });
    if ("error" in applied) return json({ error: applied.error }, 409);
    next = applied.plan;
    reportId = loaded.reportId;
  } else if (answer === "easy" || answer === "tomorrow") {
    if (!inputs.plan) return json({ error: "Não há plano para hoje." }, 404);
    const applied = applySwap(inputs.plan, todayKey, answer, reason);
    if ("error" in applied) return json({ error: applied.error }, 409);
    next = applied.plan;
  }

  if (next && reportId) {
    const { error } = await admin.from("coach_reports")
      .update({ full_report: JSON.stringify(next) })
      .eq("id", reportId).eq("user_id", user.id);
    if (error) return json({ error: "Não foi possível ajustar o treino de hoje." }, 500);
    // The older readiness proposal for today is settled by this answer.
    await admin.from("plan_suggestions").update({ status: "accepted" })
      .eq("user_id", user.id).eq("date", today).eq("status", "pending")
      .then(() => {}, () => {});
  }

  await db.from("today_checks").upsert({
    user_id: user.id, date: today, session_label: check.session?.label ?? null,
    action: "ask", score: check.score,
    signals: check.signals.map(s => ({ key: s.key, source: s.source, weight: s.weight })),
    answer, answered_at: new Date().toISOString(),
  }, { onConflict: "user_id,date" }).then(() => {}, () => {});

  const day = next?.days.find(d => d.day === todayKey) ?? inputs.recovery.session;
  return json({ ok: true, answer, today: day });
}
