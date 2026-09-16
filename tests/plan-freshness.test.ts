import { describe, it, expect } from "vitest";
import {
  planFingerprint, planStaleness, PLAN_ENGINE_VERSION,
  type PlanInputs,
} from "@/lib/plan-freshness";
import { normalizePrefs } from "@/lib/workout-builder";
import { normalizeStrengthPrefs } from "@/lib/strength-prefs";

const base = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  vdot: 39.5,
  lthr: 166,
  prefs: normalizePrefs({
    runDays: ["Mon", "Wed", "Sat"], strengthDays: ["Tue", "Thu"],
    longRunDay: "Sat", qualityPerWeek: 1,
  }),
  sports: ["corrida", "musculacao"],
  strengthPrefs: normalizeStrengthPrefs({
    goal: "suporte", equipment: ["academia"],
    days: [{ day: "Tue", muscles: ["quadriceps", "gluteo"] }],
  }),
  ...over,
});

const fpOf = (over: Partial<PlanInputs> = {}) => planFingerprint(base(over));

describe("planFingerprint", () => {
  it("is stable for the same configuration", () => {
    expect(fpOf()).toEqual(fpOf());
  });

  it("carries the engine version", () => {
    expect(fpOf().engine).toBe(PLAN_ENGINE_VERSION);
  });

  it("ignores float noise in VDOT", () => {
    // Recomputing the same test can move the last decimals; that is not a
    // reason to tell someone their plan is out of date.
    expect(fpOf({ vdot: 39.5 }).fitness).toBe(fpOf({ vdot: 39.5001 }).fitness);
  });

  it("notices a real change in fitness", () => {
    expect(fpOf({ vdot: 42 }).fitness).not.toBe(fpOf().fitness);
    expect(fpOf({ lthr: 172 }).fitness).not.toBe(fpOf().fitness);
  });

  it("does not care what order the days were saved in", () => {
    const a = fpOf({ prefs: normalizePrefs({ runDays: ["Mon", "Wed", "Sat"], strengthDays: ["Tue"] }) });
    const b = fpOf({ prefs: normalizePrefs({ runDays: ["Sat", "Mon", "Wed"], strengthDays: ["Tue"] }) });
    expect(a.week).toBe(b.week);
  });

  it("notices a moved running day", () => {
    const moved = fpOf({ prefs: normalizePrefs({ runDays: ["Mon", "Wed", "Sun"], strengthDays: ["Tue", "Thu"] }) });
    expect(moved.week).not.toBe(fpOf().week);
  });

  it("notices the tier-2 schedule changing", () => {
    const withYoga = fpOf({
      prefs: normalizePrefs({
        runDays: ["Mon", "Wed", "Sat"], strengthDays: ["Tue", "Thu"],
        otherDays: { yoga: ["Fri"] },
      }),
    });
    expect(withYoga.sports).not.toBe(fpOf().sports);
  });

  it("notices a sport being added", () => {
    expect(fpOf({ sports: ["corrida", "musculacao", "ciclismo"] }).sports).not.toBe(fpOf().sports);
  });

  it("notices the strength configuration changing", () => {
    const other = fpOf({
      strengthPrefs: normalizeStrengthPrefs({
        goal: "hipertrofia", equipment: ["halteres"],
        days: [{ day: "Tue", muscles: ["peito"] }],
      }),
    });
    expect(other.strength).not.toBe(fpOf().strength);
  });

  it("keeps each input in its own slot", () => {
    // A change in fitness must not disturb the week hash, or the message would
    // blame the wrong thing.
    const fitter = fpOf({ vdot: 45 });
    const now = fpOf();
    expect(fitter.week).toBe(now.week);
    expect(fitter.sports).toBe(now.sports);
    expect(fitter.strength).toBe(now.strength);
  });
});

describe("planStaleness", () => {
  it("is fresh when nothing moved", () => {
    const s = planStaleness(fpOf(), fpOf());
    expect(s.stale).toBe(false);
    expect(s.reasons).toEqual([]);
  });

  it("treats a plan with no fingerprint as stale", () => {
    // Every plan generated before this check exists carries the old pace table.
    const s = planStaleness(null, fpOf());
    expect(s.stale).toBe(true);
    expect(s.reasons).toEqual(["engine"]);
  });

  it("flags an engine bump even when the athlete changed nothing", () => {
    const old = { ...fpOf(), engine: PLAN_ENGINE_VERSION - 1 };
    const s = planStaleness(old, fpOf());
    expect(s.stale).toBe(true);
    expect(s.reasons).toContain("engine");
    expect(s.message).toMatch(/ritmos/i);
  });

  it("names a new test", () => {
    const s = planStaleness(fpOf(), fpOf({ vdot: 42 }));
    expect(s.reasons).toEqual(["fitness"]);
    expect(s.message).toBe("Você registrou um teste novo.");
  });

  it("joins several reasons under one subject", () => {
    const before = fpOf();
    const after = fpOf({
      vdot: 42,
      prefs: normalizePrefs({ runDays: ["Mon", "Tue", "Sat"], strengthDays: ["Thu"] }),
    });
    const s = planStaleness(before, after);
    expect(s.reasons).toEqual(["fitness", "week"]);
    // Not "você registrou … e você mudou …".
    expect(s.message).toBe("Você registrou um teste novo e mudou os dias da sua semana.");
  });

  it("separates what the app changed from what the athlete changed", () => {
    const s = planStaleness(
      { ...fpOf(), engine: PLAN_ENGINE_VERSION - 1 },
      fpOf({ vdot: 42 }),
    );
    expect(s.message).toBe(
      "O cálculo dos ritmos de treino foi corrigido. Você também registrou um teste novo.",
    );
  });

  it("uses commas before the final 'e' for three or more", () => {
    const s = planStaleness(
      fpOf(),
      fpOf({
        vdot: 42,
        sports: ["corrida"],
        prefs: normalizePrefs({ runDays: ["Mon", "Tue"], strengthDays: ["Thu"] }),
      }),
    );
    expect(s.message.match(/ e /g)?.length).toBe(1);
    expect(s.message).toContain(",");
  });

  it("survives a fingerprint stored by an older, smaller shape", () => {
    const s = planStaleness({ engine: PLAN_ENGINE_VERSION }, fpOf());
    expect(s.stale).toBe(true);
    expect(s.reasons).not.toContain("engine");
  });
});

describe("excluding a session type", () => {
  const base = { vdot: 43.7, lthr: 165, sports: ["corrida" as const], strengthPrefs: normalizeStrengthPrefs({}) };
  const prefs = normalizePrefs({ runDays: ["Tue", "Thu", "Sat"], strengthDays: ["Mon"] });

  it("does not mark every existing plan stale for athletes who excluded nothing", () => {
    const before = planFingerprint({ ...base, prefs: { ...prefs, excludedQuality: undefined } });
    const after = planFingerprint({ ...base, prefs: { ...prefs, excludedQuality: [] } });
    expect(after.week).toBe(before.week);
  });

  it("marks the plan stale when the athlete opts out of hills", () => {
    const before = planFingerprint({ ...base, prefs });
    const after = planFingerprint({ ...base, prefs: { ...prefs, excludedQuality: ["hills"] } });
    expect(after.week).not.toBe(before.week);
  });

  it("keeps only known, excludable kinds", () => {
    expect(normalizePrefs({ runDays: ["Tue"], excludedQuality: ["hills", "intervals", "nonsense"] }).excludedQuality).toEqual(["hills"]);
  });
});
