import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AppShell }     from "@/components/layout/AppShell";
import { CoachContent } from "@/components/coach/CoachContent";
import { computeAdherenceHistory } from "@/lib/plan-adherence";
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

  // Last 6 weeks of runs/activities for plan-adherence computation
  const sixWeeksAgo = new Date();
  sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
  const sinceStr = sixWeeksAgo.toISOString().slice(0, 10);

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
      .select("date, distance_km, duration_seconds")
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

  const weeklyReports = ((reports ?? []) as Array<{ period_type: string; period_start: string | null; full_report: string | null }>)
    .filter(r => r.period_type === "week");
  const adherenceHistory = computeAdherenceHistory(
    weeklyReports,
    (recentRuns ?? []) as Array<{ date: string; distance_km: number; duration_seconds: number }>,
    (recentActivities ?? []) as Array<{ date: string; sport_type: string }>,
    4,
  );

  return (
    <AppShell>
      <CoachContent
        reports={reports ?? []}
        cycles={cycles ?? []}
        tests={tests}
        adherenceHistory={adherenceHistory}
      />
    </AppShell>
  );
}
