import { describe, it, expect, vi } from "vitest";
import {
  estimateTSS, computeTrainingLoad, tsbLabel, computeRunStreak,
} from "@/lib/training-load";
import { trainingDaysInWindow, computeTrainingDays } from "@/lib/utils";
import { computeReadiness, restingHrBaseline } from "@/lib/readiness";
import type { Run, WellnessData, HealthCheckin } from "@/types";

/**
 * The fitness / fatigue / form chart, and the readiness score that decides
 * whether the app proposes an easier day.
 *
 * These numbers are read as facts. Nobody sanity-checks a CTL of 47 — so if
 * the maths drifts, the athlete follows it.
 */
const run = (over: Partial<Run> = {}): Run => ({
  id: "r", user_id: "u", date: "2026-07-01",
  distance_km: 10, duration_seconds: 3600,
  avg_pace_seconds_per_km: 360, avg_hr: null, type: "easy",
  ...over,
} as Run);

/**
 * N days back on the athlete's calendar.
 *
 * Was `toISOString()`, which is UTC: run after 21:00 in Brazil, `daysAgo(0)`
 * returned tomorrow and four tests went red every evening. The fixture has to
 * speak the same calendar as the code it checks.
 */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

/**
 * The same day, in UTC.
 *
 * `computeTrainingLoad` walks its 90-day window entirely in UTC — a deliberate
 * choice made when mixing local and UTC dates produced a 90-day chart with 89
 * points. Feeding it local-calendar dates leaves a hole in the series, so its
 * fixtures speak UTC while the day-counting fixtures speak the athlete's
 * calendar. Two engines, two contracts, and the tests have to honour both.
 */
function utcDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("estimateTSS", () => {
  it("gives 100 for one hour at threshold heart rate", () => {
    // The definition of TSS: an hour at threshold is 100 points.
    const tss = estimateTSS(run({ avg_hr: 165, duration_seconds: 3600 }), 165);
    expect(tss).toBeCloseTo(100, 0);
  });

  it("gives 100 for one hour at threshold pace", () => {
    const tss = estimateTSS(run({ avg_pace_seconds_per_km: 265, duration_seconds: 3600 }), null, 265);
    expect(tss).toBeCloseTo(100, 0);
  });

  it("scales with the square of intensity, not linearly", () => {
    // Doubling intensity must quadruple the cost — that is what makes a hard
    // hour worth far more than two easy ones.
    const easy = estimateTSS(run({ avg_hr: 132, duration_seconds: 3600 }), 165);   // 80% of LTHR
    const hard = estimateTSS(run({ avg_hr: 165, duration_seconds: 3600 }), 165);   // 100%
    expect(hard / easy).toBeCloseTo(1 / 0.8 ** 2, 1);
  });

  it("scales linearly with duration", () => {
    const oneHour = estimateTSS(run({ avg_hr: 150, duration_seconds: 3600 }), 165);
    const twoHours = estimateTSS(run({ avg_hr: 150, duration_seconds: 7200 }), 165);
    expect(twoHours).toBeCloseTo(oneHour * 2, 0);
  });

  it("prefers heart rate over pace when both are available", () => {
    // HR reflects the actual cost; pace does not know about hills or heat.
    const both = estimateTSS(run({ avg_hr: 165, avg_pace_seconds_per_km: 400 }), 165, 265);
    const hrOnly = estimateTSS(run({ avg_hr: 165 }), 165);
    expect(both).toBe(hrOnly);
  });

  it("falls back to the run type when there is neither", () => {
    const easy = estimateTSS(run({ type: "easy", avg_hr: null, avg_pace_seconds_per_km: null }));
    const intervals = estimateTSS(run({ type: "intervals", avg_hr: null, avg_pace_seconds_per_km: null }));
    expect(intervals).toBeGreaterThan(easy);
    expect(easy).toBeGreaterThan(0);
  });

  it("returns zero rather than NaN for a run with no duration", () => {
    expect(estimateTSS(run({ duration_seconds: 0 }), 165)).toBe(0);
  });

  it("orders the run types by how hard they actually are", () => {
    const of = (type: Run["type"]) =>
      estimateTSS(run({ type, avg_hr: null, avg_pace_seconds_per_km: null }));
    expect(of("recovery")).toBeLessThan(of("easy"));
    expect(of("easy")).toBeLessThan(of("long_run"));
    expect(of("long_run")).toBeLessThan(of("tempo"));
    expect(of("tempo")).toBeLessThan(of("intervals"));
    expect(of("intervals")).toBeLessThan(of("race"));
  });
});

