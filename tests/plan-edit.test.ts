import { describe, it, expect } from "vitest";
import { normalizePlanEdits, applyPlanEdits, diffPlans } from "@/lib/plan-edit";
import { buildWeekPlan } from "@/lib/workout-builder";
import { weekContext, PREFS_3_DAYS } from "./fixtures";
import { normalizeStrengthPrefs } from "@/lib/strength-prefs";
import { normalizePrefs } from "@/lib/workout-builder";
import { expandToKmSplits } from "@/lib/workout-builder";
import type { WeeklyPlanData } from "@/types";

/**
 * The chat told the athlete *"Atualizado o longão de sábado para 8 km"* and
 * changed nothing: the model wrote a confirmation without returning a plan, and
 * the app relayed it. These tests exist so a confirmation can only ever
 * describe an edit that really applied.
 */
function plan(): WeeklyPlanData {
  return {
    week_start: "2026-08-03",
    days: buildWeekPlan(weekContext({ weeklyKm: 40 }), ["corrida"], PREFS_3_DAYS),
    generated_at: "2026-08-03T00:00:00.000Z",
  };
}

describe("normalizePlanEdits", () => {
  it("accepts the four supported edits", () => {
    expect(normalizePlanEdits([
      { kind: "set_distance", day: "Sat", km: 8 },
      { kind: "set_rest", day: "Thu" },
      { kind: "swap_days", a: "Wed", b: "Sat" },
      { kind: "scale_week", factor: 1.2 },
    ])).toHaveLength(4);
  });

  it("drops anything malformed rather than guessing", () => {
    expect(normalizePlanEdits([
      { kind: "set_distance", day: "Funday", km: 8 },
      { kind: "set_distance", day: "Sat", km: -3 },
      { kind: "set_distance", day: "Sat", km: 900 },
      { kind: "swap_days", a: "Sat", b: "Sat" },
      { kind: "scale_week", factor: 12 },
      { kind: "delete_everything" },
      "nonsense",
      null,
    ])).toEqual([]);
  });

  it("handles a model that returns no edits at all", () => {
    expect(normalizePlanEdits(undefined)).toEqual([]);
    expect(normalizePlanEdits("update the plan")).toEqual([]);
  });
});

