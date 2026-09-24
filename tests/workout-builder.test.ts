import { describeDay } from "@/lib/day-description";
import { MUSCLE_LABEL } from "@/lib/exercises";
import { describe, it, expect } from "vitest";
import {
  allocateRunSessions, buildWeekPlan, expandToKmSplits, normalizePrefs,
  planWeeklyVolume, volumeWithRatchet, distributeWeeklyVolume, provenCapacity, hrFor, isLegacyPlanShape, isDefaultRunWeek,
} from "@/lib/workout-builder";
import {
  METRICS, METRICS_NO_HR, weekContext, totalKm, dayOf,
  PREFS_2_DAYS, PREFS_3_DAYS, PREFS_5_DAYS,
} from "./fixtures";
import { normalizeStrengthPrefs, syncStrengthDays } from "@/lib/strength-prefs";
import type { WeeklyPlanDay } from "@/types";

const DAY_ORDER: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const idx = (d: WeeklyPlanDay["day"]) => DAY_ORDER.indexOf(d);

describe("allocateRunSessions", () => {
  it("follows easy → quality → long across the athlete's days", () => {
    const a = allocateRunSessions(["Mon", "Wed", "Sat"], { qualityPerWeek: 1 });
    expect(a.get("Mon")).toBe("easy");
    expect(a.get("Wed")).toBe("quality");
    expect(a.get("Sat")).toBe("long");
  });

  it("never puts quality on the day before the long run", () => {
    // Every layout where a run day sits immediately before the long one.
    const layouts: WeeklyPlanDay["day"][][] = [
      ["Mon", "Fri", "Sat"],
      ["Tue", "Thu", "Fri", "Sat"],
      ["Mon", "Wed", "Thu", "Fri"],
      ["Wed", "Sat", "Sun"],
    ];
    for (const days of layouts) {
      const a = allocateRunSessions(days, { qualityPerWeek: 1 });
      const long = days.find(d => a.get(d) === "long")!;
      for (const [day, kind] of Array.from(a)) {
        if (kind !== "quality") continue;
        expect(idx(long) - idx(day), `${days.join("/")}: quality on ${day} abuts long on ${long}`).not.toBe(1);
      }
    }
  });

  it("makes the only run of the week the long one", () => {
    const a = allocateRunSessions(["Wed"], { qualityPerWeek: 2 });
    expect(Array.from(a.values())).toEqual(["long"]);
  });

  it("honours an explicit long run day", () => {
    const a = allocateRunSessions(["Mon", "Wed", "Sat"], { longRunDay: "Wed", qualityPerWeek: 1 });
    expect(a.get("Wed")).toBe("long");
  });

  it("keeps the week mostly easy: quality never exceeds half the runs", () => {
    for (let n = 2; n <= 7; n++) {
      const days = DAY_ORDER.slice(0, n);
      const a = allocateRunSessions(days, { qualityPerWeek: 5 });
      const quality = Array.from(a.values()).filter(k => k === "quality").length;
      expect(quality, `${n} run days`).toBeLessThanOrEqual(Math.ceil((n - 1) / 2));
    }
  });

  it("returns an empty allocation when the athlete runs no days", () => {
    expect(allocateRunSessions([]).size).toBe(0);
  });
});

