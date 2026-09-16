import { describe, it, expect } from "vitest";
import {
  normalizePracticedSports, normalizeSports, isPrimarySport, isSecondarySport,
  isRunSession, sessionMinutes, SPORTS,
} from "@/lib/sports";
import { normalizePrefs, otherSportsOn, buildWeekPlan, DEFAULT_PREFS } from "@/lib/workout-builder";
import type { TrainingPrefs, WeeklyPlanDay } from "@/types";

const ctx = {
  weeklyKm: 30,
  paces: null,
  lthr: null,
} as const;

/** Prefs with a known layout: runs Tue/Thu/Sat, no lifting. */
function prefs(extra: Partial<TrainingPrefs> = {}): TrainingPrefs {
  return normalizePrefs({
    runDays: ["Tue", "Thu", "Sat"],
    strengthDays: [],
    qualityPerWeek: 1,
    ...extra,
  });
}

const dayOf = (days: WeeklyPlanDay[], key: WeeklyPlanDay["day"]) =>
  days.find(d => d.day === key)!;

describe("normalizePracticedSports", () => {
  it("keeps tier-2 sports alongside the plannable four", () => {
    expect(normalizePracticedSports(["corrida", "yoga", "volei"]))
      .toEqual(["corrida", "yoga", "volei"]);
  });

  it("drops keys that are not sports", () => {
    expect(normalizePracticedSports(["corrida", "quadribol", 7, null]))
      .toEqual(["corrida"]);
  });

  it("deduplicates", () => {
    expect(normalizePracticedSports(["yoga", "yoga", "corrida", "corrida"]))
      .toEqual(["corrida", "yoga"]);
  });

  it("puts the primaries first regardless of input order", () => {
    const out = normalizePracticedSports(["yoga", "corrida", "pilates", "natacao"]);
    expect(out.slice(0, 2)).toEqual(["corrida", "natacao"]);
  });

  it("falls back to the defaults when no primary survives", () => {
    // Someone whose whole list is tier 2 still needs a plannable sport, or the
    // coach has nothing to build a week from.
    expect(normalizePracticedSports(["yoga", "pilates"]))
      .toEqual(["corrida", "musculacao", "yoga", "pilates"]);
  });

  it("falls back for junk input", () => {
    expect(normalizePracticedSports(null)).toEqual(["corrida", "musculacao"]);
    expect(normalizePracticedSports("corrida")).toEqual(["corrida", "musculacao"]);
  });

  it("leaves normalizeSports primary-only — the engine must not see tier 2", () => {
    expect(normalizeSports(["corrida", "yoga", "volei"])).toEqual(["corrida"]);
  });
});

describe("sport predicates", () => {
  it("separates the two tiers", () => {
    expect(isPrimarySport("corrida")).toBe(true);
    expect(isPrimarySport("yoga")).toBe(false);
    expect(isSecondarySport("yoga")).toBe(true);
    expect(isSecondarySport("corrida")).toBe(false);
    expect(isSecondarySport(undefined)).toBe(false);
  });

  it("gives every tier-2 sport a session length", () => {
    for (const key of Object.keys(SPORTS)) {
      if (!isSecondarySport(key)) continue;
      expect(sessionMinutes(key)).toBeGreaterThan(0);
    }
  });
});

describe("isRunSession", () => {
  it("is true for runs and for legacy days with no sport", () => {
    expect(isRunSession({ type: "easy", sport: "corrida" })).toBe(true);
    expect(isRunSession({ type: "long_run" })).toBe(true);
  });

  it("is false for rest, lifting and cross-training", () => {
    expect(isRunSession({ type: "rest" })).toBe(false);
    expect(isRunSession({ type: "strength", sport: "musculacao" })).toBe(false);
    // The bug this exists for: a pedal and a pilates class are both typed
    // `easy`, and everything that asked `type !== "rest"` treated them as runs.
    expect(isRunSession({ type: "easy", sport: "ciclismo" })).toBe(false);
    expect(isRunSession({ type: "easy", sport: "yoga" })).toBe(false);
  });
});

