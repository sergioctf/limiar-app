/**
 * GET /api/runs/[id]/execution
 *
 * What was prescribed for this run's day, against what was actually run.
 *
 * Reads the splits already cached in `run_streams` — the athlete has usually
 * opened "Splits por km" first, and if not, the streams route fills the cache.
 * Nothing here calls Strava.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { analyzeExecution } from "@/lib/workout-execution";
import { loadWeeklyPlan, mondayOf } from "@/lib/weekly-plan";
import type { KmSplit } from "@/lib/run-streams";
import type { WeeklyPlanDay } from "@/types";

const DAY_KEYS: WeeklyPlanDay["day"][] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: run } = await admin
    .from("runs").select("id, user_id, date, distance_km, type")
    .eq("id", params.id).maybeSingle();

  if (!run || run.user_id !== user.id) {
    return NextResponse.json({ error: "Corrida não encontrada" }, { status: 404 });
  }

  // Cached splits — the streams route is what populates this.
  let splits: KmSplit[] = [];
  try {
    const { data } = await admin
      .from("run_streams").select("analysis").eq("run_id", run.id).maybeSingle();
    splits = (data?.analysis?.splits ?? []) as KmSplit[];
  } catch {
    return NextResponse.json({ available: false, reason: "no_storage" });
  }

  if (splits.length === 0) {
    return NextResponse.json({ available: false, reason: "no_splits" });
  }

  // The prescription for the day this run happened on.
  const runDate = new Date(`${run.date}T12:00:00`);
  const weekStart = mondayOf(runDate);
  const { plan } = await loadWeeklyPlan(admin, user.id, weekStart)
    .catch(() => ({ plan: null }));

  const dayKey = DAY_KEYS[runDate.getDay()];
  const planned = plan?.days?.find(d => d.day === dayKey) ?? null;

  if (!planned || planned.type === "rest") {
    return NextResponse.json({
      available: false,
      reason: planned ? "rest_day" : "no_plan",
      // An unplanned run is still worth seeing — just without a comparison.
      analysis: analyzeExecution(null, splits),
    });
  }

  return NextResponse.json({
    available: true,
    planned: {
      label: planned.label,
      type: planned.type,
      distance_km: planned.distance_km,
      pace: planned.pace,
      description: planned.description,
    },
    analysis: analyzeExecution(planned, splits),
  });
}
