import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { HealthContent } from "@/components/health/HealthContent";
import type { HealthCheckin, BodyMeasurement } from "@/types";

export const metadata = { title: "Saúde — Limiar" };

export default async function HealthPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const bodySince = new Date();
  bodySince.setDate(bodySince.getDate() - 180);

  const [{ data: checkins }, { data: measurements }] = await Promise.all([
    supabase
      .from("health_checkins")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: false }),
    supabase
      .from("body_measurements")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", bodySince.toISOString().slice(0, 10))
      .order("date", { ascending: false }),
  ]);

  return (
    <AppShell>
      <HealthContent
        initialCheckins={(checkins ?? []) as HealthCheckin[]}
        initialBody={(measurements ?? []) as BodyMeasurement[]}
      />
    </AppShell>
  );
}