describe("applyPlanEdits", () => {
  it("changes the distance the athlete asked about", () => {
    const p = plan();
    const before = p.days.find(d => d.type === "long_run")!;
    const r = applyPlanEdits(p, [{ kind: "set_distance", day: before.day, km: 8 }]);

    expect(r.plan.days.find(d => d.day === before.day)!.distance_km).toBe(8);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toContain("8 km");
  });

  it("rescales the structure, so the watch guides the new distance", () => {
    const p = plan();
    const long = p.days.find(d => d.type === "long_run")!;
    const r = applyPlanEdits(p, [{ kind: "set_distance", day: long.day, km: 8 }]);
    const after = r.plan.days.find(d => d.day === long.day)!;

    const total = expandToKmSplits(after.structure!).length;
    expect(total).toBeGreaterThanOrEqual(7);
    expect(total).toBeLessThanOrEqual(9);
  });

  it("rewrites the distance quoted in the description", () => {
    const p = plan();
    const long = p.days.find(d => d.type === "long_run")!;
    const r = applyPlanEdits(p, [{ kind: "set_distance", day: long.day, km: 8 }]);
    const after = r.plan.days.find(d => d.day === long.day)!;
    expect(after.description).not.toContain(`${long.distance_km} km`);
  });

  it("reports nothing changed when the day already has that distance", () => {
    const p = plan();
    const long = p.days.find(d => d.type === "long_run")!;
    const r = applyPlanEdits(p, [{ kind: "set_distance", day: long.day, km: long.distance_km! }]);
    expect(r.changes).toEqual([]);
    expect(r.rejected[0]).toMatch(/já está/i);
  });

  it("refuses to set a distance on a rest day, and says why", () => {
    const p = plan();
    const rest = p.days.find(d => d.type === "rest")!;
    const r = applyPlanEdits(p, [{ kind: "set_distance", day: rest.day, km: 10 }]);
    expect(r.changes).toEqual([]);
    expect(r.rejected[0]).toMatch(/não é um dia de corrida/i);
  });

  it("turns a day into rest", () => {
    const p = plan();
    const run = p.days.find(d => d.type === "easy")!;
    const r = applyPlanEdits(p, [{ kind: "set_rest", day: run.day }]);
    expect(r.plan.days.find(d => d.day === run.day)!.type).toBe("rest");
    expect(r.changes[0]).toMatch(/descanso/i);
  });

  it("swaps two days, keeping each day's own name", () => {
    const p = plan();
    const [a, b] = [p.days.find(d => d.type === "intervals")!, p.days.find(d => d.type === "long_run")!];
    const r = applyPlanEdits(p, [{ kind: "swap_days", a: a.day, b: b.day }]);

    expect(r.plan.days.find(d => d.day === a.day)!.type).toBe("long_run");
    expect(r.plan.days.find(d => d.day === b.day)!.type).toBe("intervals");
    // The label of the weekday itself must not travel with the session.
    expect(r.plan.days.find(d => d.day === a.day)!.dayPt).toBe(a.dayPt);
  });

  it("scales the whole week and reports the totals", () => {
    const p = plan();
    const before = p.days.reduce((s, d) => s + (d.distance_km ?? 0), 0);
    const r = applyPlanEdits(p, [{ kind: "scale_week", factor: 1.2 }]);
    const after = r.plan.days.reduce((s, d) => s + (d.distance_km ?? 0), 0);

    expect(after).toBeGreaterThan(before);
    expect(r.changes[0]).toMatch(/Volume da semana/);
  });

  it("never mutates the plan it was given", () => {
    const p = plan();
    const snapshot = JSON.stringify(p);
    applyPlanEdits(p, [{ kind: "scale_week", factor: 1.5 }]);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it("applies several edits in one message", () => {
    const p = plan();
    const long = p.days.find(d => d.type === "long_run")!;
    const easy = p.days.find(d => d.type === "easy")!;
    const r = applyPlanEdits(p, [
      { kind: "set_distance", day: long.day, km: 8 },
      { kind: "set_distance", day: easy.day, km: 6 },
    ]);
    expect(r.changes).toHaveLength(2);
  });

  it("returns an empty change list for an empty edit list", () => {
    expect(applyPlanEdits(plan(), []).changes).toEqual([]);
  });
});

describe("move_session — o ajuste extraordinário", () => {
  /**
   * The real morning this was built for: run in the morning, lifting in the
   * afternoon, the athlete slept through the run and did the lifting. They want
   * the run on Tuesday and everything else exactly where it was — and nothing
   * about next week should change.
   */
  function planWithBoth(): WeeklyPlanData {
    const strengthPrefs = normalizeStrengthPrefs({
      goal: "hipertrofia", equipment: ["academia"],
      days: [
        { day: "Mon", muscles: ["peito", "core"] },
        { day: "Thu", muscles: ["costas", "biceps"] },
      ],
    });
    const prefs = normalizePrefs({ runDays: ["Mon", "Wed", "Sat"], qualityPerWeek: 1 });
    return {
      week_start: "2026-08-03",
      days: buildWeekPlan(weekContext({ weeklyKm: 40 }), ["corrida", "musculacao"], prefs, strengthPrefs),
      generated_at: "2026-08-03T00:00:00.000Z",
    };
  }

  it("moves the run and leaves the lifting behind", () => {
    const p = planWithBoth();
    const mon = p.days.find(d => d.day === "Mon")!;
    expect(mon.distance_km).toBeGreaterThan(0);
    expect(mon.strength).toBeDefined();

    const r = applyPlanEdits(p, [{ kind: "move_session", from: "Mon", to: "Tue", session: "corrida" }]);
    const newMon = r.plan.days.find(d => d.day === "Mon")!;
    const newTue = r.plan.days.find(d => d.day === "Tue")!;

    expect(newTue.distance_km).toBe(mon.distance_km);
    expect(newMon.strength, "a musculação de segunda ficou onde estava").toBeDefined();
    expect(newMon.distance_km, "a corrida saiu de segunda").toBeUndefined();
    expect(newTue.strength, "a musculação não foi junto").toBeUndefined();
  });

  it("carries the workout structure with the run", () => {
    const p = planWithBoth();
    const wed = p.days.find(d => d.day === "Wed")!;
    const r = applyPlanEdits(p, [{ kind: "move_session", from: "Wed", to: "Fri", session: "corrida" }]);
    const fri = r.plan.days.find(d => d.day === "Fri")!;
    expect(fri.structure).toEqual(wed.structure);
    expect(fri.pace).toBe(wed.pace);
  });

  it("leaves a rest day behind when there was nothing else", () => {
    const p = planWithBoth();
    const r = applyPlanEdits(p, [{ kind: "move_session", from: "Sat", to: "Sun", session: "corrida" }]);
    expect(r.plan.days.find(d => d.day === "Sat")!.type).toBe("rest");
    expect(r.plan.days.find(d => d.day === "Sun")!.type).toBe("long_run");
  });

  it("exchanges them when both days already have a run", () => {
    const p = planWithBoth();
    const mon = p.days.find(d => d.day === "Mon")!;
    const sat = p.days.find(d => d.day === "Sat")!;
    const r = applyPlanEdits(p, [{ kind: "move_session", from: "Mon", to: "Sat", session: "corrida" }]);

    expect(r.plan.days.find(d => d.day === "Sat")!.type).toBe(mon.type);
    expect(r.plan.days.find(d => d.day === "Mon")!.type).toBe(sat.type);
    // Monday's lifting stays on Monday through the exchange.
    expect(r.plan.days.find(d => d.day === "Mon")!.strength).toBeDefined();
  });

  it("moves the lifting on its own", () => {
    const p = planWithBoth();
    const r = applyPlanEdits(p, [{ kind: "move_session", from: "Mon", to: "Tue", session: "musculacao" }]);
    expect(r.plan.days.find(d => d.day === "Tue")!.strength).toBeDefined();
    expect(r.plan.days.find(d => d.day === "Mon")!.strength).toBeUndefined();
    // The run stays put.
    expect(r.plan.days.find(d => d.day === "Mon")!.distance_km).toBeGreaterThan(0);
  });

  it("refuses to stack two lifting sessions on one day, and says why", () => {
    const p = planWithBoth();
    const r = applyPlanEdits(p, [{ kind: "move_session", from: "Mon", to: "Thu", session: "musculacao" }]);
    expect(r.changes).toEqual([]);
    expect(r.rejected[0]).toMatch(/já tem musculação/i);
  });

  it("refuses to move a run from a day that has none", () => {
    const p = planWithBoth();
    const r = applyPlanEdits(p, [{ kind: "move_session", from: "Sun", to: "Tue", session: "corrida" }]);
    expect(r.changes).toEqual([]);
    expect(r.rejected[0]).toMatch(/não há corrida/i);
  });

  it("keeps the week's total volume unchanged", () => {
    const p = planWithBoth();
    const before = p.days.reduce((s, d) => s + (d.distance_km ?? 0), 0);
    const r = applyPlanEdits(p, [{ kind: "move_session", from: "Mon", to: "Tue", session: "corrida" }]);
    const after = r.plan.days.reduce((s, d) => s + (d.distance_km ?? 0), 0);
    expect(after).toBe(before);
  });

  it("rejects a move to the same day", () => {
    expect(normalizePlanEdits([{ kind: "move_session", from: "Mon", to: "Mon", session: "corrida" }])).toEqual([]);
  });

  it("rejects an unknown session type", () => {
    expect(normalizePlanEdits([{ kind: "move_session", from: "Mon", to: "Tue", session: "natacao" }])).toEqual([]);
  });
});

describe("diffPlans", () => {
  it("reports what really differs between two versions", () => {
    const p = plan();
    const long = p.days.find(d => d.type === "long_run")!;
    const r = applyPlanEdits(p, [{ kind: "set_distance", day: long.day, km: 8 }]);

    const d = diffPlans(p, r.plan);
    expect(d).toHaveLength(1);
    expect(d[0]).toContain("8");
  });

  it("says nothing when nothing changed", () => {
    const p = plan();
    expect(diffPlans(p, p)).toEqual([]);
  });
});
