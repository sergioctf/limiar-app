import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { RunsContent } from "@/components/runs/RunsContent";

export default async function RunsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: runs } = await supabase
    .from("runs")
    .select("*, run_tags(tag)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("date", { ascending: false });

  const runsWithTags = (runs ?? []).map((r) => ({
    ...r,
    tags: (r.run_tags ?? []).map((t: { tag: string }) => t.tag),
  }));

  return (
    <AppShell>
      <RunsContent runs={runsWithTags} />
    </AppShell>
  );
}
