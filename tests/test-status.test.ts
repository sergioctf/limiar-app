import { describe, it, expect } from "vitest";
import { testStatus, TEST_BENEFITS, TEST_PROTOCOL, TEST_AGING_WEEKS } from "@/lib/test-status";
import type { PerformanceTest } from "@/types";

/**
 * The 3 km test is what calibrates the app. Features that depend on measured
 * intensities stay visibly locked until it exists — the alternative is a plan
 * full of guessed numbers that look exactly as authoritative as measured ones.
 */
const test = (daysAgo: number, avgHr: number | null = 178): PerformanceTest => ({
  id: "t", user_id: "u",
  test_date: new Date(Date.now() - daysAgo * 86400_000).toISOString().slice(0, 10),
  distance_km: 3, time_seconds: 780, avg_hr: avgHr, max_hr: null, notes: null,
  vo2max_estimate: 43.7, vdot: 43.7, created_at: "",
});

describe("no test at all", () => {
  const s = testStatus(null);

  it("locks everything that needs calibration", () => {
    expect(s.state).toBe("missing");
    expect(s.unlocks).toEqual({ paces: false, hrZones: false, advisor: false, predictions: false });
  });

  it("asks loudly, because nothing on screen would look broken", () => {
    expect(s.nudge).toBe("strong");
    expect(s.headline).toMatch(/teste de 3 km/i);
  });

  it("explains why we refuse to estimate", () => {
    expect(s.detail).toMatch(/chutar|estimad/i);
  });

  it("treats an empty list the same as null", () => {
    expect(testStatus([]).state).toBe("missing");
    expect(testStatus(undefined).state).toBe("missing");
  });
});

describe("a fresh test", () => {
  const s = testStatus(test(7));

  it("unlocks everything", () => {
    expect(s.state).toBe("fresh");
    expect(s.unlocks.paces).toBe(true);
    expect(s.unlocks.hrZones).toBe(true);
    expect(s.unlocks.advisor).toBe(true);
  });

  it("stays quiet", () => {
    expect(s.nudge).toBe("none");
  });
});

describe("a test without heart rate", () => {
  const s = testStatus(test(7, null));

  it("gives paces but withholds heart-rate zones", () => {
    expect(s.state).toBe("no_hr");
    expect(s.unlocks.paces).toBe(true);
    expect(s.unlocks.hrZones).toBe(false);
  });

  it("says what to do differently next time", () => {
    expect(s.nudge).toBe("soft");
    expect(s.detail).toMatch(/FC média/i);
  });

  it("does not block the advisor over a missing HR", () => {
    expect(s.unlocks.advisor).toBe(true);
  });
});

describe("ageing", () => {
  it("nudges softly at two months", () => {
    const s = testStatus(test(TEST_AGING_WEEKS * 7 + 1));
    expect(s.state).toBe("aging");
    expect(s.nudge).toBe("soft");
  });

  it("insists at four months", () => {
    const s = testStatus(test(17 * 7));
    expect(s.state).toBe("stale");
    expect(s.nudge).toBe("strong");
    expect(s.headline).toMatch(/\d+ semanas/);
  });

  it("keeps paces available even when stale, with a warning", () => {
    // An old VDOT still beats no VDOT — as long as the athlete is told.
    const s = testStatus(test(20 * 7));
    expect(s.unlocks.paces).toBe(true);
    expect(s.detail.length).toBeGreaterThan(40);
  });

  it("crosses from fresh to aging around the threshold", () => {
    // A day either side rather than the exact boundary: the week counter floors
    // against a fixed midday anchor, so the boundary day itself flips with the
    // hour the suite happens to run at.
    expect(testStatus(test(TEST_AGING_WEEKS * 7 - 2)).state).toBe("fresh");
    expect(testStatus(test(TEST_AGING_WEEKS * 7 + 2)).state).toBe("aging");
  });

  it("never goes backwards as a test gets older", () => {
    const rank = { fresh: 0, no_hr: 0, aging: 1, stale: 2, missing: 3 };
    let previous = -1;
    for (const days of [1, 20, 55, 60, 100, 120, 200]) {
      const r = rank[testStatus(test(days)).state];
      expect(r, `${days} dias`).toBeGreaterThanOrEqual(previous);
      previous = r;
    }
  });
});

describe("picking among several tests", () => {
  it("uses the most recent, whatever order they arrive in", () => {
    const s = testStatus([test(120), test(3), test(60)]);
    expect(s.state).toBe("fresh");
    expect(s.weeksSince).toBe(0);
  });
});

describe("the copy shown to the athlete", () => {
  it("lists concrete benefits, not vague ones", () => {
    expect(TEST_BENEFITS.length).toBeGreaterThanOrEqual(3);
    for (const b of TEST_BENEFITS) {
      expect(b.title.length).toBeGreaterThan(5);
      expect(b.detail.length).toBeGreaterThan(20);
    }
  });

  it("gives a protocol someone can actually follow", () => {
    expect(TEST_PROTOCOL.length).toBeGreaterThanOrEqual(4);
    expect(TEST_PROTOCOL.join(" ")).toMatch(/aque[çc]/i);
    expect(TEST_PROTOCOL.join(" ")).toMatch(/FC média/i);
  });
});
