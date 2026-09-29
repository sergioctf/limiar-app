import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { HealthScreen, type HealthScreenData } from "@/components/health/screen/HealthScreen";
import { HealthLocked } from "@/components/health/HealthLocked";
import { hasHealthDevice } from "@/lib/health-access";
import { bmrMifflin, energyForDay, calorieTarget, macrosFor, ageFromBirth, type CalorieGoal, type Sex } from "@/lib/nutrition";
import { loadRecoveryInputs } from "@/lib/recovery-load";
import {
  addDays, buildVital, buildSleepWeek, recoveryHistory, recoveryTrend,
  buildMonitor, watchWeight, checkinsAsWellness,
} from "@/lib/health-view";
import type { BodyMeasurement, HealthCheckin, Supplement } from "@/types";
import type { NutritionSummary } from "@/components/health/NutritionCard";

export const metadata = { title: "Saúde — Limiar" };

export default async function HealthPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  /*
    Sem relógio, não há Saúde — há um convite para conectar um.

    A seção inteira é feita de medições (HRV, sono, repouso, energia). Quem não
    conectou nada via um questionário manual no lugar dos sensores e um número
    de "disposição" que vinha só da carga de treino. Decisão do Sérgio, 29/09,
    depois de ver um usuário novo se perder exatamente aqui.
  */
  const admin = createAdminClient();
  const [{ data: conn }, { data: whoop }, { data: tokenRow }, { count: measured }] = await Promise.all([
    admin.from("intervals_connections").select("user_id").eq("user_id", user.id).maybeSingle(),
    admin.from("whoop_connections").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("wellness_token").eq("id", user.id).maybeSingle(),
    admin.from("wellness_data").select("date", { count: "exact", head: true })
      .eq("user_id", user.id).neq("source", "checkin"),
  ]);

  if (!hasHealthDevice({
    intervals: !!conn,
    whoop: !!whoop,
    wellnessToken: tokenRow?.wellness_token as string | null,
    measuredRows: measured ?? 0,
  })) {
    return <AppShell><HealthLocked /></AppShell>;
  }

  // Recovery comes from the loader the dashboard and the morning notification
  // use, so the number here is the number everywhere.
  const inputs = await loadRecoveryInputs(supabase, user.id);
  const { today, rows, load, recovery } = inputs;

  const [
    { data: measurements }, { data: profile }, { data: todayRuns }, { data: todayActs },
    { data: supplements }, { data: checkinRows },
  ] = await Promise.all([
    supabase.from("body_measurements").select("*").eq("user_id", user.id)
      .gte("date", addDays(today, -180)).order("date", { ascending: false }),
    supabase.from("profiles").select("height_cm, sex, birth_date, calorie_goal").eq("id", user.id).maybeSingle(),
    supabase.from("runs").select("calories").eq("user_id", user.id).eq("date", today).is("deleted_at", null),
    supabase.from("activities").select("calories").eq("user_id", user.id).eq("date", today).is("deleted_at", null),
    supabase.from("supplements").select("*").eq("user_id", user.id).eq("active", true).order("created_at"),
    supabase.from("health_checkins").select("*").eq("user_id", user.id)
      .gte("date", addDays(today, -13)).order("date", { ascending: false }),
  ]);
  const checkins = (checkinRows ?? []) as HealthCheckin[];

  // ── Devices ────────────────────────────────────────────────────────────────
  // The connection row holds an API key, so it is read with the service role and
  // only these facts leave the server.
  const { data: icu } = await createAdminClient()
    .from("intervals_connections").select("last_sync_at, last_error")
    .eq("user_id", user.id).maybeSingle();
  const watchRows = rows.filter(r => r.source !== "checkin");
  const garminNights = rows.filter(r => r.source === "intervals").length;
  const energyRow = rows.find(r => r.active_kcal != null || r.resting_kcal != null) ?? null;

  /*
   * Two versions of the screen, chosen by what the athlete actually has.
   *
   * With a watch, the night is measured and the screen leads with vitals. Without
   * one, the athlete's own answers are the only signal about the night — so the
   * check-in stops being an optional extra and becomes the heart of the screen,
   * and the sleep week is built from what they reported.
   */
  const hasWatchSource = Boolean(icu) || watchRows.some(r => r.hrv_ms != null || r.sleep_seconds != null || r.resting_hr != null);
  const sleepSource = hasWatchSource ? rows : checkinsAsWellness(checkins);

  const history = recoveryHistory(rows, load, today, 14, checkins);
  history[history.length - 1] = {
    ...history[history.length - 1],
    score: recovery.score,
    verdict: recovery.verdict,
    hasWatch: recovery.basis === "watch",
  };

  // ── Energy ─────────────────────────────────────────────────────────────────
  const body = (measurements ?? []) as BodyMeasurement[];
  /*
   * Only a weight the athlete logged drives the target.
   *
   * Garmin's daily "weight" is usually the profile setting, not a weighing:
   * Sérgio's jumped from 77 to 88 kg overnight when the new band was set up.
   * It is offered as a suggestion to confirm instead.
   */
  const weightKg = body[0]?.weight_kg ?? null;
  const watchWeightKg = watchWeight(rows, today);
  const age = profile?.birth_date ? ageFromBirth(profile.birth_date) : null;
  const goal = (profile?.calorie_goal as CalorieGoal) ?? "maintain";
  const trainingKcal = [...(todayRuns ?? []), ...(todayActs ?? [])].reduce((s, r) => s + ((r.calories as number) ?? 0), 0);

  let nutrition: NutritionSummary;
  if (weightKg && profile?.height_cm && profile?.sex && age != null) {
    const formulaBmr = bmrMifflin({ weightKg, heightCm: profile.height_cm, age, sex: profile.sex as Sex });
    const energy = energyForDay({ formulaBmr, trainingKcal, today, readings: rows });
    const target = calorieTarget(energy.tdee, goal);
    nutrition = {
      complete: true, goal,
      heightCm: profile.height_cm, sex: profile.sex as Sex, birthDate: profile.birth_date,
      weightKg, age, trainingKcal,
      bmr: energy.bmr, tdee: energy.tdee, target, macros: macrosFor(target, weightKg),
      bmrSource: energy.bmrSource, activeKcal: energy.activeKcal, activeSource: energy.activeSource,
    };
  } else {
    nutrition = {
      complete: false, goal,
      heightCm: profile?.height_cm ?? null, sex: (profile?.sex as Sex) ?? null, birthDate: profile?.birth_date ?? null,
      weightKg, age, trainingKcal, watchWeightKg,
    };
  }

  const data: HealthScreenData = {
    today,
    mode: hasWatchSource ? "watch" : "checkin",
    recovery,
    trend: recoveryTrend(history),
    history,
    vitals: [buildVital("hrv", rows, today), buildVital("rhr", rows, today), buildVital("sleep", rows, today)],
    sleep: buildSleepWeek(sleepSource, today),
    monitor: buildMonitor(rows, today),
    checkin: inputs.checkin,
    checkins,
    fitness: inputs.fitness,
    nutrition,
    garminReadiness: rows.find(r => r.date === today)?.garmin_readiness ?? null,
    // `select("*")` only carries the key once migration 031 has run; before that
    // the field stays hidden instead of offering a save that cannot succeed.
    garminReadinessAvailable: rows.some(r => "garmin_readiness" in r),
    devices: {
      garmin: icu ? { connected: true, nights: garminNights, lastSyncAt: icu.last_sync_at, lastError: icu.last_error } : { connected: false, nights: 0 },
      energyDate: energyRow?.date ?? null,
    },
  };

  return (
    <AppShell>
      <HealthScreen
        data={data}
        initialBody={body}
        initialSupplements={(supplements ?? []) as Supplement[]}
      />
    </AppShell>
  );
}
