import { describe, it, expect } from "vitest";
import { buildCycleSummary, CYCLE_DAYS, type CycleInput } from "@/lib/cycle-summary";
import type { Run, PerformanceTest } from "@/types";

const TODAY = new Date("2026-08-07T12:00:00Z");

const dayMs = 86_400_000;
const ago = (days: number) =>
  new Date(TODAY.getTime() - days * dayMs).toISOString().slice(0, 10);

const run = (daysAgo: number, km: number): Run =>
  ({ date: ago(daysAgo), distance_km: km } as Run);

const test = (daysAgo: number, vdot: number): PerformanceTest =>
  ({ test_date: ago(daysAgo), vdot } as PerformanceTest);

/** A steady quarter: one run every 3 days, plus a longer one weekly. */
function steadyRuns(days: number, km = 6, longEvery = 7, longKm = 12): Run[] {
  const out: Run[] = [];
  for (let d = 1; d <= days; d += 3) out.push(run(d, km));
  for (let d = 4; d <= days; d += longEvery) out.push(run(d, longKm));
  return out;
}

const summarize = (over: Partial<CycleInput> = {}) =>
  buildCycleSummary({ runs: [], today: TODAY, ...over });

describe("readiness", () => {
  it("says nothing when there is barely any history", () => {
    const s = summarize({ runs: [run(2, 5), run(9, 6)] });
    expect(s.ready).toBe(false);
    expect(s.headline).toBe("");
    expect(s.strengths).toEqual([]);
  });

  it("speaks up once there is a quarter worth reading", () => {
    expect(summarize({ runs: steadyRuns(CYCLE_DAYS) }).ready).toBe(true);
  });

  it("ignores runs outside the window", () => {
    const s = summarize({ runs: [...steadyRuns(CYCLE_DAYS), run(400, 42)] });
    const longest = s.stats.find(x => x.label === "Maior corrida")!;
    expect(longest.value).not.toContain("42");
  });
});

describe("headline and stats", () => {
  it("counts only what happened in the window", () => {
    const runs = [run(5, 10), run(20, 10), run(50, 10), run(70, 10), run(200, 999)];
    const s = summarize({ runs });
    expect(s.stats.find(x => x.label === "Volume")!.value).toBe("40 km");
    expect(s.stats.find(x => x.label === "Corridas")!.value).toBe("4");
  });

  it("compares against the quarter before it", () => {
    const runs = [
      ...Array.from({ length: 10 }, (_, i) => run(i * 8 + 1, 10)),   // 100 km, this quarter
      ...Array.from({ length: 10 }, (_, i) => run(CYCLE_DAYS + i * 8 + 1, 5)), // 50 km, previous
    ];
    const s = summarize({ runs });
    expect(s.stats.find(x => x.label === "Volume")!.delta).toEqual({ pct: 100, better: true });
    expect(s.headline).toContain("100% acima");
  });

  it("does not invent a comparison when there is no previous quarter", () => {
    const s = summarize({ runs: steadyRuns(60) });
    expect(s.stats.find(x => x.label === "Volume")!.delta).toBeUndefined();
    expect(s.headline).not.toContain("anterior");
  });

  it("calls a flat quarter flat", () => {
    const runs = [
      ...Array.from({ length: 10 }, (_, i) => run(i * 8 + 1, 10)),
      ...Array.from({ length: 10 }, (_, i) => run(CYCLE_DAYS + i * 8 + 1, 10)),
    ];
    expect(summarize({ runs }).headline).toContain("praticamente o mesmo");
  });
});

describe("strengths", () => {
  it("notices volume growth", () => {
    const runs = [
      ...Array.from({ length: 12 }, (_, i) => run(i * 7 + 1, 10)),
      ...Array.from({ length: 12 }, (_, i) => run(CYCLE_DAYS + i * 7 + 1, 6)),
    ];
    const titles = summarize({ runs }).strengths.map(f => f.title);
    expect(titles).toContain("Volume subindo");
  });

  it("notices consistency", () => {
    const titles = summarize({ runs: steadyRuns(CYCLE_DAYS) }).strengths.map(f => f.title);
    expect(titles).toContain("Constância");
  });

  it("notices a longer long run than last quarter", () => {
    const runs = [...steadyRuns(CYCLE_DAYS), run(CYCLE_DAYS + 10, 8)];
    const titles = summarize({ runs }).strengths.map(f => f.title);
    expect(titles).toContain("Longão mais longo");
  });

  it("notices VDOT improving, but only for a test inside the window", () => {
    const runs = steadyRuns(CYCLE_DAYS);
    const inside  = summarize({ runs, tests: [test(200, 36), test(10, 39.5)] });
    expect(inside.strengths.map(f => f.title)).toContain("VDOT em alta");

    // Both tests old: the improvement did not happen in this quarter.
    const outside = summarize({ runs, tests: [test(400, 36), test(300, 39.5)] });
    expect(outside.strengths.map(f => f.title)).not.toContain("VDOT em alta");
  });

  it("stays quiet when nothing improved", () => {
    // Same volume, one quiet week, no tests, no longer long run.
    const runs = [
      ...Array.from({ length: 8 }, (_, i) => run(i * 10 + 1, 10)),
      ...Array.from({ length: 8 }, (_, i) => run(CYCLE_DAYS + i * 10 + 1, 10)),
    ];
    expect(summarize({ runs }).strengths.map(f => f.title)).not.toContain("Volume subindo");
  });

  it("never floods the card", () => {
    expect(summarize({ runs: steadyRuns(CYCLE_DAYS) }).strengths.length).toBeLessThanOrEqual(4);
  });
});

