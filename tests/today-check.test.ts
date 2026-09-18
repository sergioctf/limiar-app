/**
 * When Saúde earns a question from the coach — and, just as much, when it does not.
 *
 * "Perguntar todo dia vira burocracia; ignorar tudo faz Saúde continuar isolada."
 */
import { describe, expect, it } from "vitest";
import { collectSignals, scoreSignals, todayCheck, type TodayCheckInput } from "@/lib/today-check";
import type { WeeklyPlanDay, WellnessData } from "@/types";

const today = "2026-09-18";

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Twenty nights of a steady routine, then `recent` hours for the last nights (most recent last). */
function nights(recent: number[] = [], extra: (date: string, i: number) => Partial<WellnessData> = () => ({})): WellnessData[] {
  const rows: WellnessData[] = [];
  const total = 20 + recent.length;
  for (let i = 0; i < total; i++) {
    const date = addDays(today, -(total - 1 - i));
    const hours = i < 20 ? 7.2 : recent[i - 20];
    rows.push({
      date, sleep_seconds: Math.round(hours * 3600), sleep_score: null, hrv_ms: 80, hrv_status: null,
      resting_hr: 52, stress_avg: null, body_battery: null, source: "intervals", ...extra(date, i),
    });
  }
  return rows;
}

const hard: WeeklyPlanDay = { day: "Fri", dayPt: "Sexta", sport: "corrida", type: "intervals", label: "Tiro 3×400 m", distance_km: 3.5, description: "", quality: "intervals" };
const easy: WeeklyPlanDay = { day: "Fri", dayPt: "Sexta", sport: "corrida", type: "easy", label: "Rodagem leve", distance_km: 6, description: "" };

const base = (over: Partial<TodayCheckInput> = {}): TodayCheckInput => ({
  today, session: hard, sessionDone: false, rows: nights(), load: {}, checkin: null,
  recentFeedback: [], history: [], canTomorrow: true, ...over,
});

describe("the example that started it", () => {
  it("asks before a hard session when the athlete reported fatigue and the last nights were short", () => {
    const check = todayCheck(base({
      rows: nights([6.0, 6.1, 6.2]),
      recentFeedback: [{ date: addDays(today, -2), effort: 4, context: "fatigue" }],
    }));
    expect(check.action).toBe("ask");
    expect(check.message).toBe("Hoje tem Tiro 3×400 m. Você relatou cansaço e suas últimas noites ficaram abaixo do seu habitual — 6h12 esta noite, contra 7h12 de costume.");
    expect(check.question).toBe("Como está se sentindo?");
    expect(check.options.map(o => o.value)).toEqual(["keep", "shorter", "easy", "tomorrow"]);
  });
});

describe("one bad night is one bad night", () => {
  it("counts sleep once, however many ways it shows", () => {
    const signals = collectSignals(base({ rows: nights([6.0, 6.0, 6.0]) }));
    expect(signals.map(s => s.key).sort()).toEqual(["short_night", "sleep_debt"]);
    expect(scoreSignals(signals)).toBe(1);
  });

  it("does not ask on a single moderate signal", () => {
    expect(todayCheck(base({ rows: nights([6.0, 6.0, 6.0]) })).action).toBe("none");
  });

  it("asks on one strong signal", () => {
    const check = todayCheck(base({ rows: nights([4.2]) }));
    expect(check.action).toBe("ask");
    expect(check.message).toContain("dormiu só 4h12 esta noite");
  });

  it("asks when two different sources agree", () => {
    const check = todayCheck(base({
      rows: nights([6.0], (date) => (date === today ? { resting_hr: 58 } : {})),
    }));
    expect(check.signals.map(s => s.source).sort()).toEqual(["relogio", "sono"]);
    expect(check.action).toBe("ask");
  });
});

