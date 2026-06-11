import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { GoalsContent } from "@/components/goals/GoalsContent";

export default async function GoalsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const [{ data: goals }, { data: projections }, { data: strategies }, { data: tests }] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", user.id).order("race_date", { ascending: true }),
    supabase.from("projections").select("*").eq("user_id", user.id).order("distance_km").order("scenario"),
    supabase.from("race_strategies").select("*").eq("user_id", user.id).order("created_at"),
    supabase.from("performance_tests").select("*").eq("user_id", user.id).order("test_date", { ascending: false }).limit(1),
  ]);

  return (
    <AppShell>
      <GoalsContent
        goals={goals ?? []}
        projections={projections ?? []}
        strategies={strategies ?? []}
        latestTest={tests?.[0] ?? null}
      />
    </AppShell>
  );
}
