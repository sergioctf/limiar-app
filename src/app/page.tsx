/**
 * Hoje — the Home.
 *
 * What I do today, what I did this week, what deserves attention (Sérgio,
 * 18/09). Only what those three need is loaded: the week's runs and
 * activities, the plan, recovery, and six months of runs for the overtraining
 * check — no longer every run the athlete ever recorded, with its raw Strava
 * payload, on every visit (debt A6).
 *
 * Every date is the athlete's, not the server's: on Vercel the machine clock is
 * UTC, and after 21:00 in Brazil that is already tomorrow.
 */
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardWithRefresh } from "@/components/dashboard/DashboardWithRefresh";
import { HomeContent, type HomeAttention } from "@/components/home/HomeContent";
import { athleteDateStr, athleteDaysAgoStr, athleteMondayStr } from "@/lib/week";
import { buildToday } from "@/lib/today";
import { weekMovement } from "@/lib/week-movement";
import { loadRecoveryInputs } from "@/lib/recovery-load";
import { addDays } from "@/lib/health-view";
import { dayKeyOf } from "@/lib/session-swap";
import { computeMetrics } from "@/lib/performance";
import { detectOvertraining } from "@/lib/overtraining";
import { calorieBreakdown } from "@/lib/calorie-breakdown";
import { testStatus } from "@/lib/test-status";
import { HomeHistory } from "@/components/home/HomeHistory";
import type { Goal, PerformanceTest, Run, WeeklyPlanData, WellnessData } from "@/types";

export const dynamic = "force-dynamic";

const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MONTH = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function parsePlan(raw: string | null | undefined): WeeklyPlanData | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as WeeklyPlanData;
    return Array.isArray(p.days) && p.days.length > 0 ? p : null;
  } catch { return null; }
}

