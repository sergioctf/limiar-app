/**
 * Buscar tudo que o dossiê da IA precisa, num lugar só.
 *
 * O mesmo caminho serve a tela da IA (que renderiza as seções) e a rota da
 * pergunta aberta (que manda o dossiê ao modelo): se fossem dois, a IA acabaria
 * respondendo sobre números que a tela não mostra.
 *
 * Toda consulta que falhar custa a sua seção, nunca o dossiê — um atleta sem
 * tênis cadastrados, sem provas ou sem teste continua podendo perguntar sobre a
 * semana dele.
 */
import { buildBrief, type AthleteBrief } from "@/lib/ai-brief";
import { loadRecoveryInputs } from "@/lib/recovery-load";
import { buildToday } from "@/lib/today";
import { weekMovement } from "@/lib/week-movement";
import { buildSleepWeek } from "@/lib/health-view";
import { computeMetrics } from "@/lib/performance";
import { detectOvertraining } from "@/lib/overtraining";
import { computeAdherenceHistory } from "@/lib/plan-adherence";
import { weekRecap, type RecapCheckin } from "@/lib/week-recap";
import { weekReadingFor } from "@/lib/weekly-plan";
import { progressReport, type ProgressCheckin, type ProgressPlan, type ProgressRun } from "@/lib/progress-reading";
import { athleteDateStr, athleteDaysAgoStr, athleteMondayStr } from "@/lib/week";
import { addDays } from "@/lib/health-view";
import { dayKeyOf } from "@/lib/session-swap";
import type { Shoe } from "@/lib/shoes";
import type { Goal, PerformanceTest, Race, Run, WeeklyPlanData } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Uma consulta que pode não existir neste projeto não pode derrubar o dossiê. */
async function safe<T>(query: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try { return (await query).data ?? []; } catch { return []; }
}

function parsePlan(raw: string | null | undefined): WeeklyPlanData | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as WeeklyPlanData;
    return Array.isArray(p.days) && p.days.length > 0 ? p : null;
  } catch { return null; }
}

const shift = (date: string, days: number) => addDays(date, days);

