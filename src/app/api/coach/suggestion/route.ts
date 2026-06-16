/**
 * Readiness-driven plan suggestion.
 *   GET  /api/coach/suggestion          → today's pending suggestion (creates one
 *                                          if readiness is low on a hard day), or null
 *   POST /api/coach/suggestion {action}  → "accept" (apply the lighter day to the
 *                                          weekly plan) | "dismiss"
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { computeTrainingLoad } from "@/lib/training-load";
import { computeReadiness, restingHrBaseline } from "@/lib/readiness";
import { getMondayStr, getWorkoutForDate } from "@/lib/plan-notify";
import { shouldSuggestEasing, buildReadinessSuggestion } from "@/lib/plan-suggestion";
import type { Run, WellnessData, WeeklyPlanData, WeeklyPlanDay } from "@/types";

const DAY_KEYS: WeeklyPlanDay["day"][] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Already decided today? Don't nag.
  const { data: existing } = await admin
    .from("plan_suggestions")
    .select("*")
    .eq("user_id", user.id).eq("date", today).eq("kind", "readiness_adjust")
    .maybeSingle();
  if (existing && existing.status !== "pending") return NextResponse.json({ suggestion: null });
  if (existing) return NextResponse.json({ suggestion: existing });

  // Today's planned workout
  const monday = getMondayStr(now);
  const { data: plans } = await admin
    .from("coach_reports").select("full_report, period_start")
    .eq("user_id", user.id).eq("period_type", "week").eq("period_start", monday).limit(1);
  const workout = getWorkoutForDate(admin, plans ?? [], now) as WeeklyPlanDay | null;
  if (!workout) return NextResponse.json({ suggestion: null });

  // Readiness (wellness + TSB)
  const since = new Date(); since.setDate(since.getDate() - 90);
  const [{ data: wd }, { data: wHist }, { data: loadRuns }] = await Promise.all([
    admin.from("wellness_data").select("*").eq("user_id", user.id).eq("date", today).maybeSingle(),
    admin.from("wellness_data").select("*").eq("user_id", user.id).gte("date", since.toISOString().slice(0, 10)),
    admin.from("runs").select("date, distance_km, duration_seconds, avg_pace_seconds_per_km, avg_hr")
      .eq("user_id", user.id).gte("date", since.toISOString().slice(0, 10)).is("deleted_at", null),
  ]);
  const load = computeTrainingLoad((loadRuns ?? []) as Run[], null, null, 90);
  const tsb = load.length > 0 ? load[load.length - 1].tsb : null;
  const readiness = computeReadiness({
    wellness: (wd ?? null) as WellnessData | null,
    tsb, rhrBaseline: restingHrBaseline((wHist ?? []) as WellnessData[]),
  });

  if (!shouldSuggestEasing(workout, readiness.score)) return NextResponse.json({ suggestion: null });

  const s = buildReadinessSuggestion(workout, readiness.score);
  const { data: created } = await admin
    .from("plan_suggestions")
    .upsert({
      user_id: user.id, date: today, kind: "readiness_adjust",
      reason: s.reason, message: s.message,
      original_day: workout, suggested_day: s.suggestedDay, status: "pending",
    }, { onConflict: "user_id,date,kind" })
    .select().single();

  return NextResponse.json({ suggestion: created });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = body?.action as "accept" | "dismiss" | undefined;
  if (action !== "accept" && action !== "dismiss") {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const { data: sug } = await admin
    .from("plan_suggestions").select("*")
    .eq("user_id", user.id).eq("date", today).eq("kind", "readiness_adjust").eq("status", "pending")
    .maybeSingle();
  if (!sug) return NextResponse.json({ error: "Sem sugestão pendente" }, { status: 404 });

  if (action === "accept") {
    // Apply the suggested day to today's slot in the weekly plan
    const monday = getMondayStr(now);
    const { data: plans } = await admin
      .from("coach_reports").select("id, full_report")
      .eq("user_id", user.id).eq("period_type", "week").eq("period_start", monday).limit(1);
    const report = plans?.[0];
    if (report?.full_report) {
      try {
        const plan = JSON.parse(report.full_report) as WeeklyPlanData;
        const todayKey = DAY_KEYS[now.getDay()];
        const idx = plan.days.findIndex(d => d.day === todayKey);
        if (idx >= 0) {
          plan.days[idx] = sug.suggested_day as WeeklyPlanDay;
          await admin.from("coach_reports").update({ full_report: JSON.stringify(plan) }).eq("id", report.id);
        }
      } catch {
        // plan parse failed — still mark accepted so we don't loop
      }
    }
  }

  await admin.from("plan_suggestions")
    .update({ status: action === "accept" ? "accepted" : "dismissed" })
    .eq("id", sug.id);

  return NextResponse.json({ ok: true, action });
}
