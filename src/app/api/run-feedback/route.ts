import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { athleteDateStr, athleteDaysAgoStr } from "@/lib/week";
import { asksForCheckIn, validFeedbackInput } from "@/lib/run-feedback";
import { linkedReference, sessionLinkFor } from "@/lib/session-activity-link";
import { inferRunSession, loadSessionActivityLinks } from "@/lib/session-activity-link-db";
import { lightenUpcomingRuns } from "@/lib/plan-edit";
import { compareSessions, parseProposal, parsedLabel, recordExecuted, undoAdaptation } from "@/lib/session-adapt";
import type { Execution } from "@/lib/run-feedback";
import { dayKeyOf } from "@/lib/session-swap";
import { mondayOf } from "@/lib/weekly-plan";
import type { WeeklyPlanData } from "@/types";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const UUID = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
const FIELDS = "run_id,status,effort,context,note,planned,reduce_requested,execution,executed_text,updated_at,rpe,perception,adjusted_sessions";

interface Lightening {
  /** False only when the plan could not be written: the request must not be recorded. */
  ok: boolean;
  changes: string[];
  /** Puts the week back as it was, if what follows fails. */
  rollback: () => Promise<void>;
}

const NOTHING: Lightening = { ok: true, changes: [], rollback: async () => {} };

/**
 * The athlete said yes to "reduce the next sessions?".
 *
 * "Next" is counted from today, not from the run: a check-in answered two days
 * after the session should not shorten a run that already happened. The week
 * is edited in place — the athlete asked for this change — and next week's
 * engine reads `reduce_requested` and holds the volume instead of ramping.
 */
async function lightenThisWeek(userId: string): Promise<Lightening> {
  const admin = createAdminClient();
  const now = new Date();
  const { data, error: readError } = await admin.from("coach_reports").select("id, full_report")
    .eq("user_id", userId).eq("period_type", "week").eq("period_start", mondayOf(now)).limit(1);
  if (readError) return { ...NOTHING, ok: false };
  const row = data?.[0];
  // No plan, or nothing left to shorten: still a real request — next week holds.
  if (!row?.full_report) return NOTHING;
  let plan: WeeklyPlanData;
  try { plan = JSON.parse(row.full_report as string) as WeeklyPlanData; } catch { return NOTHING; }
  if (!Array.isArray(plan.days)) return NOTHING;
  const result = lightenUpcomingRuns(plan, dayKeyOf(athleteDateStr(now)));
  if (result.changes.length === 0) return NOTHING;
  const { error } = await admin.from("coach_reports")
    .update({ full_report: JSON.stringify(result.plan) })
    .eq("id", row.id).eq("user_id", userId);
  if (error) return { ...NOTHING, ok: false };
  return {
    ok: true,
    changes: result.changes,
    rollback: async () => {
      await admin.from("coach_reports").update({ full_report: row.full_report }).eq("id", row.id).eq("user_id", userId);
    },
  };
}

/**
 * "Adaptei" or "Fiz outro treino", written onto the plan day.
 *
 * Without this, a valid substitution stayed on the plan as the old session, and
 * the week's adherence counted an 8 km interval workout against a 3,5 km hill
 * session as "extra" on one side and "partial" on the other. The day now says
 * what was done, with the prescription kept inside; answering "fiz como
 * previsto" later puts it back.
 */
