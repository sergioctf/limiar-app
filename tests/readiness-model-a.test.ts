/**
 * The readiness model after 16/09.
 *
 * Sérgio slept 4 h 13 after a hard week of running and lifting. The Limiar said
 * 69 ("moderada", nearly "alta"); the Garmin said 20–40; the body agreed with
 * the Garmin. The causes were concrete — a short night weighed too little, the
 * missing HRV handed its weight to a good resting HR, and the gym did not count
 * as load — and each has a test here.
 */
import { describe, expect, it } from "vitest";
import {
  computeReadiness, restingHrBaseline, shortNightCap, sleepHistoryScore,
} from "@/lib/readiness";
import { readinessOn } from "@/lib/health-view";
import { activityTSS, computeTrainingLoad } from "@/lib/training-load";
import type { WellnessData } from "@/types";

const row = (date: string, patch: Partial<WellnessData> = {}): WellnessData => ({
  id: date, user_id: "u", date, source: "intervals",
  sleep_seconds: null, sleep_score: null, hrv_ms: null, hrv_status: null,
  resting_hr: null, stress_avg: null, body_battery: null, created_at: date,
  ...patch,
} as WellnessData);

describe("the morning of 16/09", () => {
  const morning = {
    wellness: row("2026-09-16", { sleep_seconds: 4.22 * 3600, sleep_score: 52, hrv_ms: 81, resting_hr: 51 }),
    tsb: -2.9,
    rhrBaseline: 53,
    hrvBaselineMs: null,            // four nights: still calibrating
    sleepHistoryHours: [4.22, 6.27],
  };

  it("no longer calls a four-hour night after a hard week anything but low", () => {
    const r = computeReadiness({ ...morning, expectWatch: true });
    expect(r.score).toBeLessThanOrEqual(40);
    expect(r.verdict).toBe("baixa");
    expect(r.cap?.reason).toContain("Noite de 4h13");
  });

  it("was 69 under the old arithmetic, which is what this replaces", () => {
    // Without the watch expectation and without the cap the same inputs
    // renormalize over what arrived — the old behaviour, kept for check-in users.
    const legacyLike = computeReadiness({ ...morning, sleepHistoryHours: [], wellness: { ...morning.wellness, sleep_seconds: null } });
    expect(legacyLike.score).toBeGreaterThan(60);
  });

  it("says how many core signals the number is built from", () => {
    const r = computeReadiness({ ...morning, expectWatch: true });
    expect(r.coverage).toEqual({ present: 3, expected: 4, missing: ["hrv"] });
  });
});

describe("sleep over the last nights", () => {
  it("needs at least two nights", () => {
    expect(sleepHistoryScore([7])).toBeNull();
  });
  it("scores a debt, not just a bad night", () => {
    expect(sleepHistoryScore([8, 7.6])).toBe(100);
    const debt = sleepHistoryScore([4.22, 6.27])!;
    expect(debt).toBeGreaterThanOrEqual(30);
    expect(debt).toBeLessThanOrEqual(40);
  });
});

describe("a short night caps the day", () => {
  it("caps below 4 h 30 at 40", () => {
    expect(shortNightCap(4.22)?.limit).toBe(40);
  });
  it("keeps a night under 5 h 30 from reading as ready to train hard", () => {
    expect(shortNightCap(5.2)?.limit).toBe(60);
  });
  it("leaves a normal night alone", () => {
    expect(shortNightCap(6.5)).toBeUndefined();
    expect(shortNightCap(null)).toBeUndefined();
  });
  it("applies whatever the other signals say", () => {
    const r = computeReadiness({
      wellness: row("d", { sleep_seconds: 4 * 3600, sleep_score: 95, hrv_ms: 90, resting_hr: 48 }),
      tsb: 15, rhrBaseline: 52, hrvBaselineMs: 70, sleepHistoryHours: [4, 8, 8], expectWatch: true,
    });
    expect(r.score).toBeLessThanOrEqual(40);
  });
});

describe("a missing signal is unknown, not absent", () => {
  const strong = {
    wellness: row("d", { sleep_seconds: 8 * 3600, sleep_score: 90, resting_hr: 50 }),
    tsb: 10, rhrBaseline: 52, sleepHistoryHours: [8, 8],
  };
  it("holds a watch athlete's score toward neutral when HRV did not arrive", () => {
    const withWatch = computeReadiness({ ...strong, expectWatch: true });
    const renormalized = computeReadiness({ ...strong, expectWatch: false });
    expect(withWatch.score).toBeLessThan(renormalized.score);
    expect(withWatch.score).toBeGreaterThan(50);
  });
  it("does not penalize an athlete without a watch for having no watch", () => {
    const checkinOnly = computeReadiness({
      checkin: { sleep_hours: 8, sleep_quality: 5, soreness: 1, rpe: 3 } as never,
      tsb: 5,
    });
    expect(checkinOnly.coverage).toBeUndefined();
    expect(checkinOnly.score).toBeGreaterThanOrEqual(70);
  });
});