describe("normalizePrefs — otherDays", () => {
  it("keeps a valid schedule", () => {
    expect(prefs({ otherDays: { yoga: ["Mon", "Wed"] } }).otherDays)
      .toEqual({ yoga: ["Mon", "Wed"] });
  });

  it("drops unknown sports and unknown days", () => {
    const p = prefs({ otherDays: { yoga: ["Mon", "Funday"], quadribol: ["Tue"] } } as never);
    expect(p.otherDays).toEqual({ yoga: ["Mon"] });
  });

  it("drops a sport left with no days rather than storing an empty list", () => {
    expect(prefs({ otherDays: { yoga: [] } }).otherDays).toEqual({});
  });

  it("sorts days and deduplicates them", () => {
    expect(prefs({ otherDays: { volei: ["Sat", "Mon", "Mon"] } }).otherDays)
      .toEqual({ volei: ["Mon", "Sat"] });
  });

  it("survives junk without throwing", () => {
    expect(prefs({ otherDays: "yoga" } as never).otherDays).toEqual({});
    expect(prefs({ otherDays: ["yoga"] } as never).otherDays).toEqual({});
    expect(normalizePrefs({}).otherDays).toEqual({});
  });
});

describe("otherSportsOn", () => {
  it("lists what is booked for a day", () => {
    const p = prefs({ otherDays: { yoga: ["Mon"], volei: ["Mon", "Thu"] } });
    expect(otherSportsOn(p, "Mon")).toEqual(["yoga", "volei"]);
    expect(otherSportsOn(p, "Thu")).toEqual(["volei"]);
    expect(otherSportsOn(p, "Sun")).toEqual([]);
  });
});

describe("buildWeekPlan — tier-2 sessions", () => {
  it("turns a rest day into the sport the athlete booked", () => {
    const days = buildWeekPlan(ctx, ["corrida"], prefs({ otherDays: { pilates: ["Wed"] } }));
    const wed = dayOf(days, "Wed");

    expect(wed.sport).toBe("pilates");
    expect(wed.label).toBe("Pilates");
    expect(wed.type).not.toBe("rest");
    expect(wed.duration_min).toBe(sessionMinutes("pilates"));
    // No distance and no pace: nothing here was computed from a VDOT.
    expect(wed.distance_km).toBeUndefined();
    expect(wed.pace).toBeUndefined();
  });

  it("never takes a day away from a run", () => {
    const withOther = buildWeekPlan(ctx, ["corrida"], prefs({ otherDays: { volei: ["Tue"] } }));
    const plain     = buildWeekPlan(ctx, ["corrida"], prefs());

    const tue = dayOf(withOther, "Tue");
    expect(tue.sport).toBe("corrida");
    expect(tue.distance_km).toBe(dayOf(plain, "Tue").distance_km);
    expect(tue.description).toContain("Vôlei");
  });

  it("does not change the week's running volume", () => {
    const km = (days: WeeklyPlanDay[]) =>
      days.reduce((t, d) => t + (isRunSession(d) ? (d.distance_km ?? 0) : 0), 0);

    expect(km(buildWeekPlan(ctx, ["corrida"], prefs({ otherDays: { luta: ["Mon", "Wed", "Fri"] } }))))
      .toBeCloseTo(km(buildWeekPlan(ctx, ["corrida"], prefs())), 5);
  });

  it("beats the generic cross-training filler for a cyclist", () => {
    // Without the athlete's choice, Wednesday would be "Pedal leve".
    const filler = buildWeekPlan(ctx, ["corrida", "ciclismo"], prefs());
    expect(dayOf(filler, "Wed").sport).toBe("ciclismo");

    const chosen = buildWeekPlan(ctx, ["corrida", "ciclismo"], prefs({ otherDays: { yoga: ["Wed"] } }));
    expect(dayOf(chosen, "Wed").sport).toBe("yoga");
  });

  it("stacks two sports on one day", () => {
    const days = buildWeekPlan(ctx, ["corrida"], prefs({ otherDays: { yoga: ["Mon"], luta: ["Mon"] } }));
    const mon = dayOf(days, "Mon");

    expect(mon.label).toBe("Yoga + Luta");
    expect(mon.duration_min).toBe(sessionMinutes("yoga") + sessionMinutes("luta"));
    expect(mon.description).toContain("Yoga e Luta");
  });

  it("mentions the sport on a lifting day instead of replacing the session", () => {
    const p = prefs({ strengthDays: ["Mon"], otherDays: { yoga: ["Mon"] } });
    const mon = dayOf(buildWeekPlan(ctx, ["corrida", "musculacao"], p), "Mon");

    expect(mon.sport).toBe("musculacao");
    expect(mon.description).toContain("Yoga");
  });

  it("leaves the plan untouched when nothing is booked", () => {
    const withEmpty = buildWeekPlan(ctx, ["corrida"], prefs({ otherDays: {} }));
    const plain     = buildWeekPlan(ctx, ["corrida"], prefs());
    expect(withEmpty).toEqual(plain);
  });

  it("works from DEFAULT_PREFS, which has no otherDays at all", () => {
    expect(() => buildWeekPlan(ctx, ["corrida"], DEFAULT_PREFS)).not.toThrow();
  });
});