async function recordExecution(
  userId: string, run: { id: string; date: string; distance_km: number | null }, execution: Execution, text: string | null,
) {
  const admin = createAdminClient();
  const monday = new Date(`${run.date}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const { data } = await admin.from("coach_reports").select("id, full_report")
    .eq("user_id", userId).eq("period_type", "week").eq("period_start", monday.toISOString().slice(0, 10)).limit(1);
  const row = data?.[0];
  if (!row?.full_report) return;
  const plan = JSON.parse(row.full_report as string) as WeeklyPlanData;
  const key = dayKeyOf(run.date);
  const day = plan.days?.find(d => d.day === key);
  if (!day) return;

  let next: WeeklyPlanData | null = null;
  if (execution === "as_planned") {
    if (day.adaptation?.when !== "after") return;
    const undone = undoAdaptation(plan, key);
    if ("plan" in undone) next = undone.plan;
  } else {
    // An adaptation agreed before the run already describes the session.
    if (day.adaptation?.when === "before") return;
    const base = day.adaptation?.original ?? day;
    const parsed = text?.trim() ? parseProposal(text) : null;
    const label = parsed ? parsedLabel(parsed) : null;
    const compared = execution === "adapted" && parsed?.kind && label ? compareSessions(base, parsed.kind, label) : null;
    // The prescription stays on the day; what was done is recorded beside it.
    const applied = recordExecuted(plan, key, {
      execution, label, text: text ?? null, km: Number(run.distance_km ?? 0), compared, runId: run.id,
    });
    if ("plan" in applied) next = applied.plan;
  }
  if (next) await admin.from("coach_reports").update({ full_report: JSON.stringify(next) }).eq("id", row.id).eq("user_id", userId);
}

export async function GET(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Entre novamente para ver seu check-in." }, 401);
  const id = request.nextUrl.searchParams.get("runId");
  if (id && !UUID.test(id)) return json({ error: "Corrida inválida." }, 400);
  let query = db.from("runs").select("id,name,date,distance_km,duration_seconds,avg_pace_seconds_per_km,avg_hr")
    .eq("user_id", user.id).is("deleted_at", null).order("date", { ascending: false }).order("id");
  query = id ? query.eq("id", id) : query.gte("date", athleteDaysAgoStr(7)).lte("date", athleteDateStr()).limit(20);
  const { data: runs, error } = await query;
  if (error) return json({ error: "Não foi possível carregar o treino." }, 500);
  if (!runs?.length) return json({ items: [] });
  const saved = await db.from("run_feedback").select(FIELDS)
    .eq("user_id", user.id).in("run_id", runs.map(r => r.id));
  if (saved.error) return json({ error: "O check-in está indisponível no momento. Tente novamente mais tarde." }, 503);
  const dates = runs.map(run => run.date).sort();
  const links = await loadSessionActivityLinks(db, user.id, dates[0], dates[dates.length - 1]);
  const all = await Promise.all(runs.map(async run => {
    const savedFeedback = saved.data?.find(f => f.run_id === run.id) ?? null;
    const explicit = linkedReference(sessionLinkFor(links, run.date, "corrida"), { kind: "run", id: run.id });
    const planned = explicit !== undefined ? explicit : savedFeedback ? savedFeedback.planned : await inferRunSession(db, user.id, run).catch(() => null);
    return { run, feedback: savedFeedback ? { ...savedFeedback, planned } : null, planned };
  }));
  // O teste de 3 km tem o fluxo dele; a regra está em `asksForCheckIn`.
  return json({ items: all.filter(asksForCheckIn) });
}

export async function PUT(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Entre novamente para salvar." }, 401);
  const body: unknown = await request.json().catch(() => null);
  if (!validFeedbackInput(body)) return json({ error: "Confira as respostas e tente novamente." }, 400);
  const { data: run, error: runError } = await db.from("runs").select("id,date,distance_km").eq("id", body.runId)
    .eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (runError) return json({ error: "Não foi possível consultar a corrida." }, 500);
  if (!run) return json({ error: "Corrida não encontrada." }, 404);
  const previous = await db.from("run_feedback").select("planned,reduce_requested,rpe,perception,adjusted_sessions,status").eq("run_id", run.id).eq("user_id", user.id).maybeSingle();
  if (previous.error) return json({ error: "O check-in está indisponível. Suas respostas não foram salvas." }, 503);
  const links = await loadSessionActivityLinks(db, user.id, run.date, run.date);
  const explicit = linkedReference(sessionLinkFor(links, run.date, "corrida"), { kind: "run", id: run.id });
  const planned = explicit !== undefined ? explicit : previous.data ? previous.data.planned : await inferRunSession(db, user.id, run).catch(() => null);
  const answered = body.status === "answered";
  if (!answered && previous.data?.status === "answered") return json({ error: "O feedback desta atividade já foi registrado." }, 409);
  const reduce = answered && body.context === "session_too_hard" ? body.reduce === true : null;

  /*
   * The plan changes first, and the request is recorded only if it did.
   *
   * Saving "reduce_requested" before touching the plan left a window where the
   * record said the sessions were lightened while the plan still held the old
   * distances. Now: lighten → save the answer → if saving fails, put the week
   * back. Either both happen or neither does.
   */
  const lightening = reduce === true && previous.data?.reduce_requested !== true
    ? await lightenThisWeek(user.id).catch(() => ({ ...NOTHING, ok: false }))
    : NOTHING;
  if (!lightening.ok) {
    return json({ error: "Não consegui aliviar os próximos treinos agora. Nada foi salvo — tente de novo." }, 503);
  }

  const { data, error } = await db.from("run_feedback").upsert({
    run_id: run.id, user_id: user.id, status: body.status,
    effort: answered ? body.effort : null,
    context: answered ? body.context : null,
    note: answered ? body.note?.trim() || null : null,
    rpe: answered ? body.rpe === undefined ? previous.data?.rpe ?? null : body.rpe : null,
    perception: answered ? body.perception === undefined ? previous.data?.perception ?? null : body.perception : null,
    adjusted_sessions: reduce === true && previous.data?.reduce_requested !== true
      ? lightening.changes : previous.data?.adjusted_sessions ?? null,
    // Once asked for, a reduction stays recorded: editing the answer later
    // neither undoes the lighter sessions nor applies them a second time.
    reduce_requested: previous.data?.reduce_requested === true ? true : reduce,
    execution: answered ? body.execution ?? null : null,
    executed_text: answered && body.execution && body.execution !== "as_planned" ? body.executedText?.trim() || null : null,
    planned, updated_at: new Date().toISOString(),
  }, { onConflict: "run_id" }).select(FIELDS).single();
  if (error) {
    await lightening.rollback().catch(() => {});
    return json({ error: "Não foi possível salvar. Suas respostas continuam aqui para tentar novamente." }, 500);
  }

  // Best-effort: the answer is already saved, and the evaluation reads it from
  // there. Recording it on the plan is what keeps the week's adherence honest.
  if (answered && body.execution && planned) {
    const matched = explicit !== undefined || !previous.data || Boolean(await inferRunSession(db, user.id, run).catch(() => null));
    if (matched) await recordExecution(user.id, run, body.execution, body.executedText ?? null).catch(() => {});
  }

  return json({ feedback: data, lightened: lightening.changes });
}
