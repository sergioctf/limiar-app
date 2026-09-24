import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { AnalyticsContent } from "@/components/charts/AnalyticsContent";
import { computeAerobicEfficiency } from "@/lib/aerobic-efficiency";
import type { Run } from "@/types";

export default async function AnalyticsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: runs } = await supabase
    .from("runs").select("*").eq("user_id", user.id).is("deleted_at", null)
    .order("date", { ascending: true });

  return (
    <AppShell>
      <AnalyticsContent
        runs={(runs ?? []) as Run[]}
        // Veio do Treinador em 24/09: é uma tendência, e tendência mora aqui.
        efficiencyTrend={computeAerobicEfficiency((runs ?? []) as Run[])}
      />
    </AppShell>
  );
}
