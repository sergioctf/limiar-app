import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { dayStatus, plannedSessionsOf } from "@/lib/day-status";
import { SPORTS, type SportKey } from "@/lib/sports";
import { athleteDateStr, athleteMondayStr } from "@/lib/week";
import { dayKeyOf } from "@/lib/session-swap";
import { loadWeeklyPlan } from "@/lib/weekly-plan";

const UUID = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
const respond = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function PUT(request: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return respond({ error: "Entre novamente para vincular a atividade." }, 401);
  const body = await request.json().catch(() => null);
  const { date, sport, type, activity } = body ?? {};
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || typeof sport !== "string" || !Object.prototype.hasOwnProperty.call(SPORTS, sport)
    || typeof type !== "string" || !type || type.length > 32
    || (activity !== null && (!activity || typeof activity.id !== "string" || !UUID.test(activity.id)
      || activity.kind !== (sport === "corrida" ? "run" : "activity")))) {
    return respond({ error: "Confira o dia, a modalidade e a atividade." }, 400);
  }

  const day = new Date(`${date}T15:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date || date > athleteDateStr()) {
    return respond({ error: "Escolha uma data de treino que já chegou." }, 400);
  }

  const db = createAdminClient();
  if (activity === null) {
    const { error } = await db.from("session_activity_links").delete().eq("user_id", user.id)
      .eq("session_date", date).eq("sport", sport).eq("session_type", type);
    return error ? respond({ error: "Não foi possível remover o vínculo. Tente novamente." }, 503) : respond({ link: null });
  }

  const { plan } = await loadWeeklyPlan(db, user.id, athleteMondayStr(day));
  const plannedDay = plan?.days.find(item => item.day === dayKeyOf(date));
  const session = plannedSessionsOf(plannedDay).find(item => item.sport === sport && item.type === type);
  if (!session || !plannedDay) return respond({ error: "A sessão do plano mudou. Atualize a agenda." }, 409);

  const isRun = activity.kind === "run";
  const fields = isRun ? "id,date,distance_km,duration_seconds,moving_time_seconds,elapsed_time_seconds"
    : "id,date,sport_type,duration_seconds,distance_m";
  const { data: record, error: readError } = await db.from(isRun ? "runs" : "activities").select(fields)
    .eq("id", activity.id).eq("user_id", user.id).eq("date", date).is("deleted_at", null).maybeSingle();
  if (readError) return respond({ error: "Não foi possível conferir a atividade." }, 503);
  if (!record) return respond({ error: "Atividade não encontrada neste dia." }, 404);

  const candidate = dayStatus({ date, planned: plannedDay, runs: isRun ? [record] : [], activities: isRun ? [] : [record] })
    .done.find(item => item.sport === sport && item.kind === activity.kind && item.id === activity.id);
  if (!candidate) return respond({ error: "A atividade não é compatível com este treino." }, 409);

  const planned = sport === "musculacao" && plannedDay.strength
    ? { ...plannedDay, type: "strength", label: "Musculação", sport: sport as SportKey,
        distance_km: undefined, pace: undefined, duration_min: plannedDay.strength.estimatedMinutes }
    : plannedDay;
  const link = { session_date: date, sport, session_type: type,
    run_id: isRun ? activity.id : null, activity_id: isRun ? null : activity.id, planned };
  const { error } = await db.from("session_activity_links").upsert({
    user_id: user.id, ...link, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,session_date,sport" });
  if (error) return respond({ error: "Não foi possível salvar o vínculo. Confira a atividade e tente novamente." }, 503);
  return respond({ link });
}
