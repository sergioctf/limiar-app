/**
 * Amigos → Conquistas.
 *
 * As minhas medalhas em cima, a comparação com o grupo embaixo. Elas vieram de
 * Gráficos (Sérgio, 20/09): medalha não é tendência, e só faz sentido ao lado
 * de quem mais tem.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { AchievementCompare } from "@/components/achievements/AchievementCompare";
import { MyAchievements } from "@/components/achievements/MyAchievements";
import type { Run } from "@/types";

export default async function ConquistasPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  // Só o que as medalhas medem — distância, tempo, ritmo, data e tipo.
  const { data: runs } = await supabase
    .from("runs")
    .select("id, date, type, distance_km, duration_seconds, moving_time_seconds, elapsed_time_seconds, avg_pace_seconds_per_km, avg_hr")
    .eq("user_id", user.id).is("deleted_at", null)
    .order("date", { ascending: false });

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <MyAchievements runs={(runs ?? []) as Run[]} />
        <AchievementCompare />
      </div>
    </AppShell>
  );
}
