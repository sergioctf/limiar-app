import { athleteDateStr, athleteMondayStr, athleteDaysAgoStr } from "@/lib/week";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { DashboardWithRefresh } from "@/components/dashboard/DashboardWithRefresh";
import type { WeeklyPlanData } from "@/types";
import { loadRecoveryInputs } from "@/lib/recovery-load";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const now = new Date();
  const admin = createAdminClient();

  /*
   * Every date on this page is the athlete's, not the server's.
   *
   * This ran on the machine's local calendar, which on Vercel is UTC. After
   * 21:00 in Brazil that is already tomorrow, so at 22:58 on a Saturday the
   * page decided the week was over and served zeros to someone who had trained
   * five times that week.
   *
   * The week window was also Sunday-based while the rest of the app counts
   * Monday to Sunday — so even with the right clock, Sunday started a new week
   * up here and stayed in the old one everywhere else.
   */
  const todayStr      = athleteDateStr(now);
  const weekStartStr  = athleteMondayStr(now);
  const thirtyAgoStr  = athleteDaysAgoStr(30, now);
  const ninetyAgoStr  = athleteDaysAgoStr(90, now);
  const mondayStr     = weekStartStr;

  /** Await a query that may fail (table missing on older projects) without breaking the page. */
  async function safe<T>(query: PromiseLike<{ data: T[] | null }>): Promise<{ data: T[] | null }> {
    try { return await query; } catch { return { data: null }; }
  }

  // Everything below is independent — run it in parallel. (These used to be
  // ~10 sequential round-trips, which dominated the dashboard's load time.)
  const [
    { data: profile },
    { data: runs },
    { data: goals },
    { data: syncLogs },
    { data: weekActivities },
    { data: recentActivities },
    { data: activitiesHistory },
    { data: wellness },
    { data: raceData },
    { data: testData },
    { data: bodyData },
    { data: planRows },
  ] = await Promise.all([
    supabase.from("profiles").select("name, username").eq("id", user.id).maybeSingle(),
    supabase.from("runs").select("*, run_tags(tag)")
      .eq("user_id", user.id).is("deleted_at", null).order("date", { ascending: false }),
    supabase.from("goals").select("*")
      .eq("user_id", user.id).in("status", ["active", "upcoming"])
      .or(`race_date.is.null,race_date.gt.${todayStr}`)
      .order("race_date", { ascending: true }).limit(3),
    supabase.from("sync_logs").select("*")
      .eq("user_id", user.id).eq("source", "strava")
      .order("created_at", { ascending: false }).limit(1),
    supabase.from("activities")
      .select("id, date, name, sport_type, duration_seconds, calories, avg_hr, source")
      .eq("user_id", user.id).gte("date", weekStartStr).is("deleted_at", null)
      .order("date", { ascending: false }),
    supabase.from("activities")
      .select("id, date, name, sport_type, duration_seconds, calories, avg_hr, source")
      .eq("user_id", user.id).gte("date", thirtyAgoStr).is("deleted_at", null)
      .order("date", { ascending: false }).limit(10),
    supabase.from("activities").select("date, sport_type, duration_seconds, avg_hr")
      .eq("user_id", user.id).gte("date", ninetyAgoStr).is("deleted_at", null)
      .order("date", { ascending: false }),
    supabase.from("wellness_data").select("*")
      .eq("user_id", user.id).gte("date", thirtyAgoStr)
      .order("date", { ascending: false }),
    // Tables below may not exist on older projects — failures degrade gracefully.
    safe(admin.from("races").select("*")
      .eq("user_id", user.id).gt("race_date", todayStr).is("time_seconds", null)
      .order("race_date", { ascending: true }).limit(1)),
    safe(admin.from("performance_tests").select("*")
      .eq("user_id", user.id).order("test_date", { ascending: false }).limit(1)),
    safe<{ weight_kg: number | null }>(admin.from("body_measurements").select("weight_kg")
      .eq("user_id", user.id).order("date", { ascending: false }).limit(1)),
    safe<{ full_report: string | null }>(admin.from("coach_reports").select("full_report")
      .eq("user_id", user.id).eq("period_type", "week").eq("period_start", mondayStr).limit(1)),
  ]);

  /*
   * Today's recovery, from the same loader the Saúde screen and the morning
   * notification use — three surfaces, one number. A failure here must never
   * cost the athlete their dashboard.
   */
  const recovery = await loadRecoveryInputs(supabase, user.id, now)
    .then(r => r.recovery, () => null);

  // Use profile.name, or fallback to auth metadata, or email
  const displayName = profile?.name ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Usuário";

  const nextRace    = (raceData?.[0] ?? null) as import("@/types").Race | null;
  const latestTest  = (testData?.[0] ?? null) as import("@/types").PerformanceTest | null;
  const bodyWeightKg = (bodyData?.[0]?.weight_kg as number | undefined) ?? null;

  // This week's AI plan (shown on the dashboard with a link to the coach)
  let weeklyPlan: WeeklyPlanData | null = null;
  try {
    const raw = planRows?.[0]?.full_report as string | undefined;
    if (raw) {
      const parsed = JSON.parse(raw) as WeeklyPlanData;
      if (Array.isArray(parsed.days) && parsed.days.length > 0) weeklyPlan = parsed;
    }
  } catch { /* legacy text report — no plan card */ }

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
          /* Computed once, on the server, on the athlete's calendar. The client
             used to derive its own — and the two disagreed all evening. */
          weekStartStr={weekStartStr}
        goals={goals ?? []}
        lastSync={syncLogs?.[0] ?? null}
        weekActivities={(weekActivities ?? []) as import("@/types").Activity[]}
        recentActivities={(recentActivities ?? []) as import("@/types").Activity[]}
        activitiesHistory={(activitiesHistory ?? []) as Array<{ date: string; sport_type: string; duration_seconds: number | null; avg_hr: number | null }>}
        nextRace={nextRace}
        latestTest={latestTest}
        wellness={(wellness ?? []) as import("@/types").WellnessData[]}
        userUsername={profile?.username ?? null}
        bodyWeightKg={bodyWeightKg}
        weeklyPlan={weeklyPlan}
        recovery={recovery}
      />
      </DashboardWithRefresh>
    </AppShell>
  );
}
