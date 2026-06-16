import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { HealthContent } from "@/components/health/HealthContent";
import { bmrMifflin, tdeeForDay, calorieTarget, macrosFor, ageFromBirth, type CalorieGoal, type Sex } from "@/lib/nutrition";
import { computeTrainingLoad } from "@/lib/training-load";
import { computeReadiness, restingHrBaseline } from "@/lib/readiness";
import type { HealthCheckin, BodyMeasurement, Run, WellnessData } from "@/types";
import type { NutritionSummary } from "@/components/health/NutritionCard";

export const metadata = { title: "Saúde — Limiar" };

export default async function HealthPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const bodySince = new Date();
  bodySince.setDate(bodySince.getDate() - 180);
  const today = new Date().toISOString().slice(0, 10);

  const loadSince = new Date();
  loadSince.setDate(loadSince.getDate() - 90);

  const [{ data: checkins }, { data: measurements }, { data: profile }, { data: runs }, { data: acts }, { data: loadRuns }] = await Promise.all([
    supabase.from("health_checkins").select("*").eq("user_id", user.id)
      .gte("date", since.toISOString().slice(0, 10)).order("date", { ascending: false }),
    supabase.from("body_measurements").select("*").eq("user_id", user.id)
      .gte("date", bodySince.toISOString().slice(0, 10)).order("date", { ascending: false }),
    supabase.from("profiles").select("height_cm, sex, birth_date, calorie_goal").eq("id", user.id).maybeSingle(),
    supabase.from("runs").select("calories").eq("user_id", user.id).eq("date", today).is("deleted_at", null),
    supabase.from("activities").select("calories").eq("user_id", user.id).eq("date", today).is("deleted_at", null),
    supabase.from("runs").select("date, distance_km, duration_seconds, avg_pace_seconds_per_km, avg_hr")
      .eq("user_id", user.id).gte("date", loadSince.toISOString().slice(0, 10)).is("deleted_at", null),
  ]);

  const { data: wellness } = await supabase.from("wellness_data").select("*")
    .eq("user_id", user.id).gte("date", since.toISOString().slice(0, 10)).order("date", { ascending: false });
  const wellnessRows = (wellness ?? []) as WellnessData[];
  const todayWellness = wellnessRows.find(wd => wd.date === today) ?? null;

  const allCheckins = (checkins ?? []) as HealthCheckin[];
  const todayCheckin = allCheckins.find(c => c.date === today) ?? null;

  // Readiness (Limiar Score) = TSB + today's check-in
  let tsb: number | null = null;
  try {
    const load = computeTrainingLoad((loadRuns ?? []) as Run[], null, null, 90);
    tsb = load.length > 0 ? load[load.length - 1].tsb : null;
  } catch { tsb = null; }
  const readiness = computeReadiness({
    wellness: todayWellness,
    checkin: todayCheckin,
    tsb,
    rhrBaseline: restingHrBaseline(wellnessRows),
  });

  const body = (measurements ?? []) as BodyMeasurement[];
  const weightKg = body[0]?.weight_kg ?? null;
  const age = profile?.birth_date ? ageFromBirth(profile.birth_date) : null;
  const goal = (profile?.calorie_goal as CalorieGoal) ?? "maintain";
  const trainingKcal = [...(runs ?? []), ...(acts ?? [])].reduce((s, r) => s + ((r.calories as number) ?? 0), 0);

  const complete = !!(weightKg && profile?.height_cm && profile?.sex && age != null);
  let nutrition: NutritionSummary;
  if (complete) {
    const bmr = bmrMifflin({ weightKg: weightKg!, heightCm: profile!.height_cm, age: age!, sex: profile!.sex as Sex });
    const tdee = tdeeForDay(bmr, trainingKcal);
    const target = calorieTarget(tdee, goal);
    nutrition = {
      complete: true,
      goal,
      heightCm: profile!.height_cm, sex: profile!.sex as Sex, birthDate: profile!.birth_date,
      weightKg: weightKg!, age: age!, trainingKcal,
      bmr, tdee, target, macros: macrosFor(target, weightKg!),
    };
  } else {
    nutrition = {
      complete: false, goal,
      heightCm: profile?.height_cm ?? null, sex: (profile?.sex as Sex) ?? null, birthDate: profile?.birth_date ?? null,
      weightKg, age, trainingKcal,
    };
  }

  return (
    <AppShell>
      <HealthContent
        initialCheckins={allCheckins}
        initialBody={body}
        nutrition={nutrition}
        readiness={readiness}
      />
    </AppShell>
  );
}
