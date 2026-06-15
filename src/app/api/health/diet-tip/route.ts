/**
 * GET /api/health/diet-tip
 * Contextual nutrition tip from the AI, based on today's planned workout and
 * the user's calorie goal/target.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generateDietTip } from "@/lib/ai";
import { getMondayStr, getWorkoutForDate } from "@/lib/plan-notify";
import { bmrMifflin, tdeeForDay, calorieTarget, macrosFor, ageFromBirth, type CalorieGoal, type Sex } from "@/lib/nutrition";
import type { WeeklyPlanDay } from "@/types";

export const maxDuration = 30;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Profile + latest weight
  const [{ data: profile }, { data: weights }] = await Promise.all([
    admin.from("profiles").select("height_cm, sex, birth_date, calorie_goal").eq("id", user.id).maybeSingle(),
    admin.from("body_measurements").select("weight_kg").eq("user_id", user.id).order("date", { ascending: false }).limit(1),
  ]);

  const weightKg = weights?.[0]?.weight_kg as number | undefined;
  const age = profile?.birth_date ? ageFromBirth(profile.birth_date) : null;
  if (!weightKg || !profile?.height_cm || !profile?.sex || age == null) {
    return NextResponse.json({ error: "Complete altura, sexo, nascimento e registre seu peso primeiro." }, { status: 400 });
  }

  // Today's training calories (runs + activities)
  const [{ data: runs }, { data: acts }] = await Promise.all([
    admin.from("runs").select("calories").eq("user_id", user.id).eq("date", today).is("deleted_at", null),
    admin.from("activities").select("calories").eq("user_id", user.id).eq("date", today).is("deleted_at", null),
  ]);
  const trainingKcal = [...(runs ?? []), ...(acts ?? [])].reduce((s, r) => s + (r.calories ?? 0), 0);

  // Today's planned workout (for context)
  const { data: plans } = await admin
    .from("coach_reports").select("full_report, period_start")
    .eq("user_id", user.id).eq("period_type", "week").eq("period_start", getMondayStr(now)).limit(1);
  const workout = getWorkoutForDate(admin, plans ?? [], now) as WeeklyPlanDay | null;
  const workoutStr = workout
    ? (workout.type === "rest" ? "Descanso" : `${workout.label}${workout.distance_km ? ` ${workout.distance_km}km` : ""}`)
    : (trainingKcal > 0 ? "Treino realizado" : "Sem treino previsto");

  const goal = (profile.calorie_goal as CalorieGoal) ?? "maintain";
  const bmr = bmrMifflin({ weightKg, heightCm: profile.height_cm, age, sex: profile.sex as Sex });
  const tdee = tdeeForDay(bmr, trainingKcal);
  const target = calorieTarget(tdee, goal);
  const macros = macrosFor(target, weightKg);

  const tip = await generateDietTip(workoutStr, goal, target, macros.carbs_g);
  if (!tip) return NextResponse.json({ error: "IA indisponível agora — tente novamente." }, { status: 502 });

  return NextResponse.json({ tip, context: { workout: workoutStr, target, carbs_g: macros.carbs_g } });
}
