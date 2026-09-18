/**
 * /hoje — prototype of the new Home, beside the current one (18/09).
 *
 * Real data, real components, nothing linked from the menu yet: Sérgio opens it
 * on the phone, compares with Início, and only then does it replace the Home.
 */
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { HomePreview, type HomeAttention } from "@/components/home/HomePreview";
import { athleteDateStr, athleteMondayStr } from "@/lib/week";
import { buildToday } from "@/lib/today";
import { weekMovement } from "@/lib/week-movement";
import { loadRecoveryInputs } from "@/lib/recovery-load";
import { addDays } from "@/lib/health-view";
import { dayKeyOf } from "@/lib/session-swap";
import type { WeeklyPlanData } from "@/types";

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

export default async function HojePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const now = new Date();
  const today = athleteDateStr(now);
  const monday = athleteMondayStr(now);
  const nextMonday = addDays(monday, 7);
  const admin = createAdminClient();

  const [plans, runs, activities, wellness, tests, body, feedback] = await Promise.all([
    admin.from("coach_reports").select("period_start, full_report")
      .eq("user_id", user.id).eq("period_type", "week").in("period_start", [monday, nextMonday]),
    supabase.from("runs")
      .select("id, date, name, distance_km, duration_seconds, moving_time_seconds, elapsed_time_seconds, calories")
      .eq("user_id", user.id).is("deleted_at", null).gte("date", monday).order("date"),
    supabase.from("activities")
      .select("id, date, name, sport_type, duration_seconds, distance_m, calories")
      .eq("user_id", user.id).is("deleted_at", null).gte("date", monday).order("date"),
    supabase.from("wellness_data").select("date, active_kcal").eq("user_id", user.id).gte("date", monday),
    admin.from("performance_tests").select("id").eq("user_id", user.id).limit(1),
    admin.from("body_measurements").select("weight_kg").eq("user_id", user.id).order("date", { ascending: false }).limit(1),
    supabase.from("run_feedback").select("run_id, status").eq("user_id", user.id).eq("status", "deferred"),
  ]);

  const rows = (plans.data ?? []) as Array<{ period_start: string; full_report: string | null }>;
  const plan = parsePlan(rows.find(r => r.period_start === monday)?.full_report);
  const nextPlan = parsePlan(rows.find(r => r.period_start === nextMonday)?.full_report);
  const weightKg = (body.data?.[0]?.weight_kg as number | undefined) ?? null;
  const runRows = (runs.data ?? []) as Array<{ id: string; date: string; name: string | null; distance_km: number; duration_seconds: number; moving_time_seconds: number | null; elapsed_time_seconds: number | null; calories: number | null }>;
  const activityRows = (activities.data ?? []) as Array<{ id: string; date: string; name: string | null; sport_type: string; duration_seconds: number | null; distance_m: number | null; calories: number | null }>;

  const todayView = buildToday({
    plan, runs: runRows, activities: activityRows, today, weekStart: monday, hasTest: (tests.data?.length ?? 0) > 0,
  });
  const week = weekMovement({
    weekStart: monday, today, plan, runs: runRows, activities: activityRows,
    wellness: (wellness.data ?? []) as Array<{ date: string; active_kcal: number | null }>, weightKg,
  });
  const recovery = await loadRecoveryInputs(supabase, user.id, now).then(r => r.recovery, () => null);

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
  const deferred = new Set(((feedback.data ?? []) as Array<{ run_id: string }>).map(f => f.run_id));
  const recentDeferred = runRows.filter(r => deferred.has(r.id)).pop();
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (recentDeferred) {
    attention = { text: "Você deixou para depois o check-in de uma corrida.", href: `/runs/${recentDeferred.id}`, action: "Responder" };
  } else if (weekday === 1 || weekday === 2) {
    attention = { text: "Como foi a semana passada, o que o treinador entendeu e o que muda.", href: "/coach", action: "Ver" };
  }

  const d = new Date(`${today}T12:00:00Z`);
  const dateLabel = `${WEEKDAY[d.getUTCDay()]}, ${d.getUTCDate()} de ${MONTH[d.getUTCMonth()]}`;

  return (
    <AppShell>
      <HomePreview
        dateLabel={dateLabel}
        today={todayView}
        recovery={recovery}
        week={week}
        tomorrow={tomorrow}
        attention={attention}
        refreshKey={runRows.map(r => r.id).join(",")}
      />
    </AppShell>
  );
}
