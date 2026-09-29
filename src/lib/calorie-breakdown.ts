/**
 * Where a day's calories actually went.
 *
 * The dashboard shows one number. That number is the sum of a run whose burn
 * Strava measured and a gym session whose burn we estimated from duration — and
 * presenting them identically is what makes an estimate look like a fact. So
 * every line carries how it was obtained, and the UI says so.
 */
import { trainingSeconds } from "@/lib/run-time";
import { activityCalories, toSportKey, SPORTS, type SportKey } from "@/lib/sports";

export interface CalorieLine {
  name:     string;
  sport:    SportKey | null;
  /** Emoji for the sport, or a neutral marker when it cannot be classified. */
  emoji:    string;
  kcal:     number;
  /** `medido` came from the device; `estimado` is a MET calculation. */
  source:   "medido" | "estimado";
  /** Distance in km or duration in minutes — whatever the sport is measured by. */
  detail?:  string;
}

export interface CalorieDay {
  total:      number;
  lines:      CalorieLine[];
  /** True when any line is an estimate — the UI has to disclose it. */
  hasEstimate: boolean;
}

interface RunRow {
  name?: string | null;
  distance_km?: number | null;
  duration_seconds?: number | null;
  calories?: number | null;
}

interface ActivityRow {
  name?: string | null;
  sport_type?: string | null;
  duration_seconds?: number | null;
  calories?: number | null;
}

const minutes = (s?: number | null) => (s && s > 0 ? `${Math.round(s / 60)} min` : undefined);

/**
 * Build the day's breakdown from both tables.
 *
 * Runs and activities are stored separately, and a day can hold both — the
 * athlete who runs in the morning and lifts at lunch has one of each. Rows
 * that burned nothing are dropped rather than listed as "0 kcal", which reads
 * as a broken record rather than an absent one.
 */
export function calorieBreakdown(
  runs: RunRow[],
  activities: ActivityRow[],
  weightKg?: number | null,
): CalorieDay {
  const lines: CalorieLine[] = [];

  for (const r of runs) {
    const measured = r.calories && r.calories > 0 ? r.calories : null;
    const kcal = measured ?? activityCalories(
      { sport_type: "Run", duration_seconds: trainingSeconds({ ...r, duration_seconds: r.duration_seconds ?? 0 }), calories: null }, weightKg,
    );
    if (kcal <= 0) continue;
    lines.push({
      name:   r.name?.trim() || "Corrida",
      sport:  "corrida",
      emoji:  SPORTS.corrida.emoji,
      kcal,
      source: measured ? "medido" : "estimado",
      detail: r.distance_km ? `${r.distance_km} km` : minutes(trainingSeconds({ ...r, duration_seconds: r.duration_seconds ?? 0 })),
    });
  }

  for (const a of activities) {
    const kcal = activityCalories(a, weightKg);
    if (kcal <= 0) continue;
    const sport = toSportKey(a.sport_type);
    lines.push({
      name:   a.name?.trim() || (sport ? SPORTS[sport].label : "Atividade"),
      sport,
      emoji:  sport ? SPORTS[sport].emoji : "•",
      kcal,
      source: a.calories && a.calories > 0 ? "medido" : "estimado",
      detail: minutes(a.duration_seconds),
    });
  }

  // Biggest burn first: the athlete opened this to find out what cost the most.
  lines.sort((x, y) => y.kcal - x.kcal);

  return {
    total: lines.reduce((s, l) => s + l.kcal, 0),
    lines,
    hasEstimate: lines.some(l => l.source === "estimado"),
  };
}