describe("buildWeekPlan — volume", () => {
  /**
   * The regression that matters most: a week must deliver the volume it was
   * asked for. When it under-delivers, next week's target is computed from the
   * shortfall and the whole plan spirals downward while still reporting "+10%".
   */
  it.each([
    ["2 dias", PREFS_2_DAYS],
    ["3 dias", PREFS_3_DAYS],
    ["5 dias", PREFS_5_DAYS],
  ])("delivers the requested weekly volume (%s)", (_label, prefs) => {
    for (const target of [20, 30, 40, 60, 80]) {
      const plan = buildWeekPlan(weekContext({ weeklyKm: target }), ["corrida"], prefs);
      const delivered = totalKm(plan);
      expect(delivered / target).toBeGreaterThanOrEqual(0.9);
      expect(delivered / target).toBeLessThanOrEqual(1.1);
    }
  });

  it("does not spiral downward when replanned from what it delivered", () => {
    let history = [30, 30, 30, 30];
    for (let week = 0; week < 8; week++) {
      const target = planWeeklyVolume(history);
      const plan = buildWeekPlan(weekContext({ weeklyKm: target }), ["corrida"], PREFS_3_DAYS);
      history = [totalKm(plan), ...history].slice(0, 4);
    }
    // Eight weeks of base training must not end below where it started.
    expect(history[0]).toBeGreaterThanOrEqual(30);
  });

  it("keeps the long run a sane share of the week actually prescribed", () => {
    // The 25–30% guideline assumes 5–6 running days; spreading the same volume
    // over fewer days legitimately raises the share. What must never happen is
    // the long run swallowing the week.
    const ceilingFor = (runDays: number) =>
      runDays <= 2 ? 0.62 : runDays === 3 ? 0.47 : runDays === 4 ? 0.40 : 0.35;

    for (const prefs of [PREFS_2_DAYS, PREFS_3_DAYS, PREFS_5_DAYS]) {
      for (const target of [25, 40, 70]) {
        const plan = buildWeekPlan(weekContext({ weeklyKm: target }), ["corrida"], prefs);
        const long = plan.find(d => d.type === "long_run")!;
        const share = (long.distance_km ?? 0) / totalKm(plan);
        expect(share, `${prefs.runDays.length} dias @ ${target} km`).toBeGreaterThan(0.2);
        expect(share, `${prefs.runDays.length} dias @ ${target} km`)
          .toBeLessThanOrEqual(ceilingFor(prefs.runDays.length));
      }
    }
  });

  it("does not prescribe a 5 km long run to someone who has run 21", () => {
    // Long-run durability decays far slower than weekly volume. Sizing the long
    // run off a depressed four-week average alone produced 5 km long runs for a
    // half-marathoner coming back from a quiet month.
    const cold = buildWeekPlan(weekContext({ weeklyKm: 14 }), ["corrida"], PREFS_3_DAYS);
    const proven = buildWeekPlan(
      weekContext({ weeklyKm: 14, provenLongRunKm: 21.4 }), ["corrida"], PREFS_3_DAYS,
    );
    const longOf = (p: typeof cold) => p.find(d => d.type === "long_run")!.distance_km ?? 0;

    expect(longOf(proven)).toBeGreaterThan(longOf(cold));
    expect(longOf(proven)).toBeGreaterThanOrEqual(7);
  });

  it("never lets the proven floor swallow the week", () => {
    for (const target of [10, 14, 25, 40]) {
      const plan = buildWeekPlan(
        weekContext({ weeklyKm: target, provenLongRunKm: 42 }), ["corrida"], PREFS_3_DAYS,
      );
      const long = plan.find(d => d.type === "long_run")!.distance_km ?? 0;
      expect(long / totalKm(plan), `${target} km`).toBeLessThanOrEqual(0.55);
    }
  });

  it("is the biggest session of the week, at every volume", () => {
    // At 12 km/week the interval session was 5.5 km — bigger than the long run
    // — because three 1000 m reps plus warm-up and cool-down has a floor that
    // did not scale down with the week.
    for (const prefs of [PREFS_2_DAYS, PREFS_3_DAYS, PREFS_5_DAYS]) {
      for (const target of [12, 18, 25, 45, 70]) {
        const plan = buildWeekPlan(weekContext({ weeklyKm: target }), ["corrida"], prefs);
        const long = plan.find(d => d.type === "long_run")!.distance_km ?? 0;
        for (const d of plan.filter(x => x.type !== "long_run" && x.distance_km != null)) {
          expect(d.distance_km!, `${target} km: ${d.day} ${d.label} (${d.distance_km}) > longão (${long})`)
            .toBeLessThanOrEqual(long);
        }
      }
    }
  });

  it("shortens the reps instead of blowing the interval cap on a small week", () => {
    // Daniels: interval volume ≤ 8% of weekly mileage.
    for (const target of [12, 18, 26, 40, 60]) {
      const plan = buildWeekPlan(weekContext({ weeklyKm: target }), ["corrida"], PREFS_3_DAYS);
      const quality = plan.find(d => d.type === "intervals");
      if (!quality?.structure) continue;

      const hardKm = quality.structure.blocks.reduce((sum, b) => {
        if (!("repeat" in b)) return sum;
        const perRep = b.steps
          .filter(s => s.kind === "run")
          .reduce((n, s) => n + (s.distance_km ?? 0), 0);
        return sum + perRep * b.repeat;
      }, 0);

      // Daniels' 8% cap, with one deliberate exception: three reps is the floor
      // for a real stimulus, so on a very small week the session may exceed the
      // percentage while still being trivial in absolute terms (3×400 m).
      const cap = Math.max(target * 0.08, 1.2);
      expect(hardKm, `${target} km/semana → ${hardKm} km de tiro`).toBeLessThanOrEqual(cap + 0.01);
      expect(quality.distance_km!, `${target} km: sessão de qualidade`).toBeLessThanOrEqual(target * 0.45);
    }
  });

  it("only schedules running on the days the athlete chose", () => {
    const plan = buildWeekPlan(weekContext(), ["corrida"], PREFS_3_DAYS);
    const running = plan.filter(d => d.distance_km != null).map(d => d.day);
    expect(running.sort()).toEqual(["Mon", "Sat", "Wed"]);
  });
});