describe("CTL / ATL / TSB", () => {
  /** Same run every day for `n` days, ending today. */
  const consistent = (n: number, over: Partial<Run> = {}) =>
    Array.from({ length: n }, (_, i) => run({ date: utcDaysAgo(i), ...over }));

  it("returns nothing when there are no runs", () => {
    expect(computeTrainingLoad([])).toEqual([]);
  });

  it("builds fatigue faster than fitness", () => {
    // ATL is a 7-day average, CTL a 42-day one: the whole point of the model.
    const load = computeTrainingLoad(consistent(14, { avg_hr: 150 }), 165, null, 14);
    const last = load[load.length - 1];
    expect(last.atl).toBeGreaterThan(last.ctl);
    expect(last.tsb).toBeLessThan(0);
  });

  it("converges: sustained identical training ends with fitness meeting fatigue", () => {
    const load = computeTrainingLoad(consistent(200, { avg_hr: 150 }), 165, null, 30);
    const last = load[load.length - 1];
    expect(Math.abs(last.ctl - last.atl)).toBeLessThan(2);
    expect(Math.abs(last.tsb)).toBeLessThan(2);
  });

  it("turns form positive during a taper", () => {
    // Six weeks of training, then a week off — fatigue falls faster than fitness.
    const trained = Array.from({ length: 42 }, (_, i) => run({ date: utcDaysAgo(i + 8), avg_hr: 155 }));
    const load = computeTrainingLoad(trained, 165, null, 10);
    const last = load[load.length - 1];
    expect(last.tsb).toBeGreaterThan(0);
    expect(last.ctl).toBeGreaterThan(last.atl);
  });

  it("keeps TSB equal to fitness minus fatigue, every single day", () => {
    const load = computeTrainingLoad(consistent(30, { avg_hr: 150 }), 165, null, 30);
    for (const d of load) {
      expect(d.tsb).toBeCloseTo(Math.round((d.ctl - d.atl) * 10) / 10, 1);
    }
  });

  it("returns one row per day of the requested window", () => {
    const load = computeTrainingLoad(consistent(60, { avg_hr: 150 }), 165, null, 30);
    expect(load.length).toBe(30);
    const dates = load.map(d => d.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
  });

  it("never produces NaN, whatever the inputs", () => {
    const messy = [
      run({ date: daysAgo(3), duration_seconds: 0 }),
      run({ date: daysAgo(2), avg_hr: null, avg_pace_seconds_per_km: null }),
      run({ date: daysAgo(1), avg_hr: 0 }),
    ];
    for (const d of computeTrainingLoad(messy, null, null, 10)) {
      expect(Number.isFinite(d.ctl) && Number.isFinite(d.atl) && Number.isFinite(d.tsb)).toBe(true);
    }
  });

  it("warms up fitness from history instead of starting everyone at zero", () => {
    // Someone with months of training must not read as untrained on day one
    // of the window.
    const load = computeTrainingLoad(consistent(120, { avg_hr: 150 }), 165, null, 7);
    expect(load[0].ctl).toBeGreaterThan(20);
  });
});

describe("tsbLabel", () => {
  it("reads high form as rested and deep negative as buried", () => {
    expect(tsbLabel(25).label).toMatch(/descansad/i);
    expect(tsbLabel(-35).label.length).toBeGreaterThan(0);
  });

  it("always returns styling, for any value", () => {
    for (const v of [-100, -20, -5, 0, 5, 20, 100]) {
      const l = tsbLabel(v);
      expect(l.label).toBeTruthy();
      expect(l.color).toMatch(/^text-/);
      expect(l.bg).toMatch(/^bg-/);
    }
  });
});

describe("computeRunStreak", () => {
  it("counts consecutive days ending today or yesterday", () => {
    const runs = [0, 1, 2, 3].map(i => run({ date: daysAgo(i) }));
    expect(computeRunStreak(runs)).toBeGreaterThanOrEqual(4);
  });

  it("is zero after a gap", () => {
    const runs = [5, 6, 7].map(i => run({ date: daysAgo(i) }));
    expect(computeRunStreak(runs)).toBe(0);
  });

  it("handles an empty history", () => {
    expect(computeRunStreak([])).toBe(0);
  });

  it("counts a day with two runs once", () => {
    const runs = [run({ date: daysAgo(0) }), run({ date: daysAgo(0) }), run({ date: daysAgo(1) })];
    expect(computeRunStreak(runs)).toBe(2);
  });
});

describe("trainingDaysInWindow", () => {
  /**
   * Replaces the streak on the dashboard. A streak punishes rest, which is the
   * one thing the rest of the app keeps prescribing — a single deliberate rest
   * day reset it to zero.
   */
  it("counts distinct days, not sessions", () => {
    const runs = [run({ date: daysAgo(1) }), run({ date: daysAgo(1) }), run({ date: daysAgo(2) })];
    expect(trainingDaysInWindow(runs, [], 30).count).toBe(2);
  });

  it("counts lifting days too, not just runs", () => {
    const gym = [{ date: daysAgo(3), sport_type: "WeightTraining" }];
    expect(trainingDaysInWindow([run({ date: daysAgo(1) })], gym, 30).count).toBe(2);
  });

  it("survives a rest day in the middle, unlike a streak", () => {
    const runs = [0, 1, 3, 4, 6].map(i => run({ date: daysAgo(i) }));
    expect(trainingDaysInWindow(runs, [], 30).count).toBe(5);
    expect(computeRunStreak(runs)).toBeLessThan(5);
  });

  it("ignores anything older than the window", () => {
    expect(trainingDaysInWindow([run({ date: daysAgo(45) })], [], 30).count).toBe(0);
  });

  it("includes today and the 30th day back", () => {
    const runs = [run({ date: daysAgo(0) }), run({ date: daysAgo(29) })];
    expect(trainingDaysInWindow(runs, [], 30).count).toBe(2);
  });

  it("reports the window it used", () => {
    expect(trainingDaysInWindow([], [], 30).days).toBe(30);
  });

  it("never exceeds the number of days in the window", () => {
    const runs = Array.from({ length: 60 }, (_, i) => run({ date: daysAgo(i) }));
    expect(trainingDaysInWindow(runs, [], 30).count).toBeLessThanOrEqual(30);
  });
});

describe("readiness", () => {
  const wellness = (over: Partial<WellnessData> = {}): WellnessData => ({
    id: "w", user_id: "u", date: daysAgo(0),
    body_battery: null, sleep_score: null, sleep_seconds: null,
    hrv_status: null, resting_hr: null,
    ...over,
  } as WellnessData);

  it("scores a rested athlete high and a wrecked one low", () => {
    const fresh = computeReadiness({
      wellness: wellness({ body_battery: 90, sleep_score: 88, hrv_status: "balanced" }), tsb: 5,
    });
    const wrecked = computeReadiness({
      wellness: wellness({ body_battery: 20, sleep_score: 35, hrv_status: "low" }), tsb: -25,
    });
    expect(fresh.score).toBeGreaterThan(70);
    expect(fresh.verdict).toBe("alta");
    expect(wrecked.score).toBeLessThan(45);
    expect(wrecked.verdict).toBe("baixa");
  });

  it("always lands between 0 and 100", () => {
    for (const bb of [0, 50, 100]) {
      for (const tsb of [-60, 0, 40]) {
        const r = computeReadiness({ wellness: wellness({ body_battery: bb }), tsb });
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("works from the watch alone, with no check-in", () => {
    const r = computeReadiness({
      wellness: wellness({ body_battery: 75, sleep_score: 80, hrv_status: "balanced" }), tsb: 0,
    });
    expect(r.source).toBe("wearable");
    expect(r.components.length).toBeGreaterThan(2);
  });

  it("works from a manual check-in alone, with no watch", () => {
    const checkin = { sleep_hours: 8, sleep_quality: 4, soreness: 2, rpe: 4 } as HealthCheckin;
    const r = computeReadiness({ wellness: null, checkin, tsb: null });
    expect(r.source).toBe("manual");
    expect(r.score).toBeGreaterThan(0);
  });

  it("reports 'none' rather than a confident zero when it knows nothing", () => {
    const r = computeReadiness({ wellness: null, checkin: null, tsb: null });
    expect(r.source).toBe("none");
    expect(r.components).toEqual([]);
  });

  it("treats elevated resting heart rate as fatigue", () => {
    const normal = computeReadiness({ wellness: wellness({ resting_hr: 50 }), rhrBaseline: 50, tsb: 0 });
    const elevated = computeReadiness({ wellness: wellness({ resting_hr: 58 }), rhrBaseline: 50, tsb: 0 });
    expect(elevated.score).toBeLessThan(normal.score);
  });

  it("always gives the athlete a recommendation, never a bare number", () => {
    for (const bb of [10, 50, 95]) {
      const r = computeReadiness({ wellness: wellness({ body_battery: bb }), tsb: 0 });
      expect(r.recommendation.length).toBeGreaterThan(20);
    }
  });

  it("weights the components to sum to the score", () => {
    const r = computeReadiness({
      wellness: wellness({ body_battery: 80, sleep_score: 60 }), tsb: 10,
    });
    const totalW = r.components.reduce((s, c) => s + c.weight, 0);
    const manual = r.components.reduce((s, c) => s + c.score * (c.weight / totalW), 0);
    expect(r.score).toBe(Math.round(manual));
  });
});

describe("restingHrBaseline", () => {
  const row = (hr: number | null): WellnessData => ({ resting_hr: hr } as WellnessData);

  it("averages the recorded values", () => {
    expect(restingHrBaseline([row(48), row(50), row(52)])).toBe(50);
  });

  it("refuses to guess from too little data", () => {
    expect(restingHrBaseline([row(48), row(50)])).toBeNull();
    expect(restingHrBaseline([])).toBeNull();
  });

  it("ignores missing readings rather than counting them as zero", () => {
    expect(restingHrBaseline([row(48), row(null), row(50), row(52)])).toBe(50);
  });
});

/**
 * Reported from the app at 21:34 BRT: "treinei ontem, segunda, e hoje, terça"
 * and the dashboard disagreed.
 *
 * `computeTrainingDays` built the week's Monday from local fields but read
 * "today" through `toISOString()`, which is UTC. Every evening after 21:00 in
 * Brazil those two disagree by a day, so the window ran Monday → tomorrow and
 * the count stopped matching what the athlete had actually done. It is the same
 * defect that produced "Semana inválida" and a 90-day chart with 89 points —
 * this file simply kept its own copy of it.
 */
describe("contagem de dias à noite no Brasil", () => {
  const at = (iso: string, fn: () => void) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    try { fn(); } finally { vi.useRealTimers(); }
  };

  it("conta o treino de hoje mesmo depois das 21:00", () => {
    // 21:34 BRT de terça = 00:34 UTC de quarta.
    at("2026-08-05T00:34:00Z", () => {
      const seg = run({ date: "2026-08-03" });
      const ter = run({ date: "2026-08-04" });
      expect(trainingDaysInWindow([seg, ter], [], 30).count).toBe(2);
      expect(computeTrainingDays([seg, ter], []).thisWeek).toBe(2);
    });
  });

  it("dá o mesmo número de manhã e à noite do mesmo dia", () => {
    const runs = [run({ date: "2026-08-03" }), run({ date: "2026-08-04" })];
    let manha = -1, noite = -2;
    at("2026-08-04T12:00:00Z", () => { manha = computeTrainingDays(runs, []).thisWeek; });
    at("2026-08-05T00:34:00Z", () => { noite = computeTrainingDays(runs, []).thisWeek; });
    expect(noite).toBe(manha);
  });

  it("não conta amanhã como se já tivesse acontecido", () => {
    at("2026-08-05T00:34:00Z", () => {
      // 05/08 ainda não começou para o atleta — são 21:34 de 04/08.
      const amanha = run({ date: "2026-08-05" });
      expect(trainingDaysInWindow([amanha], [], 30).count).toBe(0);
    });
  });
});
