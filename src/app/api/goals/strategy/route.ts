/**
 * POST /api/goals/strategy { goalId }
 *
 * Generates (or refreshes) the AI race strategy for one goal, grounded in the
 * athlete's current fitness. Re-running it after new training yields an updated
 * strategy — that's how it stays in sync with how the athlete is actually
 * training. One strategy per goal: an existing one is replaced.
 *
 * The taper cron (D-14 / D-3) calls the same routine automatically.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generateStrategyForGoal } from "@/lib/race-strategy";
import type { Goal } from "@/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const goalId = typeof body?.goalId === "string" ? body.goalId : null;
  if (!goalId) return NextResponse.json({ error: "Meta não informada." }, { status: 400 });

  const admin = createAdminClient();

  const { data: goal } = await admin
    .from("goals").select("*").eq("id", goalId).eq("user_id", user.id).maybeSingle();
  if (!goal) return NextResponse.json({ error: "Meta não encontrada." }, { status: 404 });

  const result = await generateStrategyForGoal(admin, user.id, goal as Goal);

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Falha ao gerar." }, { status: 422 });
  }

  return NextResponse.json({ ok: true, title: result.title, scenario: result.scenario });
}
