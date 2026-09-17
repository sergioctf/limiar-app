import { localDateStr } from "@/lib/week";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AppShell }     from "@/components/layout/AppShell";
import { CoachContent } from "@/components/coach/CoachContent";
import { computeAdherenceHistory } from "@/lib/plan-adherence";
import { weekRecap, type RecapCheckin } from "@/lib/week-recap";
import { mondayOf, weekReadingFor } from "@/lib/weekly-plan";
import type { WeeklyPlanData } from "@/types";
import { computeAerobicEfficiency } from "@/lib/aerobic-efficiency";
import { loadActiveMacroPlan } from "@/lib/macro-plan";
import type { PerformanceTest } from "@/types";

export default async function CoachPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const admin = createAdminClient();

  // Fetch performance_tests with graceful fallback if table doesn't exist yet
  async function fetchTests(): Promise<PerformanceTest[]> {
    try {
      const { data, error } = await admin
        .from("performance_tests")
        .select("*")
        .eq("user_id", user!.id)
        .order("test_date", { ascending: false });

      if (error) {
        console.warn("[CoachPage] performance_tests query error:", error.message);
        return [];
      }
      return (data ?? []) as PerformanceTest[];
    } catch (err) {
      console.warn("[CoachPage] performance_tests fetch failed:", err);
      return [];
    }
  }

  // Last 13 weeks of runs/activities — adherence uses ~5, efficiency uses 12
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 91);
  const sinceStr = localDateStr(windowStart);

  const [{ data: reports }, { data: cycles }, tests, { data: recentRuns }, { data: recentActivities }] = await Promise.all([
    admin
      .from("coach_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("report_date", { ascending: false }),
    admin
      .from("training_cycles")
      .select("*")
      .eq("user_id", user.id)
      .order("start_date"),
    fetchTests(),
    admin
      .from("runs")
      .select("id, date, distance_km, duration_seconds, moving_time_seconds, elapsed_time_seconds, avg_pace_seconds_per_km, avg_hr, type")
      .eq("user_id", user.id)
      .gte("date", sinceStr)
      .is("deleted_at", null),
    admin
      .from("activities")
      .select("date, sport_type")
      .eq("user_id", user.id)
      .gte("date", sinceStr)
      .is("deleted_at", null),
  ]);

  type RunRow = {
    id: string; date: string; distance_km: number; duration_seconds: number;
    avg_pace_seconds_per_km: number | null; avg_hr: number | null; type: string;
  };
  const runRows = (recentRuns ?? []) as RunRow[];

  const weeklyReports = ((reports ?? []) as Array<{ period_type: string; period_start: string | null; full_report: string | null }>)
    .filter(r => r.period_type === "week");
  const adherenceHistory = computeAdherenceHistory(
    weeklyReports,
    runRows,
    (recentActivities ?? []) as Array<{ date: string; sport_type: string }>,
    4,
  );

  const efficiencyTrend = computeAerobicEfficiency(runRows);

  // Long-term macro plan + actual km per week (for progress display)
  const macroPlan = await loadActiveMacroPlan(admin, user.id).catch(() => null);
  const weeklyActualKm: Record<string, number> = {};
  for (const r of runRows) {
    const d = new Date(`${r.date}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const mon = localDateStr(d);
    weeklyActualKm[mon] = (weeklyActualKm[mon] ?? 0) + r.distance_km;
  }

  /*
   * Closing the week that ended: what happened, what the coach made of it and
   * what changes. Everything below is already on this page or one small query
   * away — the recap itself is deterministic (`weekRecap`).
   */
  const shift = (dateStr: string, days: number) => {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + days);
    return localDateStr(d);
  };
  const today = localDateStr();
  const thisMonday = mondayOf(new Date());
  const lastMonday = shift(thisMonday, -7);
  const weekBefore = shift(lastMonday, -7);

  const planFor = (monday: string): WeeklyPlanData | null => {
    const row = weeklyReports.find(r => r.period_start === monday);
    if (!row?.full_report) return null;
    try {
      const parsed = JSON.parse(row.full_report) as WeeklyPlanData;
      return Array.isArray(parsed.days) ? parsed : null;
    } catch { return null; }
  };

  const closedWeek = adherenceHistory.find(w => w.weekStart === lastMonday) ?? null;
  const thisWeekPlan = planFor(thisMonday);

  // What the athlete said about the runs of the week being closed.
  const lastSunday = shift(lastMonday, 6);
  const closedWeekRunIds = runRows
    .filter(r => r.date >= lastMonday && r.date <= lastSunday)
    .map(r => r.id);
  let checkins: RecapCheckin[] = [];
  if (closedWeekRunIds.length > 0) {
    const { data } = await admin
      .from("run_feedback").select("effort, context, execution")
      .eq("user_id", user.id).in("run_id", closedWeekRunIds);
    checkins = (data ?? []) as RecapCheckin[];
  }

  /*
   * The reading that actually fed this week's plan, kept inside it. Plans
   * written before the reading existed carry none, so it is recomputed from the
   * same inputs rather than leaving the athlete without an explanation.
   */
  const reading = thisWeekPlan?.week_reading
    ?? await weekReadingFor(admin, user.id, thisMonday, runRows).catch(() => null);

  // The same rule the pop-up uses: a question already answered is not pending.
  const { data: weekAnswer } = await admin
    .from("week_feedback").select("reason")
    .eq("user_id", user.id).eq("week_start", lastMonday).limit(1);

  const recap = weekRecap({
    weekStart: lastMonday,
    adherence: closedWeek,
    previousActualKm: weeklyActualKm[weekBefore] ?? null,
    reading,
    checkins,
    weekAnswered: (weekAnswer?.length ?? 0) > 0,
    nextWeek: thisWeekPlan ? { weekStart: thisMonday, days: thisWeekPlan.days } : null,
    today,
  });

  return (
    <AppShell>
      <CoachContent
        recap={recap}
        reports={reports ?? []}
        cycles={cycles ?? []}
        tests={tests}
        adherenceHistory={adherenceHistory}
        efficiencyTrend={efficiencyTrend}
        macroPlan={macroPlan}
        weeklyActualKm={weeklyActualKm}
      />
    </AppShell>
  );
}
