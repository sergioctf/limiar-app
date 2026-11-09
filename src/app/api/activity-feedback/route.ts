import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activityPlanMatch, supportsActivityDebrief, validActivityFeedback, type FeedbackActivity } from "@/lib/activity-feedback";
import { athleteDateStr, athleteDaysAgoStr } from "@/lib/week";
import { loadWeeklyPlan, mondayOf } from "@/lib/weekly-plan";
import { toSportKey } from "@/lib/sports";
import { linkedReference, sessionLinkFor, type SessionActivityLink } from "@/lib/session-activity-link";
import { loadSessionActivityLinks } from "@/lib/session-activity-link-db";

const FIELDS = "id,name,date,sport_type,duration_seconds,distance_m,avg_hr";
const UUID = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

type DB = ReturnType<typeof createClient>;
function owned(db: DB, userId: string) {
  return db.from("activities").select(FIELDS).eq("user_id", userId).is("deleted_at", null);
}

function chosenPlan(links: SessionActivityLink[], activity: FeedbackActivity) {
  const sport = toSportKey(activity.sport_type);
  return sport ? linkedReference(sessionLinkFor(links, activity.date, sport), { kind: "activity", id: activity.id }) : undefined;
}

async function planFor(db: DB, userId: string, activity: FeedbackActivity) {
  const week = mondayOf(new Date(`${activity.date}T12:00:00Z`));
  const [{ plan }, { data: sameDay, error }] = await Promise.all([
    loadWeeklyPlan(db, userId, week),
    owned(db, userId).eq("date", activity.date),
  ]);
  if (error || !sameDay || !plan?.generated_at || athleteDateStr(new Date(plan.generated_at)) > activity.date) return null;
  return activityPlanMatch(activity, sameDay, plan.days);
}

export async function GET(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Entre novamente." }, 401);
  const id = request.nextUrl.searchParams.get("activityId");
  if (id && !UUID.test(id)) return json({ error: "Atividade inválida." }, 400);

  const base = owned(db, user.id).order("date", { ascending: false }).order("id");
  const { data, error } = await (id ? base.eq("id", id) : base.gte("date", athleteDaysAgoStr(2)).lte("date", athleteDateStr()).limit(20));
  if (error) return json({ error: "Não foi possível carregar o treino." }, 500);
  const eligible = (data ?? []).filter(supportsActivityDebrief);
  if (!eligible.length) return json({ items: [] });

  const saved = await db.from("activity_feedback").select("*").eq("user_id", user.id)
    .in("activity_id", eligible.map(a => a.id));
  if (saved.error) return json({ error: "O Debrief está indisponível no momento." }, 503);
  const dates = eligible.map(activity => activity.date).sort();
  const links = await loadSessionActivityLinks(db, user.id, dates[0], dates[dates.length - 1]);
  const items = await Promise.all(eligible.map(async activity => {
    const savedFeedback = saved.data?.find(row => row.activity_id === activity.id) ?? null;
    const explicit = chosenPlan(links, activity);
    const planned = explicit !== undefined ? explicit : savedFeedback ? savedFeedback.planned : await planFor(db, user.id, activity);
    return { activity, feedback: savedFeedback ? { ...savedFeedback, planned } : null, planned };
  }));
  return json({ items });
}

export async function PUT(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Entre novamente." }, 401);
  const input: unknown = await request.json().catch(() => null);
  if (!validActivityFeedback(input)) return json({ error: "Confira as respostas." }, 400);
  const { data: activity, error } = await owned(db, user.id).eq("id", input.activityId).maybeSingle();
  if (error) return json({ error: "Não foi possível carregar o treino." }, 500);
  if (!activity || !supportsActivityDebrief(activity)) return json({ error: "Atividade não encontrada." }, 404);

  const previous = await db.from("activity_feedback").select("planned,status")
    .eq("activity_id", activity.id).eq("user_id", user.id).maybeSingle();
  if (previous.error) return json({ error: "O Debrief está indisponível no momento." }, 503);
  if (input.status !== "answered" && previous.data?.status === "answered") {
    return json({ error: "O feedback desta atividade já foi registrado." }, 409);
  }
  const answers = input.status === "answered"
    ? { perception: input.perception, rpe: input.rpe ?? null, reason: input.reason, note: input.note?.trim() || null }
    : { perception: null, rpe: null, reason: null, note: null };
  const explicit = chosenPlan(await loadSessionActivityLinks(db, user.id, activity.date, activity.date), activity);
  const planned = explicit !== undefined ? explicit : previous.data ? previous.data.planned : await planFor(db, user.id, activity);
  const result = await db.from("activity_feedback").upsert({
    activity_id: activity.id, user_id: user.id, status: input.status, planned,
    updated_at: new Date().toISOString(), ...answers,
  }, { onConflict: "activity_id" }).select("*").single();
  if (result.error) return json({ error: "Não foi possível salvar suas respostas." }, 500);
  return json({ feedback: result.data });
}