describe("attention", () => {
  it("flags a drop in volume", () => {
    const runs = [
      ...Array.from({ length: 6 }, (_, i) => run(i * 12 + 1, 5)),
      ...Array.from({ length: 12 }, (_, i) => run(CYCLE_DAYS + i * 7 + 1, 12)),
    ];
    expect(summarize({ runs }).attention.map(f => f.title)).toContain("Volume caiu");
  });

  it("flags long gaps in the calendar", () => {
    // Six runs, all crammed into three weeks of a thirteen-week window.
    const runs = [run(1, 8), run(3, 8), run(6, 8), run(9, 8), run(12, 8), run(15, 8)];
    const titles = summarize({ runs }).attention.map(f => f.title);
    expect(titles.some(t => t.includes("semanas sem correr"))).toBe(true);
  });

  it("flags a dangerous jump between weeks", () => {
    const runs = [
      run(80, 10), run(78, 10),   // ~20 km week
      run(73, 25), run(71, 25),   // ~50 km the next — a 150% jump
      ...steadyRuns(60),
    ];
    expect(summarize({ runs }).attention.map(f => f.title)).toContain("Saltos de volume");
  });

  it("flags a missing long run", () => {
    // 30 km a week, never more than 6 km at a time.
    const runs = Array.from({ length: 45 }, (_, i) => run(i * 2 + 1, 6));
    expect(summarize({ runs }).attention.map(f => f.title)).toContain("Falta um longão");
  });

  it("flags a stale test, and the absence of one", () => {
    const runs = steadyRuns(CYCLE_DAYS);
    expect(summarize({ runs, tests: [test(120, 39)] }).attention.map(f => f.title))
      .toContain("Teste desatualizado");
    expect(summarize({ runs, tests: [] }).attention.map(f => f.title))
      .toContain("Sem teste de 3 km");
    expect(summarize({ runs, tests: [test(14, 39)] }).attention.map(f => f.title))
      .not.toContain("Teste desatualizado");
  });

  it("flags no strength work, and credits it when present", () => {
    const runs = steadyRuns(CYCLE_DAYS);
    const none = summarize({ runs, activities: [] });
    expect(none.attention.map(f => f.title)).toContain("Sem força no período");

    const lifting = Array.from({ length: 20 }, (_, i) => ({
      date: ago(i * 4 + 1), sport_type: "WeightTraining",
    }));
    const withGym = summarize({ runs, activities: lifting });
    expect(withGym.attention.map(f => f.title)).not.toContain("Sem força no período");
    expect(withGym.strengths.map(f => f.title)).toContain("Força mantida");
  });

  it("counts one lifting session per day, not one per activity", () => {
    const sameDay = [
      { date: ago(3), sport_type: "WeightTraining" },
      { date: ago(3), sport_type: "Workout" },
    ];
    const s = summarize({ runs: steadyRuns(CYCLE_DAYS), activities: sameDay });
    // Two activities on one day must not read as two sessions towards the 12 needed.
    expect(s.strengths.map(f => f.title)).not.toContain("Força mantida");
  });

  it("never floods the card", () => {
    expect(summarize({ runs: [run(1, 3), run(40, 3), run(80, 3), run(85, 3)] })
      .attention.length).toBeLessThanOrEqual(4);
  });
});

describe("every finding carries its evidence", () => {
  it("has a title and a detail, always", () => {
    const s = summarize({
      runs: steadyRuns(CYCLE_DAYS),
      tests: [test(200, 36), test(10, 39.5)],
      activities: [],
    });
    for (const f of [...s.strengths, ...s.attention]) {
      expect(f.title.length).toBeGreaterThan(3);
      expect(f.detail.length).toBeGreaterThan(20);
    }
  });

  it("writes decimals the Portuguese way, everywhere", () => {
    const s = summarize({
      runs: [...steadyRuns(CYCLE_DAYS), run(CYCLE_DAYS + 10, 8)],
      tests: [test(200, 36.2), test(10, 39.5)],
      activities: [],
    });
    const everything = [
      s.headline,
      ...s.stats.map(x => x.value),
      ...[...s.strengths, ...s.attention].map(f => `${f.title} ${f.detail}`),
    ].join(" | ");

    // No "12.8" anywhere — a decimal point in Portuguese reads as a typo.
    expect(everything).not.toMatch(/\d\.\d/);
  });

  it("reports the window it looked at", () => {
    const s = summarize({ runs: steadyRuns(CYCLE_DAYS) });
    expect(s.to).toBe("2026-08-07");
    expect(s.from < s.to).toBe(true);
  });
});
