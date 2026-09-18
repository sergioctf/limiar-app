/**
 * One definition of "treino feito", session by session, for every screen.
 */
import { describe, expect, it } from "vitest";
import { dayStatus, mainSessionDone, plannedSessionsOf } from "@/lib/day-status";
import { buildToday } from "@/lib/today";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const date = "2026-09-15";
const strength = { exercises: [], estimatedMinutes: 45 } as unknown as WeeklyPlanDay["strength"];
const runDay: WeeklyPlanDay = { day: "Tue", dayPt: "Terça", sport: "corrida", type: "easy", label: "Rodagem leve", distance_km: 7, description: "" };
const runAndLift: WeeklyPlanDay = { ...runDay, strength };
const liftDay: WeeklyPlanDay = { day: "Tue", dayPt: "Terça", sport: "musculacao", type: "strength", label: "Musculação", description: "", strength };
const run = { id: "r1", date, distance_km: 7.02, duration_seconds: 2600, moving_time_seconds: 2520, calories: 480, name: "Corrida matinal" };
const lift = { id: "a1", date, sport_type: "WeightTraining", duration_seconds: 3510, calories: 322 };
const ride = { id: "a2", date, sport_type: "Ride", duration_seconds: 3600, distance_m: 32000, calories: 600 };

describe("the sessions a day asks for", () => {
  it("reads a run with lifting as two sessions, the run first", () => {
    expect(plannedSessionsOf(runAndLift).map(s => `${s.sport}:${s.detail}`)).toEqual(["corrida:7 km", "musculacao:45 min"]);
  });
  it("reads a rest day as nothing to do", () => {
    expect(plannedSessionsOf({ ...runDay, type: "rest" })).toEqual([]);
  });
});

describe("done means every session has something that counts for it", () => {
  it("finishes a lifting-only day with the lifting", () => {
    const s = dayStatus({ date, planned: liftDay, runs: [], activities: [lift] });
    expect(s.allDone).toBe(true);
    expect(mainSessionDone(s)).toBe(true);
  });

  it("does not finish a run + lifting day after the run alone", () => {
    const s = dayStatus({ date, planned: runAndLift, runs: [run], activities: [] });
    expect(s.sessions.map(x => x.done)).toEqual([true, false]);
    expect(s.allDone).toBe(false);
    expect(mainSessionDone(s)).toBe(true);       // the run — the part recovery cares about — is done
  });

  it("lists what was done outside the plan as extra, not as the planned session", () => {
    const s = dayStatus({ date, planned: runDay, runs: [run], activities: [ride] });
    expect(s.done.map(d => `${d.sport}:${d.planned}`)).toEqual(["corrida:true", "ciclismo:false"]);
    expect(s.done.find(d => d.sport === "ciclismo")!.km).toBe(32);
  });

  it("keeps each sport's own numbers", () => {
    const s = dayStatus({ date, planned: runAndLift, runs: [run], activities: [lift] });
    expect(s.done.map(d => ({ sport: d.sport, minutes: d.minutes, km: d.km, kcal: d.kcal }))).toEqual([
      { sport: "corrida", minutes: 42, km: 7.02, kcal: 480 },
      { sport: "musculacao", minutes: 59, km: null, kcal: 322 },
    ]);
  });

  it("ignores a watch left running", () => {
    const forgotten = { id: "r2", date, distance_km: 0.24, duration_seconds: 4107, moving_time_seconds: 102, elapsed_time_seconds: 4107 };
    expect(dayStatus({ date, planned: runDay, runs: [forgotten], activities: [] }).allDone).toBe(false);
  });
});

describe("the Hoje card uses it", () => {
  const plan: WeeklyPlanData = { week_start: "2026-09-14", generated_at: "x", days: [liftDay] };
  const base = { plan, today: date, weekStart: "2026-09-14", hasTest: true };

  it("marks a lifting day done once the lifting is registered", () => {
    expect(buildToday({ ...base, runs: [], activities: [lift] }).state).toBe("done");
    expect(buildToday({ ...base, runs: [], activities: [] }).state).toBe("planned");
  });

  it("keeps a run + lifting day open until both happened", () => {
    const both: WeeklyPlanData = { ...plan, days: [runAndLift] };
    expect(buildToday({ ...base, plan: both, runs: [run], activities: [] }).state).toBe("planned");
    expect(buildToday({ ...base, plan: both, runs: [run], activities: [lift] }).state).toBe("done");
  });
});
