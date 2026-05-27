import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { AnalyticsContent } from "@/components/charts/AnalyticsContent";

export default async function AnalyticsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: runs } = await supabase
    .from("runs")
    .select("id,date,type,distance_km,duration_seconds,avg_pace_seconds_per_km,avg_hr,elevation_gain_m,source")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("date", { ascending: true });

  return (
    <AppShell>
      <AnalyticsContent runs={runs ?? []} />
    </AppShell>
  );
}