describe("buildWeekPlan — calibration gating", () => {
  it("omits paces and heart rate before the 3 km test", () => {
    const plan = buildWeekPlan(
      weekContext({ paces: null, lthr: null }), ["corrida"], PREFS_3_DAYS,
    );
    for (const d of plan.filter(x => x.distance_km != null)) {
      expect(d.pace, `${d.day} must not invent a pace`).toBeUndefined();
    }
    const quality = plan.find(d => d.type === "intervals" || d.type === "tempo")!;
    for (const split of expandToKmSplits(quality.structure!)) {
      expect(split.hr).toBeUndefined();
      expect(split.paceLabel === "—" || !split.paceLabel).toBe(true);
    }
  });

  it("gives paces but no heart rate when the test had no average HR", () => {
    const plan = buildWeekPlan(
      weekContext({ paces: METRICS_NO_HR.paces, lthr: null }), ["corrida"], PREFS_3_DAYS,
    );
    const easy = plan.find(d => d.type === "easy")!;
    expect(easy.pace).toBeTruthy();
    for (const split of expandToKmSplits(easy.structure!)) {
      expect(split.hr).toBeUndefined();
    }
  });

  it("emits both once the athlete is calibrated", () => {
    const plan = buildWeekPlan(weekContext(), ["corrida"], PREFS_3_DAYS);
    const easy = plan.find(d => d.type === "easy")!;
    expect(easy.pace).toMatch(/^\d+:\d{2}–\d+:\d{2}\/km$/);
    const splits = expandToKmSplits(easy.structure!);
    expect(splits[0].hr).toBeDefined();
    expect(splits[0].hr!.min).toBeLessThan(splits[0].hr!.max);
  });
});

describe("expandToKmSplits", () => {
  it("shows recovery kilometres inside an interval session", () => {
    const plan = buildWeekPlan(weekContext({ weeklyKm: 60 }), ["corrida"], PREFS_3_DAYS);
    const quality = plan.find(d => d.type === "intervals" || d.type === "tempo")!;
    const splits = expandToKmSplits(quality.structure!);

    expect(splits.length).toBeGreaterThan(3);
    // A quality session must not read as uniformly hard kilometres.
    const kinds = new Set(splits.map(s => s.kind));
    expect(kinds.size).toBeGreaterThan(1);
    expect(splits[0].kind).toBe("warmup");
    expect(splits[splits.length - 1].kind).toBe("cooldown");
  });

  it("numbers kilometres consecutively from 1", () => {
    const plan = buildWeekPlan(weekContext(), ["corrida"], PREFS_3_DAYS);
    const long = plan.find(d => d.type === "long_run")!;
    const splits = expandToKmSplits(long.structure!);
    expect(splits.map(s => s.km)).toEqual(splits.map((_, i) => i + 1));
  });

  it("converts time-based steps to distance using their own pace", () => {
    // A jog recovery is prescribed in minutes; it still occupies the kilometres
    // it actually takes, or an interval session reads as uniform hard km.
    const fast = expandToKmSplits({ blocks: [{ kind: "run", duration_min: 30, pace: "5:00–5:00/km" }] });
    const slow = expandToKmSplits({ blocks: [{ kind: "run", duration_min: 30, pace: "7:00–7:00/km" }] });
    expect(fast.length).toBe(6);
    expect(slow.length).toBeLessThan(fast.length);
  });

  it("returns nothing for a structure with neither distance nor duration", () => {
    expect(expandToKmSplits({ blocks: [{ kind: "run" }] })).toEqual([]);
  });
});

