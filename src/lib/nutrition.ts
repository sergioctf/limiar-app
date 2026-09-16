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

/** The watch's energy readings for one day, as stored in `wellness_data`. */
export interface EnergyReading {
  date: string;
  active_kcal?: number | null;
  resting_kcal?: number | null;
}

export interface DayEnergy {
  bmr: number;
  bmrSource: "watch" | "formula";
  /** Energy above basal counted into the day. */
  activeKcal: number;
  activeSource: "watch" | "estimate";
  tdee: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The day's energy, measured where the watch measured it and estimated where it
 * did not.
 *
 * **Basal.** The watch's resting energy for a *finished* day is its own basal
 * estimate, built from the athlete's heart rate rather than from a population
 * formula. Today's reading is useless for this — at 8 am it holds eight hours
 * of a twenty-four hour number — so only earlier days count, and only readings
 * within a plausible band of the formula: a shortcut that ran at breakfast
 * leaves a day holding a third of its basal, and that must not become the
 * athlete's metabolism. The median of the last two weeks, so one odd day moves
 * nothing.
 *
 * **Active.** The old model allowed 20% of basal for ordinary movement plus the
 * training Strava recorded. That allowance stays as the floor, because the
 * watch's active energy accumulates through the day and in the morning is
 * nearly zero — a target that starts low and climbs by dinner would be useless
 * at breakfast. Once the watch has measured *more* than the allowance — a long
 * walk, a day on foot — the measurement wins. Taking the larger of the two also
 * avoids counting the run twice, since the watch's figure already includes it.
 *
 * With no watch data at all this reduces exactly to `tdeeForDay`.
 */
export function energyForDay(input: {
  formulaBmr: number;
  trainingKcal: number;
  today: string;
  readings?: EnergyReading[];
}): DayEnergy {
  const { formulaBmr, trainingKcal, today } = input;
  const readings = input.readings ?? [];

  const since = new Date(`${today}T12:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 14);
  const sinceStr = since.toISOString().slice(0, 10);

  const basalDays = readings
    .filter(r => r.date < today && r.date >= sinceStr)
    .map(r => Number(r.resting_kcal))
    .filter(v => Number.isFinite(v) && v >= formulaBmr * 0.75 && v <= formulaBmr * 1.5);

  const bmr = basalDays.length > 0 ? Math.round(median(basalDays)) : formulaBmr;
  const bmrSource = basalDays.length > 0 ? "watch" : "formula";

  const estimate = bmr * 0.2 + trainingKcal;
  const measured = Number(readings.find(r => r.date === today)?.active_kcal);
  const watchWins = Number.isFinite(measured) && measured > estimate;

  const activeKcal = Math.round(watchWins ? measured : estimate);
  return {
    bmr,
    bmrSource,
    activeKcal,
    activeSource: watchWins ? "watch" : "estimate",
    tdee: Math.round(bmr + activeKcal),
  };
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
