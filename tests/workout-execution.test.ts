import { describe, it, expect } from "vitest";
import { analyzeExecution, parsePaceRange, executionPattern, splitConsistency } from "@/lib/workout-execution";
import { buildWeekPlan, expandToKmSplits } from "@/lib/workout-builder";
import { weekContext, PREFS_3_DAYS } from "./fixtures";
import type { KmSplit as ActualSplit } from "@/lib/run-streams";
import type { WeeklyPlanDay } from "@/types";

/**
 * One actual kilometre, as the Strava stream analysis produces it.
 *
 * `pausedSec` defaults to zero — an unpaused kilometre — so the existing cases
 * keep meaning what they meant. Pass it to build a split that was interrupted;
 * the point of the moving-time work is that doing so must NOT change the pace.
 */
const km = (
  n: number, paceSec: number, hr: number | null = null, distanceKm = 1, pausedSec = 0,
): ActualSplit => {
  const durationSec = Math.round(paceSec * distanceKm);
  return {
    km: n, distanceKm, durationSec,
    elapsedSec: durationSec + pausedSec,
    pausedSec,
    paceSecPerKm: paceSec, avgHr: hr, elevGainM: 0, fastest: false,
  } as ActualSplit;
};

/** The engine's own easy run, so prescription and comparison never drift apart. */
function plannedEasy(): WeeklyPlanDay {
  const plan = buildWeekPlan(weekContext({ weeklyKm: 40 }), ["corrida"], PREFS_3_DAYS);
  return plan.find(d => d.type === "easy")!;
}
function plannedQuality(): WeeklyPlanDay {
  const plan = buildWeekPlan(weekContext({ weeklyKm: 60 }), ["corrida"], PREFS_3_DAYS);
  return plan.find(d => d.type === "intervals" || d.type === "tempo")!;
}

describe("parsePaceRange", () => {
  it("reads a two-sided range", () => {
    expect(parsePaceRange("4:17–4:30/km")).toEqual({ fastSec: 257, slowSec: 270 });
  });

  it("accepts a plain hyphen as well as an en-dash", () => {
    expect(parsePaceRange("5:00-5:20/km")).toEqual({ fastSec: 300, slowSec: 320 });
  });

  it("turns a single value into a band, since nobody holds a pace to the second", () => {
    const r = parsePaceRange("4:00/km")!;
    expect(r.fastSec).toBeLessThan(240);
    expect(r.slowSec).toBeGreaterThan(240);
  });

  it("returns nothing for the uncalibrated placeholder", () => {
    expect(parsePaceRange("—")).toBeNull();
    expect(parsePaceRange(undefined)).toBeNull();
    expect(parsePaceRange("")).toBeNull();
  });
});

describe("comparing against the prescription", () => {
  const planned = plannedEasy();
  const target = parsePaceRange(planned.pace)!;
  const inside = Math.round((target.fastSec + target.slowSec) / 2);

  it("marks kilometres inside the band as on target", () => {
    const a = analyzeExecution(planned, [km(1, inside), km(2, inside), km(3, inside)]);
    expect(a.kms.every(k => k.verdict === "dentro")).toBe(true);
    expect(a.onTargetPct).toBe(1);
  });

  it("marks a fast kilometre and says by how much", () => {
    const a = analyzeExecution(planned, [km(1, target.fastSec - 40), km(2, inside)]);
    expect(a.kms[0].verdict).toBe("rapido");
    expect(a.kms[0].deltaSec).toBeLessThan(0);
  });

  it("marks a slow kilometre", () => {
    const a = analyzeExecution(planned, [km(1, target.slowSec + 40), km(2, inside)]);
    expect(a.kms[0].verdict).toBe("lento");
    expect(a.kms[0].deltaSec).toBeGreaterThan(0);
  });

  it("tolerates small wobble rather than crying wolf on GPS noise", () => {
    const a = analyzeExecution(planned, [km(1, target.fastSec - 5), km(2, target.slowSec + 5)]);
    expect(a.kms.every(k => k.verdict === "dentro")).toBe(true);
  });

  it("compares nothing when the plan has no targets yet", () => {
    const bare = buildWeekPlan(weekContext({ paces: null, lthr: null }), ["corrida"], PREFS_3_DAYS)
      .find(d => d.type === "easy")!;
    const a = analyzeExecution(bare, [km(1, 300), km(2, 300)]);
    expect(a.kms.every(k => k.verdict === "sem_alvo")).toBe(true);
    expect(a.onTargetPct).toBeNull();
    expect(a.uncalibrated).toBe(true);
  });

  it("still reports the run when there was no plan at all", () => {
    const a = analyzeExecution(null, [km(1, 300), km(2, 305)]);
    expect(a.kms).toHaveLength(2);
    expect(a.onTargetPct).toBeNull();
    expect(a.uncalibrated).toBe(false);
  });

  it("survives an empty run without throwing", () => {
    const a = analyzeExecution(planned, []);
    expect(a.kms).toEqual([]);
    expect(a.findings).toEqual([]);
  });
});