describe("planWeeklyVolume", () => {
  it("grows by at most 10% week to week", () => {
    expect(planWeeklyVolume([30, 30, 30, 30])).toBeLessThanOrEqual(33);
    expect(planWeeklyVolume([50, 50, 50, 50])).toBeLessThanOrEqual(55);
  });

  it("caps the absolute jump for high-volume athletes", () => {
    // 10% of 120 would be 12 km added in one week — too much in absolute terms.
    expect(planWeeklyVolume([120, 120, 120, 120])).toBeLessThanOrEqual(128);
  });

  it("cuts hard in the taper", () => {
    const base = planWeeklyVolume([40, 40, 40, 40]);
    const taper = planWeeklyVolume([40, 40, 40, 40], { phase: "taper" });
    expect(taper).toBeLessThan(base * 0.7);
  });

  it("takes a cutback week every fourth week", () => {
    const normal = planWeeklyVolume([40, 40, 40, 40], { weekIndex: 2 });
    const cutback = planWeeklyVolume([40, 40, 40, 40], { weekIndex: 3 });
    expect(cutback).toBeLessThan(normal);
  });

  it("starts somewhere sensible with no history", () => {
    const v = planWeeklyVolume([]);
    expect(v).toBeGreaterThan(10);
    expect(v).toBeLessThan(30);
  });

  it("ignores a single zero week rather than averaging it in", () => {
    expect(planWeeklyVolume([30, 0, 30, 30])).toBe(planWeeklyVolume([30, 30, 30]));
  });

  it("counts the second zero week — alternating 30/0 is not a 30 km athlete", () => {
    // Ignoring every empty week let one full week speak for the month. Two
    // empty weeks out of four is a pattern, and the base has to reflect it.
    const v = planWeeklyVolume([30, 0, 30, 0]);
    expect(v).toBeLessThan(planWeeklyVolume([30, 30]));
    expect(v).toBeGreaterThanOrEqual(15);
  });

  /**
   * Someone who raced a half marathon last season and had one quiet month was
   * prescribed 11 km weeks and a 5 km long run, because the only evidence
   * considered was the last four weeks.
   */
  it("rebuilds faster toward volume the athlete has already held", () => {
    const cold   = planWeeklyVolume([12, 11, 12, 11]);
    const proven = planWeeklyVolume([12, 11, 12, 11], { provenWeeklyKm: 45 });
    expect(proven).toBeGreaterThan(cold);
  });

  it("never overshoots what was actually proven", () => {
    expect(planWeeklyVolume([12, 11, 12, 11], { provenWeeklyKm: 14 })).toBeLessThanOrEqual(14);
  });

  it("returns to the ordinary 10% ceiling once back at that level", () => {
    // Within 10% of the proven volume, this is no longer a comeback.
    const near = planWeeklyVolume([42, 43, 42, 43], { provenWeeklyKm: 45 });
    expect(near).toBeLessThanOrEqual(Math.round(42.5 * 1.1));
  });

  it("still tapers and cuts back with a comeback in progress", () => {
    const opts = { provenWeeklyKm: 45 } as const;
    expect(planWeeklyVolume([12, 11, 12, 11], { ...opts, phase: "taper" }))
      .toBeLessThan(planWeeklyVolume([12, 11, 12, 11], opts));
    expect(planWeeklyVolume([12, 11, 12, 11], { ...opts, weekIndex: 3 }))
      .toBeLessThan(planWeeklyVolume([12, 11, 12, 11], opts));
  });

  it("reaches a proven volume in a sane number of weeks, not never", () => {
    let history = [11, 12, 11, 12];
    let weeks = 0;
    while (history[0] < 40 && weeks < 30) {
      history = [planWeeklyVolume(history, { provenWeeklyKm: 45 }), ...history].slice(0, 4);
      weeks++;
    }
    expect(weeks).toBeGreaterThan(1);    // not one reckless leap
    expect(weeks).toBeLessThan(12);      // and not a whole season
  });

  it("comes back at a fraction of proven volume, not at last week plus 20%", () => {
    // Someone who raced a half in June and had a quiet July: 8 km/week last
    // month, ~25 km/week proven. Treating them as a beginner took two months
    // to return to volume they held eight weeks earlier.
    const v = planWeeklyVolume([8, 9, 8, 9], { provenWeeklyKm: 25 });
    expect(v).toBeGreaterThan(12);
    expect(v).toBeLessThanOrEqual(25 * 0.6 + 1);
  });

  it("does not let a big past volume drag a truly detrained athlete up", () => {
    // Genuinely down to 3 km a week — no leap to 15 just because of last year.
    expect(planWeeklyVolume([3, 3, 3, 3], { provenWeeklyKm: 25 })).toBeLessThanOrEqual(7);
  });
});

