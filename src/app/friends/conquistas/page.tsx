import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { AchievementCompare } from "@/components/achievements/AchievementCompare";

export default async function ConquistasPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  return (
    <AppShell>
      <AchievementCompare />
    </AppShell>
  );
}
