import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { RunForm } from "@/components/runs/RunForm";

export default async function NewRunPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  return (
    <AppShell>
      <RunForm userId={user.id} />
    </AppShell>
  );
}
