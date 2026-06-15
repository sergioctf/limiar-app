/**
 * Nutrition math — BMR (Mifflin-St Jeor), TDEE and race/long-run fueling.
 * Deterministic; no I/O.
 */

export type Sex = "M" | "F";
export type CalorieGoal = "maintain" | "cut" | "gain";

export interface NutritionProfile {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}

/** Mifflin-St Jeor basal metabolic rate (kcal/day). */
export function bmrMifflin(p: NutritionProfile): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return Math.round(p.sex === "M" ? base + 5 : base - 161);
}

/**
 * TDEE for the day = BMR × sedentary base (1.2, excludes sport) + the day's
 * actual training calories (from Strava). This avoids double-counting that a
 * fixed "activity multiplier" would introduce.
 */
export function tdeeForDay(bmr: number, trainingKcal: number): number {
  return Math.round(bmr * 1.2 + trainingKcal);
}

const GOAL_ADJUST: Record<CalorieGoal, number> = {
  maintain: 0,
  cut: -400,    // ~0.4 kg/week deficit, safe for runners
  gain: +300,
};

export function calorieTarget(tdee: number, goal: CalorieGoal): number {
  return Math.round(tdee + GOAL_ADJUST[goal]);
}

/** Macro split tuned for an endurance athlete (higher carb). */
export interface Macros { carbs_g: number; protein_g: number; fat_g: number; }

export function macrosFor(targetKcal: number, weightKg: number): Macros {
  // Protein 1.8 g/kg, fat ~25% of kcal, carbs fill the rest.
  const protein_g = Math.round(1.8 * weightKg);
  const fat_g = Math.round((targetKcal * 0.25) / 9);
  const remaining = targetKcal - (protein_g * 4 + fat_g * 9);
  const carbs_g = Math.max(0, Math.round(remaining / 4));
  return { carbs_g, protein_g, fat_g };
}

export function ageFromBirth(birthDate: string): number | null {
  const b = new Date(`${birthDate}T12:00:00`);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

// ─── Fueling for long runs / races ────────────────────────────────────────────

export interface FuelingPlan {
  durationMin: number;
  carbsPerHourG: number;     // recommended intake rate
  totalCarbsG: number;
  gels: number;              // ~25 g carbs each
  waterMl: number;           // ~500-750 ml/h
  needsFuel: boolean;        // only matters > 75 min
}

/**
 * Carb/water guidance for a session of a given duration and intensity.
 * Based on standard endurance fueling (30-60 g/h easy, up to 90 g/h race).
 */
export function fuelingPlan(durationMin: number, intensity: "easy" | "race" = "easy"): FuelingPlan {
  const needsFuel = durationMin > 75;
  const carbsPerHourG = !needsFuel ? 0 : intensity === "race" ? 75 : 50;
  const hours = durationMin / 60;
  const totalCarbsG = Math.round(carbsPerHourG * hours);
  return {
    durationMin,
    carbsPerHourG,
    totalCarbsG,
    gels: Math.round(totalCarbsG / 25),
    waterMl: Math.round(hours * 600),
    needsFuel,
  };
}