export async function loadAthleteBrief(db: Db, admin: Db, userId: string, now: Date = new Date()): Promise<AthleteBrief> {
  const today     = athleteDateStr(now);
  const monday    = athleteMondayStr(now);
  const lastMonday = shift(monday, -7);
  const weekBefore = shift(monday, -14);
  const nextMonday = shift(monday, 7);

  const [
    profile, runs, activities, reports, feedback, weekAnswers, races, goals, shoes, tests, shoeRuns,
  ] = await Promise.all([
    (async () => { try { return (await db.from("profiles").select("name").eq("id", userId).maybeSingle()).data as { name: string | null } | null; } catch { return null; } })(),
    // Cento e oitenta dias: a leitura de evolução compara com ~20 semanas atrás.
    safe<Run>(db.from("runs")
      .select("id, date, name, type, distance_km, duration_seconds, moving_time_seconds, elapsed_time_seconds, avg_hr, avg_pace_seconds_per_km, calories")
      .eq("user_id", userId).is("deleted_at", null).gte("date", athleteDaysAgoStr(180, now))
      .order("date", { ascending: false }) as unknown as PromiseLike<{ data: Run[] | null }>),
    safe<{ id: string; date: string; name: string | null; sport_type: string; duration_seconds: number | null; distance_m: number | null; calories: number | null }>(
      db.from("activities").select("id, date, name, sport_type, duration_seconds, distance_m, calories")
        .eq("user_id", userId).is("deleted_at", null).gte("date", athleteDaysAgoStr(120, now)).order("date")),
    safe<{ period_start: string | null; full_report: string | null }>(
      admin.from("coach_reports").select("period_start, full_report")
        .eq("user_id", userId).eq("period_type", "week").gte("period_start", athleteDaysAgoStr(150, now))),
    safe<{ run_id: string; effort: number | null; context: string | null; execution: string | null }>(
      db.from("run_feedback").select("run_id, effort, context, execution").eq("user_id", userId)),
    safe<{ week_start: string; reason: string }>(db.from("week_feedback").select("week_start, reason").eq("user_id", userId)),
    safe<Race>(db.from("races").select("*").eq("user_id", userId)),
    safe<Goal>(db.from("goals").select("*").eq("user_id", userId)),
    safe<Shoe>(db.from("shoes").select("id, name, brand, category, initial_km, retired, notes").eq("user_id", userId)),
    safe<PerformanceTest>(admin.from("performance_tests").select("*").eq("user_id", userId).order("test_date", { ascending: false }).limit(1)),
    /*
     * Quilometragem dos tênis é a vida inteira do par, não os últimos 180 dias:
     * um tênis de 2024 com 700 km não pode aparecer com 200. Duas colunas, só
     * das corridas que têm par associado — é barato.
     */
    safe<{ shoe_id: string | null; distance_km: number | null }>(
      db.from("runs").select("shoe_id, distance_km")
        .eq("user_id", userId).is("deleted_at", null).not("shoe_id", "is", null)),
  ]);

  // Recuperação, carga e plano da semana: o mesmo caminho que a Saúde e a Home usam.
  const recoveryInputs = await loadRecoveryInputs(db, userId, now).catch(() => null);
  const plan = recoveryInputs?.plan ?? parsePlan(reports.find(r => r.period_start === monday)?.full_report);
  const nextPlan = parsePlan(reports.find(r => r.period_start === nextMonday)?.full_report);

  const weekRuns = runs.filter(r => r.date >= monday);
  const weekActivities = activities.filter(a => a.date >= monday);
  const latestTest = tests[0] ?? null;
  const metrics = latestTest
    ? computeMetrics(latestTest.distance_km * 1000, latestTest.time_seconds, latestTest.avg_hr ?? undefined, latestTest.max_hr ?? undefined)
    : null;

  const todayView = buildToday({
    plan, runs: weekRuns, activities: weekActivities, today, weekStart: monday, hasTest: !!latestTest,
  });

  const week = weekMovement({
    weekStart: monday, today, plan, runs: weekRuns, activities: weekActivities,
    wellness: (recoveryInputs?.rows ?? []).filter(w => w.date >= monday),
  });

  // ── A semana que fechou, exatamente como o Treinador a conta ───────────────
  const adherence = computeAdherenceHistory(
    reports,
    runs as unknown as Array<{ id: string; date: string; distance_km: number; duration_seconds: number; type: string }>,
    activities.map(a => ({ date: a.date, sport_type: a.sport_type })),
    4,
  );

  const lastSunday = shift(lastMonday, 6);
  const closedRunIds = new Set(runs.filter(r => r.date >= lastMonday && r.date <= lastSunday).map(r => r.id));
  const recapCheckins = feedback
    .filter(f => closedRunIds.has(f.run_id))
    .map(f => ({ effort: f.effort, context: f.context, execution: f.execution })) as RecapCheckin[];

  const thisWeekPlan = plan;
  const reading = thisWeekPlan?.week_reading
    ?? await weekReadingFor(admin, userId, monday, runs as Array<{ id: string; date: string; distance_km: number }>).catch(() => null);

  const kmOf = (from: string, to: string) =>
    runs.filter(r => r.date >= from && r.date <= to).reduce((s, r) => s + (Number(r.distance_km) || 0), 0);

  const recap = weekRecap({
    weekStart: lastMonday,
    adherence: adherence.find(w => w.weekStart === lastMonday) ?? null,
    previousActualKm: kmOf(weekBefore, shift(weekBefore, 6)) || null,
    reading: reading ?? null,
    checkins: recapCheckins,
    weekAnswered: weekAnswers.some(a => a.week_start === lastMonday),
    nextWeek: thisWeekPlan ? { weekStart: monday, days: thisWeekPlan.days } : null,
    today,
  });

  // ── O que está melhorando ─────────────────────────────────────────────────
  const plans: ProgressPlan[] = [];
  for (const row of reports) {
    const p = parsePlan(row.full_report);
    if (row.period_start && p) plans.push({ weekStart: row.period_start, days: p.days });
  }
  const progress = progressReport({
    today,
    runs: runs as unknown as ProgressRun[],
    plans,
    checkins: feedback as unknown as ProgressCheckin[],
    weekAnswers,
    raceDates: races.map(r => r.race_date).filter(Boolean),
  });

  const overtraining = detectOvertraining(
    runs,
    metrics?.lthr ?? null,
    metrics?.paces.find(p => p.name === "threshold")?.pace_min_sec ?? null,
    recoveryInputs?.rows ?? [],
  );

  const name = profile?.name ?? null;

  return buildBrief({
    date: today,
    firstName: name ? name.trim().split(/\s+/)[0] : null,
    today: todayView,
    recovery: recoveryInputs?.recovery ?? null,
    week,
    recap,
    progress,
    fitness: recoveryInputs?.fitness ?? [],
    overtraining,
    metrics,
    testDate: latestTest?.test_date ?? null,
    sleep: recoveryInputs ? buildSleepWeek(recoveryInputs.rows, today) : null,
    adherence,
    races,
    goals,
    shoes,
    shoeRuns,
  });
}

/** O próximo dia do plano, quando a conversa precisar dele. */
export const nextDayKey = dayKeyOf;