describe("the Garmin number, when the athlete types it", () => {
  it("joins as one more signal with its own label", () => {
    const r = computeReadiness({
      wellness: row("d", { sleep_seconds: 7 * 3600, sleep_score: 75, garmin_readiness: 30 }),
      tsb: 0, expectWatch: true,
    });
    const garmin = r.components.find(c => c.key === "body_battery");
    expect(garmin?.label).toBe("Disposição do Garmin (informada)");
    expect(garmin?.score).toBe(30);
  });
  it("pulls the score toward it without replacing the Limiar reading", () => {
    const base = { wellness: row("d", { sleep_seconds: 7.5 * 3600, sleep_score: 85, resting_hr: 50 }), tsb: 5, rhrBaseline: 51, expectWatch: true };
    const without = computeReadiness(base);
    const withLow = computeReadiness({ ...base, wellness: { ...base.wellness, garmin_readiness: 25 } });
    expect(withLow.score).toBeLessThan(without.score);
    expect(withLow.score).toBeGreaterThan(25);
  });
});

describe("resting HR baseline", () => {
  it("uses the median, so one feverish morning does not move it", () => {
    const rows = [50, 51, 52, 50, 62].map((hr, i) => row(`2026-09-0${i + 1}`, { resting_hr: hr }));
    expect(restingHrBaseline(rows)).toBe(51);
  });
});

describe("readinessOn builds the new inputs from the rows", () => {
  it("reads the last three nights and knows the athlete has a watch", () => {
    const rows = [
      row("2026-09-14", { sleep_seconds: 8 * 3600, resting_hr: 50 }),
      row("2026-09-15", { sleep_seconds: 6.27 * 3600, sleep_score: 78, resting_hr: 50 }),
      row("2026-09-16", { sleep_seconds: 4.22 * 3600, sleep_score: 52, resting_hr: 51 }),
    ];
    const r = readinessOn("2026-09-16", rows, { "2026-09-16": { tss: 85, tsb: -3 } });
    expect(r.components.some(c => c.key === "sleep_history")).toBe(true);
    expect(r.coverage).toBeDefined();
    expect(r.verdict).toBe("baixa");
  });
});

describe("the gym is load too", () => {
  it("gives an hour of lifting a real, modest TSS", () => {
    expect(activityTSS({ date: "d", sport_type: "WeightTraining", duration_seconds: 3600 })).toBe(49);
  });
  it("counts HIIT harder than lifting", () => {
    const hiit = activityTSS({ date: "d", sport_type: "HIIT", duration_seconds: 3600 });
    expect(hiit).toBeGreaterThan(49);
  });
  it("raises fatigue when the week had gym sessions on top of the runs", () => {
    const today = new Date().toISOString().slice(0, 10);
    const runsOnly = computeTrainingLoad([], null, null, 14, []);
    const withGym = computeTrainingLoad([], null, null, 14, [{ date: today, sport_type: "WeightTraining", duration_seconds: 3600 }]);
    expect(runsOnly).toEqual([]);
    expect(withGym.at(-1)!.atl).toBeGreaterThan(0);
  });
  it("never counts a run twice when it also reached activities", () => {
    const today = new Date().toISOString().slice(0, 10);
    const load = computeTrainingLoad([], null, null, 7, [{ date: today, sport_type: "Run", duration_seconds: 3600 }]);
    expect(load.at(-1)?.tss ?? 0).toBe(0);
  });
});

describe("an independent reading next to the Garmin number", () => {
  it("keeps the score without the typed number, to compare fairly", () => {
    const base = { wellness: row("d", { sleep_seconds: 7.5 * 3600, sleep_score: 85, resting_hr: 50 }), tsb: 5, rhrBaseline: 51, expectWatch: true };
    const withGarmin = computeReadiness({ ...base, wellness: { ...base.wellness, garmin_readiness: 25 } });
    const alone = computeReadiness(base);
    expect(withGarmin.withoutGarmin).toBe(alone.score);
    expect(alone.withoutGarmin).toBeUndefined();
  });
});