describe("provenCapacity", () => {
  const run = (date: string, km: number) => ({ date, distance_km: km });

  it("finds the best sustained four-week block, not one heroic week", () => {
    const runs = [
      // A single big week early on…
      run("2026-01-05", 40),
      // …then a genuinely consistent month.
      run("2026-03-02", 25), run("2026-03-09", 25), run("2026-03-16", 25), run("2026-03-23", 25),
    ];
    expect(provenCapacity(runs).weeklyKm).toBeLessThan(40);
    expect(provenCapacity(runs).weeklyKm).toBeGreaterThanOrEqual(20);
  });

  it("remembers the longest single run", () => {
    expect(provenCapacity([run("2026-03-02", 8), run("2026-05-10", 21.1)]).longestRunKm).toBe(21.1);
  });

  it("falls back to the best week when there is not a month of history", () => {
    expect(provenCapacity([run("2026-03-02", 18)]).weeklyKm).toBe(18);
  });

  it("returns zero for an athlete with no history", () => {
    expect(provenCapacity([])).toEqual({ weeklyKm: 0, longestRunKm: 0 });
  });
});

describe("hrFor", () => {
  it("returns nothing without an LTHR", () => {
    expect(hrFor("T", null)).toBeUndefined();
  });

  it("orders the zones by intensity", () => {
    const e = hrFor("E", 165)!, t = hrFor("T", 165)!, i = hrFor("I", 165)!;
    expect(e.max).toBeLessThan(t.max);
    expect(t.max).toBeLessThan(i.max);
    expect(e.min).toBeLessThan(e.max);
  });

  it("puts threshold at roughly the LTHR itself", () => {
    const t = hrFor("T", 165)!;
    expect(t.min).toBeLessThanOrEqual(165);
    expect(t.max).toBeGreaterThanOrEqual(160);
    expect(t.zone).toBe("Z4");
  });
});

describe("normalizePrefs", () => {
  it("falls back to defaults for junk input", () => {
    const p = normalizePrefs({ runDays: ["Funday", 7, null], qualityPerWeek: 99 });
    expect(p.runDays.length).toBeGreaterThan(0);
    expect(p.qualityPerWeek).toBeLessThanOrEqual(3);
  });

  it("de-duplicates and orders the week", () => {
    const p = normalizePrefs({ runDays: ["Sat", "Mon", "Mon", "Wed"] });
    expect(p.runDays).toEqual(["Mon", "Wed", "Sat"]);
  });

  it("drops a long run day that is not a run day", () => {
    const p = normalizePrefs({ runDays: ["Mon", "Wed"], longRunDay: "Sun" });
    expect(p.longRunDay === null || p.runDays.includes(p.longRunDay!)).toBe(true);
  });

  it("accepts null and undefined", () => {
    expect(() => normalizePrefs(null)).not.toThrow();
    expect(() => normalizePrefs(undefined)).not.toThrow();
  });

  it("does not invent a confirmation the athlete never gave", () => {
    expect(normalizePrefs(null).runDaysConfirmed).toBe(false);
    expect(normalizePrefs({ runDays: ["Mon"] }).runDaysConfirmed).toBe(false);
    expect(normalizePrefs({ runDaysConfirmed: "yes" }).runDaysConfirmed).toBe(false);
    expect(normalizePrefs({ runDaysConfirmed: true }).runDaysConfirmed).toBe(true);
  });
});

