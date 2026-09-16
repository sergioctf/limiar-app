/**
 * Race strategy orchestration — shared by the on-demand API route and the
 * taper cron (D-14 / D-3). Gathers current fitness, asks the AI, and stores
 * one strategy per goal (replacing any previous one).
 */
import { localDateStr } from "@/lib/week";
import { generateRaceStrategy } from "@/lib/ai";
import { computeMetrics } from "@/lib/performance";
import { secondsToPaceString, secondsToReadable } from "@/lib/utils";
import type { Goal, Run } from "@/types";

type DbClient = ReturnType<typeof import("@/lib/supabase/server").createAdminClient>;

export interface StrategyResult {
  ok: boolean;
  error?: string;
  title?: string;
  scenario?: string;
  targetTimeSeconds?: number | null;
}

/** Days between today and a race date (negative once it has passed). */
export function daysUntil(raceDate: string | null): number | null {
  if (!raceDate) return null;
  const race = new Date(`${raceDate}T12:00:00`).getTime();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((race - today.getTime()) / 86400000);
}

/**
 * Generate and persist the race strategy for one goal, grounded in the
 * athlete's fitness at this moment.
 */
export async function generateStrategyForGoal(
  db: DbClient,
  userId: string,
  goal: Goal,
): Promise<StrategyResult> {
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceStr = localDateStr(since);

  const fetchLatestTest = async () => {
    try {
      const { data } = await db.from("performance_tests").select("*")
        .eq("user_id", userId).order("test_date", { ascending: false }).limit(1);
      return data?.[0] ?? null;
    } catch { return null; }
  };

  const [{ data: runs }, test] = await Promise.all([
    db.from("runs")
      .select("date, distance_km, duration_seconds, avg_pace_seconds_per_km, avg_hr, type")
      .eq("user_id", userId).is("deleted_at", null)
      .gte("date", sinceStr).order("date", { ascending: false }),
    fetchLatestTest(),
  ]);

  const runList = (runs ?? []) as Run[];

  const metrics = test
    ? computeMetrics(test.distance_km * 1000, test.time_seconds, test.avg_hr ?? undefined, test.max_hr ?? undefined)
    : null;

  // Prediction closest to the race distance
  const predicted = metrics?.predictions.length
    ? metrics.predictions.reduce((best, p) =>
        Math.abs(p.distance_km - goal.distance_km) < Math.abs(best.distance_km - goal.distance_km) ? p : best,
      )
    : null;

  // Volume over the last 4 weeks
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const fourStr = localDateStr(fourWeeksAgo);
  const recent4 = runList.filter(r => r.date >= fourStr);
  const weeklyKm = recent4.reduce((s, r) => s + r.distance_km, 0) / 4;
  const longestRecentKm = recent4.length ? Math.max(...recent4.map(r => r.distance_km)) : 0;

  const recentSummary = runList.slice(0, 10)
    .map(r => `${r.date}: ${r.distance_km.toFixed(1)}km em ${secondsToReadable(r.duration_seconds)}` +
      (r.avg_pace_seconds_per_km ? ` (${secondsToPaceString(r.avg_pace_seconds_per_km)}/km)` : ""))
    .join("\n") || "Sem corridas recentes registradas.";

  const strategy = await generateRaceStrategy({
    raceName: goal.race_name,
    distanceKm: goal.distance_km,
    raceDate: goal.race_date,
    daysOut: daysUntil(goal.race_date),
    targetTimeSeconds: goal.target_time_seconds,
    predictedTimeSeconds: predicted?.predicted_seconds ?? null,
    vdot: metrics?.vdot ?? null,
    weeklyKm,
    longestRecentKm,
    recentSummary,
  });

  if (!strategy) return { ok: false, error: "Não foi possível gerar a estratégia agora." };

  const payload = {
    user_id:                    userId,
    goal_id:                    goal.id,
    title:                      strategy.title,
    scenario:                   strategy.scenario,
    target_time_seconds:        strategy.targetTimeSeconds,
    target_pace_seconds_per_km: strategy.targetTimeSeconds
      ? Math.round(strategy.targetTimeSeconds / goal.distance_km) : null,
    strategy_text:              strategy.strategyText,
    hydration_plan:             strategy.hydrationPlan,
    gel_plan:                   strategy.gelPlan,
    splits_json:                { splits: strategy.splits },
    updated_at:                 new Date().toISOString(),
  };

  const { data: existing } = await db
    .from("race_strategies").select("id")
    .eq("user_id", userId).eq("goal_id", goal.id).limit(1);

  if (existing?.[0]?.id) {
    await db.from("race_strategies").update(payload).eq("id", existing[0].id);
  } else {
    await db.from("race_strategies").insert(payload);
  }

  return {
    ok: true,
    title: strategy.title,
    scenario: strategy.scenario,
    targetTimeSeconds: strategy.targetTimeSeconds,
  };
}
