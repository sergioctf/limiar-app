import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { athleteDateStr, athleteDaysAgoStr } from "@/lib/week";
import { matchFeedbackPlan, validFeedbackInput } from "@/lib/run-feedback";
import type { WeeklyPlanDay } from "@/types";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const UUID = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;

async function planFor(db: ReturnType<typeof createClient>, userId: string, date: string) {
  const monday = new Date(`${date}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const [reports, sameDay] = await Promise.all([
    db.from("coach_reports").select("full_report").eq("user_id", userId)
      .eq("period_type", "week").eq("period_start", monday.toISOString().slice(0, 10)),
    db.from("runs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("date", date).is("deleted_at", null),
  ]);
  if (reports.error || sameDay.error || reports.data?.length !== 1) return null;
  try {
    const plan = JSON.parse(reports.data[0].full_report);
    // A plan generated after the run date cannot prove what was prescribed beforehand.
    if (!plan.generated_at || athleteDateStr(new Date(plan.generated_at)) > date) return null;
    return Array.isArray(plan.days) ? matchFeedbackPlan(date, plan.days as WeeklyPlanDay[], sameDay.count ?? 0) : null;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Entre novamente para ver seu check-in." }, 401);
  const id = request.nextUrl.searchParams.get("runId");
  if (id && !UUID.test(id)) return json({ error: "Corrida inválida." }, 400);
  let query = db.from("runs").select("id,name,date,distance_km,avg_pace_seconds_per_km,avg_hr")
    .eq("user_id", user.id).is("deleted_at", null).order("date", { ascending: false }).order("id");
  query = id ? query.eq("id", id) : query.gte("date", athleteDaysAgoStr(7)).lte("date", athleteDateStr()).limit(20);
  const { data: runs, error } = await query;
  if (error) return json({ error: "Não foi possível carregar o treino." }, 500);
  if (!runs?.length) return json({ items: [] });
  const saved = await db.from("run_feedback").select("run_id,status,effort,context,note,planned")
    .eq("user_id", user.id).in("run_id", runs.map(r => r.id));
  if (saved.error) return json({ error: "O check-in está indisponível no momento. Tente novamente mais tarde." }, 503);
  const items = await Promise.all(runs.map(async run => {
    const feedback = saved.data?.find(f => f.run_id === run.id) ?? null;
    return { run, feedback, planned: feedback ? feedback.planned : await planFor(db, user.id, run.date) };
  }));
  return json({ items });
}

export async function PUT(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Entre novamente para salvar." }, 401);
  const body: unknown = await request.json().catch(() => null);
  if (!validFeedbackInput(body)) return json({ error: "Confira as respostas e tente novamente." }, 400);
  const { data: run, error: runError } = await db.from("runs").select("id,date").eq("id", body.runId)
    .eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (runError) return json({ error: "Não foi possível consultar a corrida." }, 500);
  if (!run) return json({ error: "Corrida não encontrada." }, 404);
  const previous = await db.from("run_feedback").select("planned").eq("run_id", run.id).eq("user_id", user.id).maybeSingle();
  if (previous.error) return json({ error: "O check-in está indisponível. Suas respostas não foram salvas." }, 503);
  const planned = previous.data ? previous.data.planned : await planFor(db, user.id, run.date);
  const { data, error } = await db.from("run_feedback").upsert({
    run_id: run.id, user_id: user.id, status: body.status,
    effort: body.status === "answered" ? body.effort : null,
    context: body.status === "answered" ? body.context : null,
    note: body.status === "answered" ? body.note?.trim() || null : null,
    planned, updated_at: new Date().toISOString(),
  }, { onConflict: "run_id" }).select("run_id,status,effort,context,note,planned").single();
  if (error) return json({ error: "Não foi possível salvar. Suas respostas continuam aqui para tentar novamente." }, 500);
  return json({ feedback: data });
}
