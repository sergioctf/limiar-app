import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AppShell }      from "@/components/layout/AppShell";
import { RacesContent }  from "@/components/races/RacesContent";
import type { Race }     from "@/types";

export default async function RacesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const admin = createAdminClient();

  async function fetchRaces(): Promise<Race[]> {
    try {
      const { data, error } = await admin
        .from("races")
        .select("*")
        .eq("user_id", user!.id)
        .order("race_date", { ascending: false });

      if (error) {
        console.warn("[RacesPage] races query error:", error.message);
        return [];
      }
      return (data ?? []) as Race[];
    } catch (err) {
      console.warn("[RacesPage] races fetch failed:", err);
      return [];
    }
  }

  const races = await fetchRaces();

  return (
    <AppShell>
      <RacesContent initialRaces={races} />
    </AppShell>
  );
}