describe("saiu rápido demais", () => {
  const planned = plannedEasy();

  it("catches a run whose second half fell apart", () => {
    const a = analyzeExecution(planned, [
      km(1, 300), km(2, 302), km(3, 340), km(4, 355),
    ]);
    expect(a.findings.map(f => f.key)).toContain("saiu_rapido");
    expect(a.splitDeltaSec).toBeGreaterThan(0);
  });

  it("escalates when the collapse is severe", () => {
    const mild = analyzeExecution(planned, [km(1, 300), km(2, 300), km(3, 325), km(4, 328)]);
    const bad  = analyzeExecution(planned, [km(1, 300), km(2, 300), km(3, 360), km(4, 380)]);
    expect(mild.findings.find(f => f.key === "saiu_rapido")!.severity).toBe("atencao");
    expect(bad.findings.find(f => f.key === "saiu_rapido")!.severity).toBe("alerta");
  });

  it("praises a negative split instead of staying silent", () => {
    const a = analyzeExecution(planned, [km(1, 340), km(2, 338), km(3, 320), km(4, 315)]);
    const f = a.findings.find(x => x.key === "negative_split");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("boa");
  });

  it("says nothing about pacing on a run too short to judge", () => {
    const a = analyzeExecution(planned, [km(1, 300), km(2, 360)]);
    expect(a.findings.map(f => f.key)).not.toContain("saiu_rapido");
    expect(a.splitDeltaSec).toBeNull();
  });

  it("does not call a fartlek a fade", () => {
    // A real unplanned run: steady, then alternating hard and easy. The half
    // comparison read "second half 47s/km slower" and blamed a fast start.
    const a = analyzeExecution(null, [
      km(1, 322), km(2, 321), km(3, 319), km(4, 368), km(5, 310), km(6, 393), km(7, 314),
    ]);
    expect(a.splitDeltaSec).toBeNull();
    expect(a.findings.map(f => f.key)).not.toContain("saiu_rapido");
  });

  it("still catches a genuine fade, which drifts one way", () => {
    const a = analyzeExecution(null, [
      km(1, 300), km(2, 305), km(3, 315), km(4, 330), km(5, 345), km(6, 360),
    ]);
    expect(a.findings.map(f => f.key)).toContain("saiu_rapido");
  });
});

describe("splitConsistency", () => {
  it("is total for a run that drifts one way", () => {
    expect(splitConsistency([300, 305, 315, 330, 345, 360])).toBe(1);
  });

  it("is low for a run that alternates", () => {
    expect(splitConsistency([300, 380, 305, 390, 300, 385])!).toBeLessThan(0.7);
  });

  it("survives one interrupted kilometre in the middle", () => {
    // 6:07 · 6:06 · 7:02 · 5:37 · 5:17 · 5:38 — a real negative split with a
    // traffic light in it. Classifying by spread alone threw this away.
    expect(splitConsistency([367, 366, 422, 337, 317, 338])).toBe(1);
  });

  it("says nothing on a run too short to judge", () => {
    expect(splitConsistency([300, 400])).toBeNull();
  });
});

describe("a rodagem leve corrida forte", () => {
  const planned = plannedEasy();
  const target = parsePaceRange(planned.pace)!;

  it("is the finding, even though the session was completed", () => {
    const fast = target.fastSec - 45;
    const a = analyzeExecution(planned, [km(1, fast), km(2, fast), km(3, fast), km(4, fast)]);
    const f = a.findings.find(x => x.key === "rodagem_forte");
    expect(f).toBeDefined();
    expect(f!.detail).toMatch(/recupera[çc]/i);
  });

  it("stays quiet when the easy run was actually easy", () => {
    const mid = Math.round((target.fastSec + target.slowSec) / 2);
    const a = analyzeExecution(planned, [km(1, mid), km(2, mid), km(3, mid), km(4, mid)]);
    expect(a.findings.map(f => f.key)).not.toContain("rodagem_forte");
  });
});

describe("tiros", () => {
  const planned = plannedQuality();

  /**
   * Build the actual run from the prescription itself, so the hard kilometres
   * line up with the ones the plan marked hard. Hand-written split arrays drift
   * out of sync with the engine the moment the session shape changes.
   */
  function runQuality(hardPaces: (i: number) => number): ActualSplit[] {
    const prescribed = expandToKmSplits(planned.structure!);
    let hardIndex = 0;
    return prescribed.map((p, i) => {
      const isHard = p.intensity === "I" || p.intensity === "T" || p.intensity === "R";
      const pace = isHard ? hardPaces(hardIndex++) : 400;
      return km(i + 1, pace);
    });
  }

  it("flags a series that faded", () => {
    const a = analyzeExecution(planned, runQuality(i => 250 + i * 15));
    const f = a.findings.find(x => x.key === "tiros_desabaram");
    expect(f).toBeDefined();
    expect(f!.detail).toMatch(/primeiro/i);
  });

  it("praises an even series", () => {
    const a = analyzeExecution(planned, runQuality(i => 262 + (i % 2) * 2));
    expect(a.findings.map(f => f.key)).toContain("tiros_uniformes");
  });

  it("does not read the cool-down as falling apart", () => {
    // Every interval session ends slower than it started. Judging first half
    // against second half would flag a perfectly executed workout.
    const a = analyzeExecution(planned, runQuality(() => 262));
    expect(a.splitDeltaSec).toBeNull();
    expect(a.findings.map(f => f.key)).not.toContain("saiu_rapido");
  });
});

