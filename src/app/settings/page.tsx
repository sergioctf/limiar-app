import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { SettingsContent } from "@/components/settings/SettingsContent";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const [{ data: conn }, { data: syncLogs }, { data: profile }] = await Promise.all([
    supabase.from("strava_connections").select("athlete_id, scope, updated_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("sync_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("profiles").select("name, username, email").eq("id", user.id).single(),
  ]);

  const { count: stravaRunsCount } = await supabase
    .from("runs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("strava_activity_id", "is", null);

  return (
    <AppShell>
      <SettingsContent
        userEmail={user.email ?? ""}
        userName={profile?.name ?? ""}
        userUsername={profile?.username ?? null}
        stravaConnection={conn ?? null}
        syncLogs={syncLogs ?? []}
        stravaRunsCount={stravaRunsCount ?? 0}
      />
    </AppShell>
  );
}
