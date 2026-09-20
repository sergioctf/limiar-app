import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { RunsContent } from "@/components/runs/RunsContent";
import type { HistoryActivity } from "@/components/runs/ActivityCard";

export default async function RunsPage({ searchParams }: { searchParams?: { sport?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const [{ data: runs }, activities] = await Promise.all([
    supabase
      .from("runs")
      .select("*, run_tags(tag)")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("date", { ascending: false }),
    // Every other sport, so the history is one list.
    supabase.from("activities").select("id, date, name, sport_type, duration_seconds, distance_m, calories, avg_hr, source")
      .eq("user_id", user.id).is("deleted_at", null).order("date", { ascending: false }),
  ]);

  const runsWithTags = (runs ?? []).map((r) => ({
    ...r,
    tags: (r.run_tags ?? []).map((t: { tag: string }) => t.tag),
  }));

  return (
    <AppShell>
      <RunsContent
        runs={runsWithTags}
        activities={(activities.data ?? []) as HistoryActivity[]}
        initialSport={searchParams?.sport ?? null}
      />
    </AppShell>
  );
}