describe("isDefaultRunWeek", () => {
  /**
   * The bug this exists for: saving strength days writes the whole preferences
   * object, defaults included. `training_prefs != null` then looked like a
   * choice, and the setup checklist marked "monte sua semana" done for an
   * athlete who had never picked a running day.
   */
  it("recognises an athlete still on the template", () => {
    expect(isDefaultRunWeek(normalizePrefs(null))).toBe(true);
    expect(isDefaultRunWeek(normalizePrefs({ strengthDays: ["Mon", "Tue", "Wed", "Fri"] }))).toBe(true);
  });

  it("leaves alone anyone whose days already differ", () => {
    // Grandfathering: days unlike the template were chosen, flag or no flag.
    expect(isDefaultRunWeek(normalizePrefs({ runDays: ["Mon", "Wed", "Sat"] }))).toBe(false);
    expect(isDefaultRunWeek(normalizePrefs({ runDays: ["Tue", "Thu"] }))).toBe(false);
  });

  it("stops asking once the athlete confirms, even if they chose the template", () => {
    expect(isDefaultRunWeek(normalizePrefs({
      runDays: ["Tue", "Thu", "Sat"], runDaysConfirmed: true,
    }))).toBe(false);
  });
});

describe("isLegacyPlanShape", () => {
  it("flags plans from the old text generator", () => {
    expect(isLegacyPlanShape({
      days: [{ day: "Mon", dayPt: "Segunda", type: "easy", label: "Corrida", description: "5km" } as WeeklyPlanDay],
    })).toBe(true);
  });

  it("accepts plans the engine built", () => {
    const plan = buildWeekPlan(weekContext(), ["corrida"], PREFS_3_DAYS);
    expect(isLegacyPlanShape({ days: plan })).toBe(false);
  });

  it("does not flag an empty or missing plan", () => {
    expect(isLegacyPlanShape(null)).toBe(false);
    expect(isLegacyPlanShape({ days: [] })).toBe(false);
  });
});

