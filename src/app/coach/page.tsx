import { localDateStr } from "@/lib/week";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AppShell }     from "@/components/layout/AppShell";
import { CoachContent } from "@/components/coach/CoachContent";
import { computeAdherenceHistory } from "@/lib/plan-adherence";
import { loadActiveMacroPlan } from "@/lib/macro-plan";
import { normalizePrefs } from "@/lib/workout-builder";
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

  // Treze semanas de corridas e atividades — a adesão usa ~5.
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 91);
  const sinceStr = localDateStr(windowStart);

  const [{ data: reports }, tests, { data: recentRuns }, { data: recentActivities }] = await Promise.all([
    admin
      .from("coach_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("report_date", { ascending: false }),
    fetchTests(),
    admin
      .from("runs")
      .select("id, date, name, distance_km, duration_seconds, moving_time_seconds, elapsed_time_seconds, avg_pace_seconds_per_km, avg_hr, calories, type")
      .eq("user_id", user.id)
      .gte("date", sinceStr)
      .is("deleted_at", null),
    // Duração, distância e nome entram porque a semana agora mostra o que foi
    // **feito** ao lado do que foi previsto — ver `day-progress.ts`.
    admin
      .from("activities")
      .select("id, date, sport_type, name, duration_seconds, distance_m, calories")
      .eq("user_id", user.id)
      .gte("date", sinceStr)
      .is("deleted_at", null),
  ]);

  type RunRow = {
    id: string; date: string; name: string | null; distance_km: number; duration_seconds: number;
    moving_time_seconds: number | null; elapsed_time_seconds: number | null;
    avg_pace_seconds_per_km: number | null; avg_hr: number | null; calories: number | null; type: string;
  };
  type ActivityRow = {
    id: string; date: string; sport_type: string; name: string | null;
    duration_seconds: number | null; distance_m: number | null; calories: number | null;
  };
  const runRows = (recentRuns ?? []) as RunRow[];
  const activityRows = (recentActivities ?? []) as ActivityRow[];

  const weeklyReports = ((reports ?? []) as Array<{ period_type: string; period_start: string | null; full_report: string | null }>)
    .filter(r => r.period_type === "week");
  const adherenceHistory = computeAdherenceHistory(weeklyReports, runRows, activityRows, 4);

  /*
    O que foi feito nesta semana e na passada.

    A semana na tela precisa saber o que já aconteceu — "Registrado", "1 de 2",
    "Sem registro" —, e a passada entra porque a segunda-feira de hoje ainda
    olha para trás quando o atleta abre o Treinador no domingo à noite.
  */
  const weekWindowStart = new Date();
  weekWindowStart.setDate(weekWindowStart.getDate() - ((weekWindowStart.getDay() + 6) % 7) - 7);
  const weekSince = localDateStr(weekWindowStart);
  const doneRuns = runRows.filter(r => r.date >= weekSince);
  const doneActivities = activityRows.filter(a => a.date >= weekSince);

  // Long-term macro plan + actual km per week (for progress display)
  const macroPlan = await loadActiveMacroPlan(admin, user.id).catch(() => null);

  // Em que unidade este atleta lê o plano — km ou minutos (`src/lib/measure.ts`).
  const { data: perfil } = await admin
    .from("profiles").select("training_prefs").eq("id", user.id).maybeSingle();
  const { measureBy } = normalizePrefs((perfil as { training_prefs?: unknown } | null)?.training_prefs);
  const weeklyActualKm: Record<string, number> = {};
  for (const r of runRows) {
    const d = new Date(`${r.date}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const mon = localDateStr(d);
    weeklyActualKm[mon] = (weeklyActualKm[mon] ?? 0) + r.distance_km;
  }

  return (
    <AppShell>
      <CoachContent
        reports={reports ?? []}
        tests={tests}
        adherenceHistory={adherenceHistory}
        macroPlan={macroPlan}
        weeklyActualKm={weeklyActualKm}
        doneRuns={doneRuns}
        doneActivities={doneActivities}
        measureBy={measureBy}
      />
    </AppShell>
  );
}
