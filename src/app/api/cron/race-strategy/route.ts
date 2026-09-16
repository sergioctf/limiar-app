/**
 * GET /api/cron/race-strategy
 * Runs daily at 09:00 UTC (06:00 BRT).
 *
 * Taper checkpoints: when a race is exactly 14 or 3 days away, (re)generates
 * the race strategy from the athlete's CURRENT fitness and pushes a heads-up.
 * D-14 sets the plan while there's still time to adjust; D-3 locks in race-day
 * pacing with the taper already absorbed.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateStrategyForGoal, daysUntil } from "@/lib/race-strategy";
import { sendPushToUser } from "@/lib/push";
import type { Goal } from "@/types";
import { authorizeCron } from "@/lib/cron-auth";

export const maxDuration = 300;

/** Days before the race at which we refresh the strategy. */
const CHECKPOINTS = [14, 3];

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Upcoming goals only — a window wide enough to cover both checkpoints.
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 15);

  const { data: goals } = await admin
    .from("goals")
    .select("*")
    .gte("race_date", todayStr)
    .lte("race_date", horizon.toISOString().slice(0, 10))
    .neq("status", "cancelled")
    .neq("status", "completed");

  const results: Record<string, string> = {};

  for (const row of (goals ?? []) as Goal[]) {
    const out = daysUntil(row.race_date);
    if (out === null || !CHECKPOINTS.includes(out)) continue;

    const key = `${row.id}@D-${out}`;

    try {
      // Skip if already refreshed today (cron retries shouldn't burn tokens).
      const { data: existing } = await admin
        .from("race_strategies").select("updated_at")
        .eq("user_id", row.user_id).eq("goal_id", row.id).limit(1);

      const updatedAt = existing?.[0]?.updated_at as string | undefined;
      if (updatedAt && updatedAt.slice(0, 10) === todayStr) {
        results[key] = "already-fresh";
        continue;
      }

      const result = await generateStrategyForGoal(admin, row.user_id, row);
      if (!result.ok) { results[key] = `failed: ${result.error}`; continue; }

      const body = out === 14
        ? `Faltam 2 semanas para ${row.race_name}. Sua estratégia foi montada com seu condicionamento atual — dá tempo de ajustar.`
        : `${row.race_name} é em 3 dias. Estratégia e ritmos finais prontos: confira os splits.`;

      await sendPushToUser(admin, row.user_id, {
        title: out === 14 ? "Estratégia de prova pronta 🎯" : "Sua prova é em 3 dias 🏁",
        body,
        url:  "/goals",
        tag:  `limiar-strategy-${row.id}-${out}`,
        icon: "/limiar_icone_app.png",
      }).catch(() => {});

      results[key] = `generated (${result.scenario})`;
    } catch (err) {
      results[key] = `error: ${err instanceof Error ? err.message : "unknown"}`;
    }
  }

  return NextResponse.json({ ok: true, ran_at: now.toISOString(), checkpoints: CHECKPOINTS, results });
}
