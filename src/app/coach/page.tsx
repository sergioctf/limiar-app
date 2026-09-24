import { localDateStr } from "@/lib/week";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AppShell }     from "@/components/layout/AppShell";
import { CoachContent } from "@/components/coach/CoachContent";
import { computeAdherenceHistory } from "@/lib/plan-adherence";
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

  // Treze semanas de corridas e atividades — a adesão usa ~5.
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 91);
  const sinceStr = localDateStr(windowStart);

  const [{ data: reports }, tests, { data: recentRuns }, { data: recentActivities }] = await Promise.all([
    admin
      .from("coach_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("report_date", { ascending: false }),
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

  // Long-term macro plan + actual km per week (for progress display)
  const macroPlan = await loadActiveMacroPlan(admin, user.id).catch(() => null);
  const weeklyActualKm: Record<string, number> = {};
  for (const r of runRows) {
    const d = new Date(`${r.date}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const mon = localDateStr(d);
    weeklyActualKm[mon] = (weeklyActualKm[mon] ?? 0) + r.distance_km;
  }

  return (
    <AppShell>
      <CoachContent
        reports={reports ?? []}
        tests={tests}
        adherenceHistory={adherenceHistory}
        macroPlan={macroPlan}
        weeklyActualKm={weeklyActualKm}
      />
    </AppShell>
  );
}