describe("the watch, the athlete and the load all count", () => {
  it("reads HRV against the athlete's own baseline", () => {
    const signals = collectSignals(base({ rows: nights([7.2], (date) => (date === today ? { hrv_ms: 62 } : {})) }));
    expect(signals.find(s => s.key === "hrv_low")?.weight).toBe(1);
  });

  it("takes Garmin's own readiness when the athlete typed it", () => {
    const signals = collectSignals(base({ rows: nights([7.2], (date) => (date === today ? { garmin_readiness: 22 } : {})) }));
    expect(signals.find(s => s.key === "garmin_low")?.weight).toBe(2);
  });

  it("includes the gym through the training load", () => {
    const signals = collectSignals(base({ load: { [today]: { tss: 90, tsb: -24 } } }));
    expect(signals.map(s => s.key)).toEqual(["heavy_load"]);
  });

  it("listens to this morning's check-in", () => {
    const signals = collectSignals(base({ checkin: { energy: 2, soreness: 4 } as never }));
    expect(signals.map(s => s.key).sort()).toEqual(["low_energy", "soreness"]);
    expect(scoreSignals(signals)).toBe(1);   // both from the athlete: one source
  });
});

describe("easy days and pain", () => {
  it("never asks before an easy run — at most a note", () => {
    const heavy = base({
      session: easy,
      rows: nights([4.3]),
      recentFeedback: [{ date: addDays(today, -1), effort: 5, context: "fatigue" }],
    });
    const check = todayCheck(heavy);
    expect(check.action).toBe("note");
    expect(check.question).toBeNull();
    expect(check.message).toMatch(/^Dia leve, e ainda bem:/);
  });

  it("stays silent on an easy day with ordinary signals", () => {
    expect(todayCheck(base({ session: easy, rows: nights([6.0]) })).action).toBe("none");
  });

  it("asks about pain before any run", () => {
    const check = todayCheck(base({ session: easy, recentFeedback: [{ date: addDays(today, -1), effort: 3, context: "pain" }] }));
    expect(check.action).toBe("ask");
    expect(check.question).toBe("Como está esse incômodo?");
    expect(check.options.map(o => o.value)).toEqual(["keep", "easy", "tomorrow"]);
  });
});

describe("nothing to decide", () => {
  const tired = { rows: nights([4.0]) };
  it("after the session is done", () => {
    expect(todayCheck(base({ ...tired, sessionDone: true })).action).toBe("none");
  });
  it("on a rest day, a gym day or race day", () => {
    for (const type of ["rest", "strength", "race"] as const) {
      expect(todayCheck(base({ ...tired, session: { ...hard, type, quality: undefined } })).action).toBe("none");
    }
  });
  it("when the athlete already swapped or adapted today", () => {
    expect(todayCheck(base({ ...tired, session: { ...hard, swap: {} as never } })).action).toBe("none");
    expect(todayCheck(base({ ...tired, session: { ...hard, adaptation: {} as never } })).action).toBe("none");
  });
  it("does not offer tomorrow when tomorrow cannot take it", () => {
    expect(todayCheck(base({ ...tired, canTomorrow: false })).options.map(o => o.value)).not.toContain("tomorrow");
  });
});

describe("not every day", () => {
  const tired = base({ rows: nights([4.4]) });           // score 2: asks
  it("does not ask again after 'estou bem' unless things got worse", () => {
    const history = [{ date: addDays(today, -1), action: "ask" as const, answer: "keep" as const, score: 2 }];
    const check = todayCheck({ ...tired, history });
    expect(check.action).toBe("note");
    expect(check.held).toBe("answered_yesterday");
  });

  it("asks again when the signals got worse since then", () => {
    const history = [{ date: addDays(today, -1), action: "ask" as const, answer: "keep" as const, score: 1 }];
    expect(todayCheck({ ...tired, history }).action).toBe("ask");
  });

  it("holds a third question in the same week unless the reason is strong", () => {
    const history = [
      { date: addDays(today, -2), action: "ask" as const, answer: "easy" as const, score: 2 },
      { date: addDays(today, -5), action: "ask" as const, answer: "shorter" as const, score: 2 },
    ];
    expect(todayCheck({ ...tired, history }).held).toBe("weekly_cap");
    const strong = base({ rows: nights([4.4]), recentFeedback: [{ date: addDays(today, -1), effort: 5, context: "fatigue" }], history });
    expect(todayCheck(strong).action).toBe("ask");
  });

  it("keeps the day's decision once it was made", () => {
    const history = [{ date: today, action: "ask" as const, answer: null, score: 2 }];
    // The watch data changed during the day; the question stands.
    expect(todayCheck(base({ history })).action).toBe("ask");
  });
});
