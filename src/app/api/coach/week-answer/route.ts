/**
 * The one question the coach asks about a week.
 *
 * GET  → the reading of the week that just closed, and the question when there
 *        is one. Silence is the normal answer: a week that was met, or one the
 *        check-ins already explained, asks nothing.
 * POST → the athlete's answer. It is saved and the *next* week is rebuilt with
 *        it, because the week already underway is never rewritten.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { athleteDaysAgoStr } from "@/lib/week";
import { ensureWeeklyPlan, weekReadingFor, previousMondayOf, nextMondayOf, mondayOf } from "@/lib/weekly-plan";
import { weekQuestion, type ShortfallReason } from "@/lib/week-reading";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

const REASONS: ShortfallReason[] = ["life", "body", "too_much"];

/** Runs far enough back to judge the closed week, the one before it, and whether
 * the athlete has been training at all (the reading looks five weeks back). */
async function recentRuns(db: ReturnType<typeof createClient>, userId: string) {
  const { data } = await db.from("runs").select("id,date,distance_km")
    .eq("user_id", userId).is("deleted_at", null)
    .gte("date", athleteDaysAgoStr(60)).order("date", { ascending: true });
  return (data ?? []) as Array<{ id: string; date: string; distance_km: number }>;
}

export async function GET() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Entre novamente." }, 401);

  const now = new Date();
  const monday = mondayOf(now);
  const weekStart = previousMondayOf(now);
  const reading = await weekReadingFor(db, user.id, monday, await recentRuns(db, user.id));
  if (!reading) return json({ reading: null });

  const { data: answered } = await db.from("week_feedback").select("reason")
    .eq("user_id", user.id).eq("week_start", weekStart).limit(1);

  return json({
    weekStart,
    reading,
    answer: (answered as Array<{ reason: string }> | null)?.[0]?.reason ?? null,
    question: reading.ask && !answered?.length ? weekQuestion(reading.ask) : null,
  });
}

export async function POST(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Entre novamente para responder." }, 401);

  const body = await request.json().catch(() => null) as { weekStart?: unknown; reason?: unknown } | null;
  const reason = body?.reason;
  const weekStart = body?.weekStart;
  // Only the week the coach actually asked about can be answered.
  if (typeof weekStart !== "string" || weekStart !== previousMondayOf(new Date())
    || typeof reason !== "string" || !REASONS.includes(reason as ShortfallReason)) {
    return json({ error: "Resposta inválida." }, 400);
  }

  const { error } = await db.from("week_feedback")
    .upsert({ user_id: user.id, week_start: weekStart, reason }, { onConflict: "user_id,week_start" });
  if (error) return json({ error: "Não foi possível guardar sua resposta. Tente novamente." }, 503);

  /*
   * The answer has to change something the athlete can see. The current week is
   * frozen — they have already organised their days around it — so it lands on
   * the next one, which the Sunday cron may have built before this answer
   * existed.
   */
  const next = await ensureWeeklyPlan(db, user.id, nextMondayOf(new Date()), { force: true }).catch(() => null);
  const nextKm = next?.plan
    ? Math.round(next.plan.days.reduce((sum, d) => sum + (d.distance_km ?? 0), 0))
    : null;

  return json({ ok: true, reason, nextWeekKm: next?.frozen ? null : nextKm });
}
