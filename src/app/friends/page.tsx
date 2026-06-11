import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { FriendsContent } from "@/components/friends/FriendsContent";

export default async function FriendsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, username")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AppShell>
      <FriendsContent
        myUsername={profile?.username ?? null}
        myName={profile?.name ?? null}
      />
    </AppShell>
  );
}
