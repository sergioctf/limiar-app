import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { RunForm } from "@/components/runs/RunForm";

export default async function EditRunPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: run } = await supabase
    .from("runs")
    .select("*, run_tags(tag)")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (!run) notFound();

  const initial = {
    ...run,
    tags: (run.run_tags ?? []).map((t: { tag: string }) => t.tag).join(", "),
  };

  return (
    <AppShell>
      <RunForm userId={user.id} runId={run.id} initial={initial} />
    </AppShell>
  );
}
