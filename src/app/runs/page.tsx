import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { RunsContent } from "@/components/runs/RunsContent";
import type { HistoryActivity } from "@/components/runs/ActivityCard";
import { progressReport, type ProgressCheckin, type ProgressPlan, type ProgressRun } from "@/lib/progress-reading";
import { localDateStr } from "@/lib/week";
import type { WeeklyPlanData } from "@/types";

export default async function RunsPage({ searchParams }: { searchParams?: { sport?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  // Plans far enough back to cover the comparable-runs baseline (~20 weeks).
  const since = new Date();
  since.setDate(since.getDate() - 150);
  const sinceStr = localDateStr(since);

  const [{ data: runs }, reports, feedback, answers, races, activities] = await Promise.all([
    supabase
      .from("runs")
      .select("*, run_tags(tag)")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("date", { ascending: false }),
    supabase.from("coach_reports").select("period_start, full_report")
      .eq("user_id", user.id).eq("period_type", "week").gte("period_start", sinceStr),
    supabase.from("run_feedback").select("run_id, effort, context, execution").eq("user_id", user.id),
    supabase.from("week_feedback").select("week_start, reason").eq("user_id", user.id),
    supabase.from("races").select("race_date").eq("user_id", user.id),
    // Every other sport, so the history is one list.
    supabase.from("activities").select("id, date, name, sport_type, duration_seconds, distance_m, calories, avg_hr, source")
      .eq("user_id", user.id).is("deleted_at", null).order("date", { ascending: false }),
  ]);

  const runsWithTags = (runs ?? []).map((r) => ({
    ...r,
    tags: (r.run_tags ?? []).map((t: { tag: string }) => t.tag),
  }));

  /*
   * "O que está melhorando para você?" — read from the same history listed
   * below. Every lookup degrades to "nothing known": a failed query costs a
   * reading its data, never the page.
   */
  const plans: ProgressPlan[] = [];
  for (const row of (reports.data ?? []) as Array<{ period_start: string | null; full_report: string | null }>) {
    if (!row.period_start || !row.full_report) continue;
    try {
      const plan = JSON.parse(row.full_report) as WeeklyPlanData;
      if (Array.isArray(plan.days)) plans.push({ weekStart: row.period_start, days: plan.days });
    } catch { /* a malformed plan reads as no plan */ }
  }
  const progress = progressReport({
    today: localDateStr(),
    runs: runsWithTags as ProgressRun[],
    plans,
    checkins: (feedback.data ?? []) as ProgressCheckin[],
    weekAnswers: (answers.data ?? []) as Array<{ week_start: string; reason: string }>,
    raceDates: ((races.data ?? []) as Array<{ race_date: string | null }>)
      .map(r => r.race_date).filter((d): d is string => !!d),
  });

  return (
    <AppShell>
      <RunsContent
        runs={runsWithTags}
        activities={(activities.data ?? []) as HistoryActivity[]}
        initialSport={searchParams?.sport ?? null}
        progress={progress}
      />
    </AppShell>
  );
}
