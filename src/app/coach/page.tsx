import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AppShell }     from "@/components/layout/AppShell";
import { CoachContent } from "@/components/coach/CoachContent";
import type { PerformanceTest } from "@/types";

export default async function CoachPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const admin = createAdminClient();

  // Fetch performance_tests with graceful fallback if table doesn't exist yet
  async function fetchTests(): Promise<PerformanceTest[]> {
    try {
      const { data, error } = await admin
        .from("performance_tests")
        .select("*")
        .eq("user_id", user!.id)
        .order("test_date", { ascending: false });

      if (error) {
        console.warn("[CoachPage] performance_tests query error:", error.message);
        return [];
      }
      return (data ?? []) as PerformanceTest[];
    } catch (err) {
      console.warn("[CoachPage] performance_tests fetch failed:", err);
      return [];
    }
  }

  const [{ data: reports }, { data: cycles }, tests] = await Promise.all([
    admin
      .from("coach_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("report_date", { ascending: false }),
    admin
      .from("training_cycles")
      .select("*")
      .eq("user_id", user.id)
      .order("start_date"),
    fetchTests(),
  ]);

  return (
    <AppShell>
      <CoachContent
        reports={reports ?? []}
        cycles={cycles ?? []}
        tests={tests}
      />
    </AppShell>
  );
}