describe("running and lifting on the same day", () => {
  /**
   * The athlete asked for runs on Mon/Wed/Sat and lifting Mon–Fri, and received
   * lifting on two days: the assembly returned early on any day that had a run,
   * throwing the strength session away without a word.
   */
  const STRENGTH_5_DAYS = normalizeStrengthPrefs({
    goal: "hipertrofia", equipment: ["academia"], sessionMinutes: 60,
    days: [
      { day: "Mon", muscles: ["peito", "core"] },
      { day: "Tue", muscles: ["costas", "biceps"] },
      { day: "Wed", muscles: ["biceps", "triceps", "core"] },
      { day: "Thu", muscles: ["costas", "core"] },
      { day: "Fri", muscles: ["ombro", "quadriceps", "gluteo"] },
    ],
  });
  const PREFS = normalizePrefs({
    runDays: ["Mon", "Wed", "Sat"],
    strengthDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    qualityPerWeek: 1,
  });

  const plan = buildWeekPlan(weekContext({ weeklyKm: 40 }), ["corrida", "musculacao"], PREFS, STRENGTH_5_DAYS);

  it("delivers every lifting day the athlete configured", () => {
    const lifting = plan.filter(d => d.strength).map(d => d.day);
    expect(lifting).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("keeps the run on days that have both", () => {
    for (const key of ["Mon", "Wed"] as const) {
      const d = dayOf(plan, key);
      expect(d.distance_km, `${key} lost its run`).toBeGreaterThan(0);
      expect(d.strength, `${key} lost its lifting`).toBeDefined();
    }
  });

  it("does not turn a configured lifting day into rest", () => {
    expect(dayOf(plan, "Thu").type).not.toBe("rest");
  });

  it("tells the athlete the order to do them in", () => {
    const mon = dayOf(plan, "Mon");
    /*
     * A frase deixou de ser gravada na descrição e passou a ser derivada da
     * sessão do dia (`day-description.ts`), porque gravada ela viajava com a
     * corrida quando a corrida mudava de dia. A garantia é a mesma; mudou o
     * lugar onde ela vale.
     */
    expect(describeDay(mon)).toMatch(/depois/i);
    expect(describeDay(mon)).toMatch(new RegExp(MUSCLE_LABEL[mon.strength!.muscles[0]], "i"));
    expect(mon.strength!.notes.some(n => /corra primeiro/i.test(n))).toBe(true);
  });

  it("backs the legs off when the same day carries a hard run", () => {
    const legsOnQualityDay = normalizeStrengthPrefs({
      goal: "suporte", equipment: ["academia"],
      days: [{ day: "Wed", muscles: ["quadriceps", "posterior", "gluteo"] }],
    });
    const p = buildWeekPlan(
      weekContext({ weeklyKm: 40 }), ["corrida", "musculacao"],
      normalizePrefs({ runDays: ["Mon", "Wed", "Sat"], qualityPerWeek: 1 }),
      legsOnQualityDay,
    );
    const wed = dayOf(p, "Wed");
    expect(wed.type).toBe("intervals");
    expect(wed.strength!.deloaded).toBe(true);
  });

  it("still produces lifting-only days as before", () => {
    const tue = dayOf(plan, "Tue");
    expect(tue.type).toBe("strength");
    expect(tue.distance_km).toBeUndefined();
  });
});

describe("syncStrengthDays", () => {
  const base = normalizeStrengthPrefs({
    goal: "hipertrofia", equipment: ["academia"],
    days: [
      { day: "Mon", muscles: ["peito", "core"] },
      { day: "Wed", muscles: ["biceps", "triceps"] },
    ],
  });

  it("creates a real day when the athlete ticks one on the other screen", () => {
    const next = syncStrengthDays(base, ["Mon", "Wed", "Thu"]);
    expect(next.days.map(d => d.day)).toEqual(["Mon", "Wed", "Thu"]);
    expect(next.days.find(d => d.day === "Thu")!.muscles.length).toBeGreaterThan(0);
  });

  it("removes a day the athlete unticks", () => {
    expect(syncStrengthDays(base, ["Mon"]).days.map(d => d.day)).toEqual(["Mon"]);
  });

  it("leaves configured muscles untouched", () => {
    const next = syncStrengthDays(base, ["Mon", "Wed", "Fri"]);
    expect(next.days.find(d => d.day === "Mon")!.muscles).toEqual(["peito", "core"]);
  });

  it("does not put a new leg day next to an existing one", () => {
    // Legs on Thursday and Friday also means legs the day before a Saturday
    // long run — the arrangement the advisor exists to complain about.
    const withFridayLegs = normalizeStrengthPrefs({
      goal: "hipertrofia", equipment: ["academia"],
      days: [
        { day: "Mon", muscles: ["peito", "core"] },
        { day: "Tue", muscles: ["costas", "core"] },
        { day: "Wed", muscles: ["biceps", "triceps"] },
        { day: "Fri", muscles: ["ombro", "quadriceps", "gluteo"] },
      ],
    });
    const next = syncStrengthDays(withFridayLegs, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
    const thu = next.days.find(d => d.day === "Thu")!;
    expect(thu.muscles.some(m => ["quadriceps", "posterior", "gluteo"].includes(m))).toBe(false);
  });

  it("does not make every new day a leg day", () => {
    const next = syncStrengthDays(base, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
    const lower = next.days.filter(d =>
      d.muscles.some(m => ["quadriceps", "posterior", "gluteo"].includes(m))).length;
    expect(lower).toBeLessThan(next.days.length);
  });

  it("returns the same object when nothing changed", () => {
    expect(syncStrengthDays(base, ["Mon", "Wed"])).toBe(base);
  });

  it("keeps the days in weekday order", () => {
    const next = syncStrengthDays(base, ["Fri", "Mon", "Tue", "Wed"]);
    expect(next.days.map(d => d.day)).toEqual(["Mon", "Tue", "Wed", "Fri"]);
  });
});

describe("multi-sport weeks", () => {
  it("never leaves a run day without a session", () => {
    const plan = buildWeekPlan(weekContext(), ["corrida", "musculacao"], PREFS_3_DAYS);
    for (const day of PREFS_3_DAYS.runDays) {
      expect(dayOf(plan, day).type).not.toBe("rest");
    }
  });

  it("produces a full seven-day week with no duplicates", () => {
    const plan = buildWeekPlan(weekContext(), ["corrida", "musculacao"], PREFS_3_DAYS);
    expect(plan).toHaveLength(7);
    expect(new Set(plan.map(d => d.day)).size).toBe(7);
  });

  it("skips running entirely when the athlete does not run", () => {
    const plan = buildWeekPlan(weekContext(), ["musculacao"], PREFS_3_DAYS);
    expect(plan.filter(d => d.distance_km != null)).toHaveLength(0);
  });

  it("labels every session with a sport", () => {
    const plan = buildWeekPlan(weekContext(), ["corrida", "musculacao"], PREFS_3_DAYS);
    for (const d of plan.filter(x => x.type !== "rest")) {
      expect(d.sport, `${d.day} (${d.type}) has no sport`).toBeTruthy();
    }
  });
});

/**
 * "3,5 km não é corrida para corredor experiente" e "não faz sentido o volume
 * de nenhum dia diminuir semana após semana se estou executando os treinos".
 *
 * As duas reclamações têm a mesma raiz: o volume era recalculado toda semana a
 * partir do que foi *corrido*, não do que foi *prescrito*. Uma semana leve
 * derrubava a seguinte, que derrubava a próxima.
 */
describe("pisos de sessão e catraca de volume", () => {
  it("não prescreve rodagem abaixo do piso quando a semana comporta", () => {
    // 30 km/semana com 2 rodagens comporta longão de verdade E rodagem decente.
    // Abaixo disso os dois competem, e aí o longão tem prioridade.
    const { easyKm } = distributeWeeklyVolume(30, 2, 6, 4, 21.4, { minRunKm: 5 });
    expect(easyKm).toBeGreaterThanOrEqual(5);
  });

  it("honra o longão pedido quando o histórico sustenta", () => {
    const { longKm } = distributeWeeklyVolume(20, 2, 5, 4, 21.4,
      { minRunKm: 5, minLongRunKm: 8 });
    expect(longKm).toBeGreaterThanOrEqual(8);
  });

  it("ignora um longão pedido que o atleta nunca correu", () => {
    // Pedir 15 km sem nunca ter passado de 4 não é preferência, é acidente.
    const { longKm } = distributeWeeklyVolume(20, 2, 5, 4, 4,
      { minRunKm: 5, minLongRunKm: 15 });
    expect(longKm).toBeLessThan(15);
  });

  it("cede o piso em vez de estourar o volume da semana", () => {
    // Semana pequena demais para 3 corridas de 5 km: o certo é encolher, não
    // entregar 20 km quando o alvo era 12.
    const { longKm, easyKm } = distributeWeeklyVolume(12, 2, 3, 4, 21.4, { minRunKm: 5 });
    expect(longKm + easyKm * 2).toBeLessThanOrEqual(12 * 1.1);
  });

  it("nunca reduz o volume de quem cumpriu a semana anterior", () => {
    expect(volumeWithRatchet(14, { previousPlannedKm: 16, previousActualKm: 15 })).toBe(16);
    expect(volumeWithRatchet(18, { previousPlannedKm: 16, previousActualKm: 15 })).toBe(18);
  });

  it("deixa a semana de recuperação e o taper caírem", () => {
    expect(volumeWithRatchet(11, {
      previousPlannedKm: 16, previousActualKm: 15, lighterByDesign: true,
    })).toBe(11);
  });

  it("acompanha para baixo quem realmente parou", () => {
    // 4 de 16 km não é uma semana ruim, é um atleta parado — empilhar
    // quilômetro não corrido em cima disso não ajuda ninguém.
    expect(volumeWithRatchet(10, { previousPlannedKm: 16, previousActualKm: 4 })).toBe(10);
  });

  it("não encolhe ao longo de 8 semanas de execução completa", () => {
    let planned = 16;
    const seen: number[] = [];
    for (let w = 0; w < 8; w++) {
      const proposed = planWeeklyVolume([planned, planned, planned, planned], { provenWeeklyKm: 30 });
      planned = volumeWithRatchet(proposed, {
        previousPlannedKm: planned,
        previousActualKm: planned,          // cumpriu tudo
        lighterByDesign: w > 0 && w % 4 === 3,
      });
      seen.push(planned);
    }
    // Fora as semanas de recuperação, nunca abaixo de onde começou.
    const hard = seen.filter((_, i) => !(i > 0 && i % 4 === 3));
    for (const km of hard) expect(km).toBeGreaterThanOrEqual(16);
  });
});
