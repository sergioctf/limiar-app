import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { DashboardWithRefresh } from "@/components/dashboard/DashboardWithRefresh";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const todayStr = new Date().toISOString().slice(0, 10);

  // Fetch profile (display name) — fallback to auth metadata
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  // Use profile.name, or fallback to auth metadata, or email
  const displayName = profile?.name ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Usuário";

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

  // Fetch active/upcoming goals — only future race dates (or null date)
  const { data: goals } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["active", "upcoming"])
    .or(`race_date.is.null,race_date.gt.${todayStr}`)
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

  // Fetch this week's activities (gym sessions)
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const { data: weekActivities } = await supabase
    .from("activities")
    .select("id, date, name, sport_type, duration_seconds, calories, avg_hr, source")
    .eq("user_id", user.id)
    .gte("date", weekStartStr)
    .is("deleted_at", null)
    .order("date", { ascending: false });

  // Fetch recent activities for the last 30 days for the activity feed
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: recentActivities } = await supabase
    .from("activities")
    .select("id, date, name, sport_type, duration_seconds, calories, avg_hr, source")
    .eq("user_id", user.id)
    .gte("date", thirtyDaysAgo.toISOString().slice(0, 10))
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .limit(10);

  // Fetch 90 days of activities (date + sport_type only) for training days filter
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: activitiesHistory } = await supabase
    .from("activities")
    .select("date, sport_type")
    .eq("user_id", user.id)
    .gte("date", ninetyDaysAgo.toISOString().slice(0, 10))
    .is("deleted_at", null)
    .order("date", { ascending: false });

  // Fetch next upcoming target race (future date, no result yet)
  let nextRace: import("@/types").Race | null = null;
  try {
    const supabaseAdmin = (await import("@/lib/supabase/server")).createAdminClient();
    const { data: raceData } = await supabaseAdmin
      .from("races")
      .select("*")
      .eq("user_id", user.id)
      .gt("race_date", todayStr)
      .is("time_seconds", null)
      .order("race_date", { ascending: true })
      .limit(1);
    nextRace = (raceData?.[0] ?? null) as import("@/types").Race | null;
  } catch {
    // Table may not exist yet — graceful fallback
  }

  // Fetch latest performance test for VDOT / LTHR (used for CTL/ATL accuracy)
  let latestTest: import("@/types").PerformanceTest | null = null;
  try {
    const supabaseAdmin = (await import("@/lib/supabase/server")).createAdminClient();
    const { data: testData } = await supabaseAdmin
      .from("performance_tests")
      .select("*")
      .eq("user_id", user.id)
      .order("test_date", { ascending: false })
      .limit(1);
    latestTest = (testData?.[0] ?? null) as import("@/types").PerformanceTest | null;
  } catch {
    // Table may not exist yet — graceful fallback
  }

  const runsWithTags = (runs ?? []).map((r) => ({
    ...r,
    tags: (r.run_tags ?? []).map((t: { tag: string }) => t.tag),
  }));

  return (
    <AppShell>
      <DashboardWithRefresh>
        <DashboardContent
          userName={displayName}
          runs={runsWithTags}
        latestReport={reports?.[0] ?? null}
        goals={goals ?? []}
        lastSync={syncLogs?.[0] ?? null}
        weekActivities={(weekActivities ?? []) as import("@/types").Activity[]}
        recentActivities={(recentActivities ?? []) as import("@/types").Activity[]}
        activitiesHistory={(activitiesHistory ?? []) as Array<{ date: string; sport_type: string }>}
        nextRace={nextRace}
        latestTest={latestTest}
      />
      </DashboardWithRefresh>
    </AppShell>
  );
}