/** A query that may fail (a table missing on an older project) must not cost the Home. */
async function safe<T>(query: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try { return (await query).data ?? []; } catch { return []; }
}

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const now = new Date();
  const today = athleteDateStr(now);
  const monday = athleteMondayStr(now);
  const nextMonday = addDays(monday, 7);
  const admin = createAdminClient();

  const [profile, plans, runs, activities, wellness, tests, body, feedback, sync, anyActivity, goals] = await Promise.all([
    supabase.from("profiles").select("name, username").eq("id", user.id).maybeSingle(),
    safe<{ period_start: string; full_report: string | null }>(admin.from("coach_reports").select("period_start, full_report")
      .eq("user_id", user.id).eq("period_type", "week").in("period_start", [monday, nextMonday])),
    /*
     * As colunas de que o dia, a semana, a carga e os recordes precisam — nunca
     * o JSON cru do Strava (dívida A6). O histórico inteiro voltou a ser
     * carregado em 20/09, porque "Seus números" e os recordes pessoais falam da
     * vida toda; são ~10 números por corrida, não o payload de antes.
     */
    safe<Run>(supabase.from("runs")
      .select("id, date, name, type, distance_km, duration_seconds, moving_time_seconds, elapsed_time_seconds, avg_hr, avg_pace_seconds_per_km, calories")
      .eq("user_id", user.id).is("deleted_at", null)
      .order("date", { ascending: false }) as unknown as PromiseLike<{ data: Run[] | null }>),
    /*
     * Cento e oitenta dias, a mesma janela das corridas.
     *
     * A semana precisa de sete dias e "dias treinados (30d)" de trinta, mas o
     * alerta de sobrecarga precisa dos seis meses: sem o histórico de academia,
     * a carga crônica começa do zero e uma rotina antiga de musculação aparece
     * como pico novo — o falso positivo exato que a correção de 21/09 elimina.
     */
    safe<{ id: string; date: string; name: string | null; sport_type: string; duration_seconds: number | null; distance_m: number | null; calories: number | null; avg_hr: number | null }>(
      supabase.from("activities").select("id, date, name, sport_type, duration_seconds, distance_m, calories, avg_hr")
        .eq("user_id", user.id).is("deleted_at", null).gte("date", athleteDaysAgoStr(180, now)).order("date")),
    safe<WellnessData>(supabase.from("wellness_data").select("*").eq("user_id", user.id).gte("date", athleteDaysAgoStr(30, now))),
    safe<PerformanceTest>(admin.from("performance_tests").select("*").eq("user_id", user.id).order("test_date", { ascending: false }).limit(1)),
    safe<{ weight_kg: number | null }>(admin.from("body_measurements").select("weight_kg").eq("user_id", user.id).order("date", { ascending: false }).limit(1)),
    safe<{ run_id: string }>(supabase.from("run_feedback").select("run_id").eq("user_id", user.id).eq("status", "deferred")),
    safe<{ created_at: string }>(supabase.from("sync_logs").select("created_at").eq("user_id", user.id).eq("source", "strava").order("created_at", { ascending: false }).limit(1)),
    safe<{ id: string }>(supabase.from("activities").select("id").eq("user_id", user.id).is("deleted_at", null).limit(1)),
    safe<Goal>(supabase.from("goals").select("*").eq("user_id", user.id).in("status", ["active", "upcoming"])
      .or(`race_date.is.null,race_date.gt.${today}`).order("race_date", { ascending: true }).limit(3)),
  ]);

  const plan = parsePlan(plans.find(r => r.period_start === monday)?.full_report);
  const nextPlan = parsePlan(plans.find(r => r.period_start === nextMonday)?.full_report);
  const weightKg = body[0]?.weight_kg ?? null;
  const weekRuns = runs.filter(r => r.date >= monday);
  const weekActivities = activities.filter(a => a.date >= monday);
  // A carga olha seis meses; o resto da página, a vida inteira.
  const recentRuns = runs.filter(r => r.date >= athleteDaysAgoStr(180, now));
  const latestTest = tests[0] ?? null;

  const todayView = buildToday({
    plan, runs: weekRuns, activities: weekActivities, today, weekStart: monday, hasTest: !!latestTest,
  });
  const week = weekMovement({
    weekStart: monday, today, plan, runs: weekRuns, activities: weekActivities,
    wellness: wellness.filter(w => w.date >= monday), weightKg,
  });
  const recovery = await loadRecoveryInputs(supabase, user.id, now).then(r => r.recovery, () => null);

  // The one alert that costs the athlete something if ignored.
  const metrics = latestTest
    ? computeMetrics(latestTest.distance_km * 1000, latestTest.time_seconds, latestTest.avg_hr ?? undefined, latestTest.max_hr ?? undefined)
    : null;
  // Mesmas entradas que a recuperação usa, para o app ter um TSB só.
  const overtraining = detectOvertraining(
    recentRuns, metrics?.lthr ?? null, metrics?.paces.find(p => p.name === "threshold")?.pace_min_sec ?? null,
    wellness, activities,
  );

  const tomorrowKey = dayKeyOf(addDays(today, 1));
  const tomorrow = tomorrowKey === "Mon"
    ? nextPlan?.days.find(d => d.day === "Mon") ?? null
    : plan?.days.find(d => d.day === tomorrowKey) ?? null;

  /*
   * At most one thing, and never something already on screen as a pop-up: a
   * check-in the athlete put off, then — early in the week — the recap of the
   * week that closed. Nothing is invented to fill the space.
   */
  let attention: HomeAttention | null = null;
  const deferred = new Set(feedback.map(f => f.run_id));
  const recentDeferred = recentRuns.find(r => deferred.has(r.id) && r.date >= athleteDaysAgoStr(7, now));
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (recentDeferred) {
    attention = { text: "Você deixou para depois o check-in de uma corrida.", href: `/runs/${recentDeferred.id}`, action: "Responder" };
  } else if (weekday === 1 || weekday === 2) {
    attention = { text: "Como foi a semana passada, o que o treinador entendeu e o que muda.", href: "/coach", action: "Ver" };
  }

  const d = new Date(`${today}T12:00:00Z`);
  const dateLabel = `${WEEKDAY[d.getUTCDay()]}, ${d.getUTCDate()} de ${MONTH[d.getUTCMonth()]}`;
  const userName = (profile.data?.name as string | null) || (user.user_metadata?.full_name as string | undefined) || user.email?.split("@")[0] || null;

  return (
    <AppShell>
      <DashboardWithRefresh>
        <HomeContent
          dateLabel={dateLabel}
          today={todayView}
          recovery={recovery}
          week={week}
          tomorrow={tomorrow}
          attention={attention}
          refreshKey={weekRuns.map(r => r.id).join(",")}
          firstName={userName?.trim().split(" ")[0] ?? null}
          userName={(profile.data?.name as string | null) ?? null}
          username={(profile.data?.username as string | null) ?? null}
          isNewUser={runs.length === 0 && anyActivity.length === 0}
          overtraining={overtraining}
          calorieDay={calorieBreakdown(weekRuns, weekActivities, weightKg)}
          lastSyncAt={sync[0]?.created_at ?? null}
          history={
            <HomeHistory
              runs={runs}
              goals={goals}
              latestTest={latestTest}
              testStatus={testStatus(latestTest)}
              activities={activities}
            />
          }
        />
      </DashboardWithRefresh>
    </AppShell>
  );
}
