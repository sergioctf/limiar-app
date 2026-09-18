/**
 * Everything needed to adapt a session of the current week, loaded once.
 *
 * Shared by "Adaptar este treino" and by the coach's check before today's
 * session ("prefiro uma versão mais curta"), so both build alternatives from
 * the same prescription, phase, paces and volume ceilings.
 */
import { createAdminClient } from "@/lib/supabase/server";
import type { AdaptContext } from "@/lib/session-adapt";
import { mondayOf, phaseForRace } from "@/lib/weekly-plan";
import { computeMetrics } from "@/lib/performance";
import { cyclePosition } from "@/lib/mesocycle";
import { normalizePrefs } from "@/lib/workout-builder";
import { dayKeyOf } from "@/lib/session-swap";
import { athleteDateStr } from "@/lib/week";
import type { WeeklyPlanData } from "@/types";

export async function loadAdaptContext(userId: string) {
  const admin = createAdminClient();
  const now = new Date();
  const monday = mondayOf(now);
  const [reports, tests, profile, first, races] = await Promise.all([
    admin.from("coach_reports").select("id, full_report")
      .eq("user_id", userId).eq("period_type", "week").eq("period_start", monday).limit(1),
    admin.from("performance_tests").select("distance_km, time_seconds, avg_hr, max_hr")
      .eq("user_id", userId).order("test_date", { ascending: false }).limit(1),
    admin.from("profiles").select("training_prefs").eq("id", userId).maybeSingle(),
    admin.from("runs").select("date").eq("user_id", userId).is("deleted_at", null)
      .order("date", { ascending: true }).limit(1),
    admin.from("races").select("race_date").eq("user_id", userId)
      .gt("race_date", monday).is("time_seconds", null)
      .order("race_date", { ascending: true }).limit(1),
  ]);
  const row = reports.data?.[0];
  if (!row?.full_report) return null;
  let plan: WeeklyPlanData;
  try { plan = JSON.parse(row.full_report as string) as WeeklyPlanData; } catch { return null; }
  if (!Array.isArray(plan.days)) return null;

  const test = tests.data?.[0];
  const metrics = test
    ? computeMetrics(Number(test.distance_km) * 1000, Number(test.time_seconds), test.avg_hr ?? undefined, test.max_hr ?? undefined)
    : null;
  const prefs = normalizePrefs(profile.data?.training_prefs);
  // The week's volume as prescribed, before any adaptation changed a day.
  const weeklyKm = plan.days
    .map(d => d.adaptation?.original ?? d)
    .filter(d => d.sport === "corrida" || (!d.sport && (d.distance_km ?? 0) > 0))
    .reduce((sum, d) => sum + (d.distance_km ?? 0), 0);
  const cycle = cyclePosition(monday, first.data?.[0]?.date ?? null);
  const ctx: AdaptContext = {
    weeklyKm: Math.max(8, weeklyKm),
    paces: metrics?.paces ?? null,
    lthr: metrics?.lthr ?? null,
    cycleWeek: cycle.week,
    cycleNumber: cycle.cycle,
    excludedQuality: prefs.excludedQuality ?? [],
    minRunKm: prefs.minRunKm ?? 5,
    // The phase the week was built in — not an assumed "base". Older plans
    // carry no phase, so it is recomputed from the next race, as the plan did.
    phase: plan.phase ?? phaseForRace((races.data?.[0]?.race_date as string | undefined) ?? null, monday),
  };
  return { admin, reportId: row.id as string, plan, ctx, todayKey: dayKeyOf(athleteDateStr(now)) };
}
