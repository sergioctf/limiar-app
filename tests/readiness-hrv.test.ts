import { describe, it, expect } from "vitest";
import { computeReadiness, hrvBaseline, restingHrBaseline } from "@/lib/readiness";
import type { WellnessData } from "@/types";

/**
 * HRV from a number, not from a vendor's word for it.
 *
 * The engine only ever scored HRV from `hrv_status` — "balanced", "unbalanced"
 * — which is a Garmin concept. Apple Health, Whoop and every chest strap report
 * HRV as milliseconds. So the one field an iPhone shortcut can actually send
 * was stored and then ignored, and the readiness score quietly ran without it.
 *
 * Absolute HRV is meaningless across people: 40 ms can be excellent for one
 * athlete and a red flag for another. What carries information is today against
 * *your own* recent baseline, which is what every wearable does internally.
 */

const day = (over: Partial<WellnessData> = {}): WellnessData =>
  ({ date: "2026-08-10", ...over } as WellnessData);

/** N days of history at a steady HRV. */
const history = (n: number, ms: number): WellnessData[] =>
  Array.from({ length: n }, (_, i) => day({ date: `2026-07-${String(i + 1).padStart(2, "0")}`, hrv_ms: ms }));

const hrvOf = (r: ReturnType<typeof computeReadiness>) =>
  r.components.find(c => c.key === "hrv") ?? null;

describe("hrvBaseline", () => {
  it("needs a real history before it claims a baseline", () => {
    expect(hrvBaseline([])).toBeNull();
    expect(hrvBaseline(history(3, 50))).toBeNull();
    expect(hrvBaseline(history(7, 50))).toBe(50);
  });

  it("ignores rows without HRV", () => {
    const mixed = [...history(7, 50), day({ date: "2026-07-20" })];
    expect(hrvBaseline(mixed)).toBe(50);
  });

  it("uses the median, so one freak night does not move it", () => {
    // A single 120 ms reading among sevens of ~50 must not lift the baseline.
    const rows = [...history(7, 50), day({ date: "2026-07-21", hrv_ms: 120 })];
    expect(hrvBaseline(rows)).toBeLessThan(60);
  });
});

describe("HRV scoring against a personal baseline", () => {
  it("scores well when today matches the baseline", () => {
    const r = computeReadiness({
      wellness: day({ hrv_ms: 50 }),
      hrvBaselineMs: 50,
    });
    const hrv = hrvOf(r);
    expect(hrv).not.toBeNull();
    expect(hrv!.score).toBeGreaterThanOrEqual(80);
    expect(hrv!.auto).toBe(true);
  });

  it("drops sharply when HRV is suppressed", () => {
    const normal   = hrvOf(computeReadiness({ wellness: day({ hrv_ms: 50 }), hrvBaselineMs: 50 }))!;
    const dip      = hrvOf(computeReadiness({ wellness: day({ hrv_ms: 42 }), hrvBaselineMs: 50 }))!;
    const crash    = hrvOf(computeReadiness({ wellness: day({ hrv_ms: 32 }), hrvBaselineMs: 50 }))!;

    expect(dip.score).toBeLessThan(normal.score);
    expect(crash.score).toBeLessThan(dip.score);
    expect(crash.score).toBeLessThan(45);
  });

  it("does not reward an implausible spike without limit", () => {
    const high = hrvOf(computeReadiness({ wellness: day({ hrv_ms: 100 }), hrvBaselineMs: 50 }))!;
    expect(high.score).toBeLessThanOrEqual(95);
  });

  it("says nothing when there is no baseline to compare against", () => {
    // Without history, a number in milliseconds means nothing at all.
    const r = computeReadiness({ wellness: day({ hrv_ms: 50 }) });
    expect(hrvOf(r)).toBeNull();
  });

  it("keeps trusting the vendor's own status when there is one", () => {
    // Garmin already did this analysis; its verdict beats our arithmetic.
    const r = computeReadiness({
      wellness: day({ hrv_ms: 30, hrv_status: "balanced" }),
      hrvBaselineMs: 50,
    });
    expect(hrvOf(r)!.score).toBe(92);
  });

  it("falls back to the number when the status is one we do not know", () => {
    const r = computeReadiness({
      wellness: day({ hrv_ms: 50, hrv_status: "inventado" }),
      hrvBaselineMs: 50,
    });
    expect(hrvOf(r)!.score).toBeGreaterThanOrEqual(80);
  });
});

describe("the score reacts to HRV now", () => {
  it("a suppressed morning lowers readiness", () => {
    const base = { tsb: 0, hrvBaselineMs: 55 };
    const bem  = computeReadiness({ ...base, wellness: day({ hrv_ms: 56, resting_hr: 50 }), rhrBaseline: 50 });
    const mal  = computeReadiness({ ...base, wellness: day({ hrv_ms: 34, resting_hr: 50 }), rhrBaseline: 50 });

    expect(mal.score).toBeLessThan(bem.score);
  });

  it("counts as watch data, not manual", () => {
    const r = computeReadiness({ wellness: day({ hrv_ms: 50 }), hrvBaselineMs: 50, tsb: 0 });
    expect(r.source).toBe("wearable");
  });

  it("still works for someone sending only HRV", () => {
    // The minimum viable shortcut: one Health action, one field.
    const r = computeReadiness({ wellness: day({ hrv_ms: 45 }), hrvBaselineMs: 50 });
    expect(r.components.map(c => c.key)).toEqual(["hrv"]);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("nothing else regressed", () => {
  it("resting HR baseline still works as before", () => {
    expect(restingHrBaseline(history(7, 50).map(r => ({ ...r, resting_hr: 52 })))).toBe(52);
  });

  it("a profile with no wellness at all still scores from load", () => {
    const r = computeReadiness({ tsb: -5 });
    expect(r.components.map(c => c.key)).toEqual(["tsb"]);
    // `source` deliberately does not count TSB as a watch signal, so a score
    // built only from training load reports as "manual". Asserted here as it
    // is, not as it arguably should be — this file changes HRV, nothing else.
    expect(r.source).toBe("manual");
  });
});
