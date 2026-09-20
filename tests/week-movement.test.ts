/**
 * "Sua semana" on the new Home: every sport, time as the common measure,
 * distance per sport, calories from the watch or the workouts.
 */
import { describe, expect, it } from "vitest";
import { formatMinutes, weekMovement } from "@/lib/week-movement";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const weekStart = "2026-09-14";
const today = "2026-09-17";
const strength = { exercises: [], estimatedMinutes: 45 } as unknown as WeeklyPlanDay["strength"];
const d = (day: WeeklyPlanDay["day"], over: Partial<WeeklyPlanDay>): WeeklyPlanDay =>
  ({ day, dayPt: day, sport: "corrida", type: "rest", label: "Descanso", description: "", ...over } as WeeklyPlanDay);
const plan: WeeklyPlanData = {
  week_start: weekStart, generated_at: "x",
  days: [
    d("Mon", { type: "easy", label: "Rodagem leve", distance_km: 6, strength }),
    d("Tue", { type: "strength", sport: "musculacao", label: "Musculação", strength }),
    d("Wed", { type: "intervals", label: "Subidas 6×45 s", distance_km: 3.5 }),
    d("Thu", { type: "strength", sport: "musculacao", label: "Musculação", strength }),
    d("Sat", { type: "long_run", label: "Longão", distance_km: 9.5 }),
  ],
};
// Sérgio's real week so far (14–17/09), plus a ride outside the plan.
const runs = [
  { id: "r1", date: "2026-09-14", distance_km: 6.01, duration_seconds: 2174, calories: 412 },
  { id: "r2", date: "2026-09-16", distance_km: 8.01, duration_seconds: 3221, calories: 509 },
];
const activities = [
  { id: "a1", date: "2026-09-14", sport_type: "WeightTraining", duration_seconds: 3137, calories: 347 },
  { id: "a2", date: "2026-09-15", sport_type: "WeightTraining", duration_seconds: 3510, calories: 322 },
  { id: "a3", date: "2026-09-16", sport_type: "Ride", duration_seconds: 3600, distance_m: 32000, calories: 600 },
];
const week = weekMovement({ weekStart, today, plan, runs, activities });

describe("the week, every sport", () => {
  it("counts every registered session and the time spent", () => {
    expect(week.sessions).toBe(5);
    expect(formatMinutes(week.minutes)).toBe("4h21");   // 36 + 54 + 52 + 59 + 60 min
  });

  it("keeps distance per sport and never adds them up", () => {
    expect(week.bySport.map(s => `${s.label}:${s.sessions}:${s.km}`)).toEqual([
      "Corrida:2:14", "Musculação:2:null", "Ciclismo:1:32",
    ]);
  });

  it("includes what was done outside the plan", () => {
    const wed = week.days.find(x => x.key === "Wed")!;
    expect(wed.done.map(x => `${x.label}:${x.planned}`)).toEqual(["Corrida:true", "Ciclismo:false"]);
  });

  it("shows what is still planned, and what was planned and did not happen", () => {
    expect(week.days.find(x => x.key === "Thu")!.upcoming.map(s => s.label)).toEqual(["Musculação"]);
    expect(week.days.find(x => x.key === "Sat")!.upcoming.map(s => s.label)).toEqual(["Longão"]);
    // Past days never show as "to do"; what did not happen shows as missed.
    expect(week.days.filter(x => x.date < today).every(x => x.upcoming.length === 0)).toBe(true);
    expect(week.days.find(x => x.key === "Mon")!.missed).toEqual([]);          // run and lifting both done
    expect(week.days.find(x => x.key === "Wed")!.missed).toEqual([]);
  });

  it("counts days trained against days planned", () => {
    // Trained Mon, Tue, Wed (a ride on Wednesday too); planned Mon, Tue, Wed, Thu, Sat.
    expect(week.trainedDays).toBe(3);
    expect(week.plannedDays).toBe(5);
  });

  it("counts sessions apart from days, because Monday asks for two", () => {
    // Five planned days, six planned sessions: Monday carries a run and the gym.
    expect(week.plannedSessions).toBe(6);
    expect(week.days.find(x => x.key === "Mon")!.plannedSessions).toBe(2);
    expect(week.days.find(x => x.key === "Tue")!.plannedSessions).toBe(1);
    expect(week.days.find(x => x.key === "Fri")!.plannedSessions).toBe(0);
  });

  it("names a planned session that a past day did not get", () => {
    const later = weekMovement({ weekStart, today: "2026-09-19", plan, runs, activities });
    expect(later.days.find(x => x.key === "Thu")!.missed.map(s => s.label)).toEqual(["Musculação"]);
  });
});

describe("calories", () => {
  it("adds what the workouts recorded when the watch sent nothing", () => {
    expect(week.calories).toEqual({ kcal: 412 + 347 + 322 + 509 + 600, source: "treinos" });
  });

  it("prefers the watch's active energy for the days it arrived", () => {
    const w = weekMovement({ weekStart, today, plan, runs, activities, wellness: [
      { date: "2026-09-14", active_kcal: 1100 }, { date: "2026-09-15", active_kcal: 900 },
    ] });
    expect(w.calories).toEqual({ kcal: 1100 + 900 + 509 + 600, source: "misto" });
  });

  it("says nothing rather than zero when there is nothing to count", () => {
    expect(weekMovement({ weekStart, today, plan, runs: [], activities: [] }).calories).toBeNull();
  });
});
