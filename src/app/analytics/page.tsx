import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { AnalyticsContent } from "@/components/charts/AnalyticsContent";
import { HistoryHighlights } from "@/components/charts/HistoryHighlights";
import { athleteDaysAgoStr, athleteDateStr } from "@/lib/week";
import type { Goal, PerformanceTest, Run } from "@/types";

export default async function AnalyticsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  const today = athleteDateStr();

  const [{ data: runs }, { data: goals }, { data: tests }, { data: activities }] = await Promise.all([
    supabase.from("runs").select("*").eq("user_id", user.id).is("deleted_at", null).order("date", { ascending: true }),
    supabase.from("goals").select("*").eq("user_id", user.id).in("status", ["active", "upcoming"])
      .or(`race_date.is.null,race_date.gt.${today}`).order("race_date", { ascending: true }).limit(3),
    createAdminClient().from("performance_tests").select("*").eq("user_id", user.id)
      .order("test_date", { ascending: false }).limit(1),
    supabase.from("activities").select("date, sport_type, duration_seconds, avg_hr")
      .eq("user_id", user.id).is("deleted_at", null).gte("date", athleteDaysAgoStr(30)),
  ]);

  return (
    <AppShell>
      <AnalyticsContent
        runs={(runs ?? []) as Run[]}
        highlights={
          <HistoryHighlights
            runs={(runs ?? []) as Run[]}
            goals={(goals ?? []) as Goal[]}
            latestTest={((tests ?? [])[0] ?? null) as PerformanceTest | null}
            activities={(activities ?? []) as Array<{ date: string; sport_type: string; duration_seconds: number | null; avg_hr: number | null }>}
          />
        }
      />
    </AppShell>
  );
}
