import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { CoachContent } from "@/components/coach/CoachContent";

export default async function CoachPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const [{ data: reports }, { data: cycles }] = await Promise.all([
    supabase.from("coach_reports").select("*").eq("user_id", user.id).order("report_date", { ascending: false }),
    supabase.from("training_cycles").select("*").eq("user_id", user.id).order("start_date"),
  ]);

  return (
    <AppShell>
      <CoachContent reports={reports ?? []} cycles={cycles ?? []} />
    </AppShell>
  );
}