describe("volume", () => {
  const planned = plannedEasy();

  it("notices a session cut short", () => {
    const a = analyzeExecution(planned, [km(1, 380), km(2, 380)]);
    expect(a.findings.map(f => f.key)).toContain("encurtou");
    expect(a.completionPct!).toBeLessThan(0.85);
  });

  it("notices a session that ran well past the plan", () => {
    const long = Array.from({ length: 20 }, (_, i) => km(i + 1, 380));
    const a = analyzeExecution(planned, long);
    expect(a.findings.map(f => f.key)).toContain("passou_do_previsto");
  });

  it("reports both distances so the athlete can see the gap", () => {
    const a = analyzeExecution(planned, [km(1, 380), km(2, 380), km(3, 380, null, 0.4)]);
    expect(a.actualKm).toBeCloseTo(2.4, 1);
    expect(a.prescribedKm).toBe(planned.distance_km);
  });
});

describe("heart rate", () => {
  const planned = plannedEasy();
  const target = parsePaceRange(planned.pace)!;
  const mid = Math.round((target.fastSec + target.slowSec) / 2);

  it("flags high HR at the right pace — heat or fatigue, not lost fitness", () => {
    const hi = (planned.structure!.blocks[0] as { hr?: { max: number } }).hr!.max + 20;
    const a = analyzeExecution(planned, [km(1, mid, hi), km(2, mid, hi), km(3, mid, hi), km(4, mid, hi)]);
    const f = a.findings.find(x => x.key === "fc_alta_no_ritmo");
    expect(f).toBeDefined();
    expect(f!.detail).toMatch(/calor|sono|fadiga/i);
  });

  it("says nothing when heart rate matches the effort", () => {
    const ok = (planned.structure!.blocks[0] as { hr?: { min: number } }).hr!.min + 3;
    const a = analyzeExecution(planned, [km(1, mid, ok), km(2, mid, ok), km(3, mid, ok), km(4, mid, ok)]);
    expect(a.findings.map(f => f.key)).not.toContain("fc_alta_no_ritmo");
  });
});

describe("positive feedback", () => {
  it("says the session was run right when it was", () => {
    const planned = plannedEasy();
    const target = parsePaceRange(planned.pace)!;
    const mid = Math.round((target.fastSec + target.slowSec) / 2);
    // Cover the prescribed distance — a short run is a different finding.
    const n = Math.round(planned.distance_km!);
    const a = analyzeExecution(planned, Array.from({ length: n }, (_, i) => km(i + 1, mid + (i % 2) * 3)));
    expect(a.findings.map(f => f.key)).toContain("no_alvo");
  });

  it("does not congratulate a run that also has a problem", () => {
    const planned = plannedEasy();
    const target = parsePaceRange(planned.pace)!;
    const mid = Math.round((target.fastSec + target.slowSec) / 2);
    // On target overall, but the second half collapsed.
    const a = analyzeExecution(planned, [km(1, mid - 5), km(2, mid), km(3, mid + 30), km(4, mid + 35)]);
    const keys = a.findings.map(f => f.key);
    if (keys.includes("saiu_rapido")) expect(keys).not.toContain("no_alvo");
  });
});

describe("executionPattern", () => {
  const planned = plannedEasy();
  const fastStart = () => analyzeExecution(planned, [km(1, 300), km(2, 302), km(3, 345), km(4, 360)]);
  const clean = () => {
    const t = parsePaceRange(planned.pace)!;
    const mid = Math.round((t.fastSec + t.slowSec) / 2);
    return analyzeExecution(planned, [km(1, mid), km(2, mid), km(3, mid), km(4, mid)]);
  };

  it("stays silent until there is enough evidence", () => {
    expect(executionPattern([fastStart(), fastStart()])).toBeNull();
  });

  it("names a habit once it repeats", () => {
    const p = executionPattern([fastStart(), fastStart(), fastStart(), clean()]);
    expect(p).toMatchObject({ key: "saiu_rapido", count: 3, total: 4 });
  });

  it("does not call an occasional bad day a habit", () => {
    expect(executionPattern([fastStart(), clean(), clean(), clean(), clean()])).toBeNull();
  });

  it("ignores runs it could not compare, rather than counting them as good", () => {
    const bare = buildWeekPlan(weekContext({ paces: null, lthr: null }), ["corrida"], PREFS_3_DAYS)
      .find(d => d.type === "easy")!;
    const uncomparable = analyzeExecution(bare, [km(1, 300), km(2, 300), km(3, 340), km(4, 360)]);
    expect(executionPattern([fastStart(), fastStart(), fastStart(), uncomparable]))
      .toMatchObject({ total: 3 });
  });
});
