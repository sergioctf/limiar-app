/**
 * Adherence when the session was not the one prescribed.
 *
 * A substitution declared after the run is neither a session skipped nor the
 * plan carried out. Before this, the check-in wrote the executed distance onto
 * the plan day, so 8 km run in place of a 3,5 km hill session came back as
 * 100% adherence to a plan that had asked for something else.
 */
import { describe, expect, it } from "vitest";
import { computeWeekAdherence } from "@/lib/plan-adherence";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const weekStart = "2026-09-14";            // Monday
const wednesday = "2026-09-16";

const hills: WeeklyPlanDay = {
  day: "Wed", dayPt: "Quarta", sport: "corrida", type: "intervals",
  label: "Subidas 6×45 s", distance_km: 3.5, description: "", quality: "hills",
};
const easy: WeeklyPlanDay = {
  day: "Mon", dayPt: "Segunda", sport: "corrida", type: "easy",
  label: "Leve", distance_km: 6, description: "",
};

const plan = (wed: WeeklyPlanDay): WeeklyPlanData =>
  ({ week_start: weekStart, generated_at: "x", days: [{ ...easy }, wed] });

const adapted = (verdict?: "equivalent" | "partial" | "different"): WeeklyPlanDay => ({
  ...hills,
  adaptation: {
    when: "after", at: "2026-09-16T12:00:00Z", reason: null, source: "custom",
    text: "8x400m", preserves: "", changes: "", verdict,
    doneLabel: "Adaptado: 8×400 m", doneKm: 8, original: hills,
  },
});

// The whole week is in the past, so every planned day is scored.
const runs = [
  { date: "2026-09-14", distance_km: 6, duration_seconds: 2220, moving_time_seconds: 2220 },
  { date: wednesday, distance_km: 8, duration_seconds: 2640, moving_time_seconds: 2640 },
];

describe("a session replaced after the fact", () => {
  it("is not a missed session", () => {
    const week = computeWeekAdherence(weekStart, plan(adapted("different")), runs, [])!;
    const wed = week.days.find(d => d.day === "Wed")!;
    expect(wed.status).toBe("adapted");
    expect(week.missedCount).toBe(0);
    expect(week.adaptedCount).toBe(1);
  });

  it("does not turn 8 km into 8 km of the plan", () => {
    const week = computeWeekAdherence(weekStart, plan(adapted("different")), runs, [])!;
    const wed = week.days.find(d => d.day === "Wed")!;
    expect(wed.planned.distance_km).toBe(3.5);      // the prescription, untouched
    expect(wed.actualKm).toBe(8);                   // what was done, beside it
  });

  it("counts a swap that kept the purpose as the session done, and one that did not as half", () => {
    const kept = computeWeekAdherence(weekStart, plan(adapted("equivalent")), runs, [])!;
    const changed = computeWeekAdherence(weekStart, plan(adapted("different")), runs, [])!;
    expect(kept.score).toBe(100);                   // Monday done + Wednesday adapted keeping the purpose
    expect(changed.score).toBe(75);                 // the same week when the swap changed the purpose
  });

  it("still reads a session agreed before the run as the day's prescription", () => {
    const agreed: WeeklyPlanDay = {
      ...hills, label: "Tiros curtos 6×200 m", distance_km: 4,
      adaptation: {
        when: "before", at: "x", reason: "place", source: "option",
        preserves: "", changes: "", original: hills,
      },
    };
    const week = computeWeekAdherence(weekStart, plan(agreed), runs, [])!;
    expect(week.days.find(d => d.day === "Wed")!.status).toBe("done");
    expect(week.adaptedCount).toBe(0);
  });

  it("does not mark a day adapted when nothing was run", () => {
    const week = computeWeekAdherence(weekStart, plan(adapted("equivalent")), runs.slice(0, 1), [])!;
    expect(week.days.find(d => d.day === "Wed")!.status).toBe("missed");
  });
});
