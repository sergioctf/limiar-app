import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardContent } from "@/components/dashboard/DashboardContent";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  // Fetch all runs
  const { data: runs } = await supabase
    .from("runs")
    .select("*, run_tags(tag)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("date", { ascending: false });

  // Fetch latest coach report
  const { data: reports } = await supabase
    .from("coach_reports")
    .select("*")
    .eq("user_id", user.id)
    .order("report_date", { ascending: false })
    .limit(1);

  // Fetch active/upcoming goals
  const { data: goals } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["active", "upcoming"])
    .order("race_date", { ascending: true })
    .limit(3);

  // Fetch recent sync log
  const { data: syncLogs } = await supabase
    .from("sync_logs")
    .select("*")
    .eq("user_id", user.id)
    .eq("source", "strava")
    .order("created_at", { ascending: false })
    .limit(1);

  const runsWithTags = (runs ?? []).map((r) => ({
    ...r,
    tags: (r.run_tags ?? []).map((t: { tag: string }) => t.tag),
  }));

  return (
    <AppShell>
      <DashboardContent
        runs={runsWithTags}
        latestReport={reports?.[0] ?? null}
        goals={goals ?? []}
        lastSync={syncLogs?.[0] ?? null}
      />
    </AppShell>
  );
}
