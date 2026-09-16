/**
 * Adapting a session — before it happens, and reading one that changed.
 *
 * The case that started it (16/09): the plan said hills, Sérgio did 8 × 400 m,
 * and the check-in compared the run against the hill session.
 */
import { describe, expect, it } from "vitest";
import {
  adaptOptions, applyAdaptation, evaluateProposal, executionDiffers, isAdaptable,
  parseProposal, sessionKindOf, toTimeBased, undoAdaptation,
} from "@/lib/session-adapt";
import { buildIntervalRun, buildEasyRun, buildLongRun } from "@/lib/workout-builder";
import { weekContext } from "./fixtures";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const ctx = weekContext({ weeklyKm: 19 });

function planDay(day: WeeklyPlanDay["day"], built: { day: Partial<WeeklyPlanDay>; structure: WeeklyPlanDay["structure"] }): WeeklyPlanDay {
  return { day, dayPt: day, sport: "corrida", type: "rest", label: "", description: "", ...built.day, structure: built.structure } as WeeklyPlanDay;
}

const hills = planDay("Wed", buildIntervalRun({ ...ctx, forceQuality: "hills" }));
const intervals = planDay("Wed", buildIntervalRun({ ...ctx, forceQuality: "intervals" }));
const easy = planDay("Mon", buildEasyRun(ctx, 6));
const long = planDay("Sat", buildLongRun(ctx, 9.5));

describe("knowing what a session is", () => {
  it("reads the tag the builder now writes", () => {
    expect(sessionKindOf(hills)).toBe("hills");
  });
  it("still recognises plans written before the tag existed", () => {
    expect(sessionKindOf({ ...hills, quality: undefined, label: "Subidas 6×45 s" })).toBe("hills");
    expect(sessionKindOf({ ...intervals, quality: undefined, label: "Tiro 3×400 m" })).toBe("intervals");
  });
  it("never offers to adapt a test or a race", () => {
    expect(isAdaptable({ ...hills, type: "test", quality: undefined, label: "Teste de 3 km" })).toBe(false);
    expect(isAdaptable({ ...easy, type: "race", label: "Prova" })).toBe(false);
    expect(isAdaptable(easy)).toBe(true);
  });
});

describe("alternatives for a restriction", () => {
  it("offers a flat alternative to hills when there is no hill, recommended first", () => {
    const { options } = adaptOptions(hills, "place", ctx);
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options.length).toBeLessThanOrEqual(3);
    expect(options[0].recommended).toBe(true);
    expect(sessionKindOf(options[0].day)).toBe("repetitions");
    expect(options[0].preserves).toContain("esforços curtos");
    expect(options[0].changes).toContain("sem inclinação");
  });

  it("never suggests a session type the athlete excluded", () => {
    const { options } = adaptOptions(hills, "place", { ...ctx, excludedQuality: ["fartlek"] });
    expect(options.map(o => sessionKindOf(o.day))).not.toContain("fartlek");
  });

  it("keeps the stimulus and shortens the session when time is short", () => {
    const { options } = adaptOptions(intervals, "time", ctx);
    expect(options[0].id).toBe("shorter");
    expect(options[0].estimatedMin).toBeLessThan(adaptOptions(intervals, "format", ctx).options[0]?.estimatedMin ?? 999);
    expect(options[0].preserves).toContain("VO₂máx");
  });

  it("turns a distance session into the same session by time, for any route or no GPS", () => {
    const timed = toTimeBased(intervals, ctx.paces)!;
    const steps = timed.structure!.blocks;
    expect(timed.label).toContain("por tempo");
    expect(JSON.stringify(steps)).not.toContain("distance_km");
  });

  it("says plainly when an easy run has no other format that keeps its purpose", () => {
    const result = adaptOptions(easy, "format", ctx);
    expect(result.limitation).toContain("Rodagem leve");
  });

  it("never pads the list with fake alternatives", () => {
    for (const reason of ["time", "place", "equipment", "format", "other"] as const) {
      for (const day of [hills, intervals, easy, long]) {
        const keys = adaptOptions(day, reason, ctx).options.map(o => `${o.day.label}|${o.day.distance_km}`);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).not.toContain(`${day.label}|${day.distance_km}`);
      }
    }
  });

  it("keeps the lifting session that shares the day", () => {
    const withGym = { ...intervals, strength: { exercises: [] } as never, description: `${intervals.description} Depois (idealmente ~6 h depois), musculação: peito.` };
    const { options } = adaptOptions(withGym, "time", ctx);
    expect(options[0].day.strength).toBeDefined();
    expect(options[0].day.description).toContain("musculação: peito");
  });
});

describe("reading the athlete's own proposal", () => {
  it.each([
    ["8x400m", { reps: 8, repKm: 0.4, kind: "intervals" }],
    ["8 × 400 m com 2 min de trote", { reps: 8, repKm: 0.4, recoveryMin: 2 }],
    ["6x1km", { reps: 6, repKm: 1 }],
    ["5x1000", { reps: 5, repKm: 1 }],
    ["10x200", { reps: 10, repKm: 0.2, kind: "repetitions" }],
    ["6x3min", { reps: 6, repMin: 3, kind: "intervals" }],
    ["8x45s em subida", { reps: 8, repMin: 0.75, kind: "hills" }],
    ["20 min em limiar", { continuousMin: 20, kind: "threshold" }],
    ["10 km leve", { continuousKm: 10, kind: "easy" }],
  ])("understands %s", (text, expected) => {
    const parsed = parseProposal(text);
    expect(parsed.missing).toEqual([]);
    expect(parsed).toMatchObject(expected);
  });

  it("reads warm-up and cool-down without confusing them", () => {
    const parsed = parseProposal("2 km de aquecimento, 8x400m, 1,25 km de desaquecimento");
    expect(parsed.warmupKm).toBe(2);
    expect(parsed.cooldownKm).toBe(1.25);
  });

  it("asks only for what is missing", () => {
    expect(parseProposal("8x4").missing[0]).toContain("unidade");
    expect(parseProposal("30 min").missing[0]).toContain("intensidade");
    expect(parseProposal("quero correr hoje").missing[0]).toContain("formato");
  });
});

describe("judging the proposal", () => {
  it("disagrees, and explains, when 8 × 400 m replaces hills", () => {
    const evaluation = evaluateProposal("8x400m", hills, ctx);
    expect(evaluation.understood).toBe(true);
    expect(evaluation.verdict).toBe("different");
    expect(evaluation.message).toContain("Não é um substituto equivalente");
    expect(evaluation.changes).toContain("VO₂máx");
  });

  it("agrees when the swap keeps the purpose", () => {
    const evaluation = evaluateProposal("5x800m", intervals, ctx);
    expect(evaluation.verdict).toBe("equivalent");
  });

  it("proposes a smaller version when the idea is sound but too big for the week", () => {
    const evaluation = evaluateProposal("8x400m", intervals, ctx);
    expect(evaluation.adjusted).toBeDefined();
    expect(evaluation.adjusted!.why).toContain("teto recomendado");
    expect(evaluation.adjusted!.day.label).toMatch(/^3×400 m/);
  });

  it("says what it assumed", () => {
    const evaluation = evaluateProposal("6x800m", intervals, ctx);
    expect(evaluation.assumptions.join(" ")).toContain("trote entre as repetições");
  });

  it("warns that turning an easy day into a workout changes the week", () => {
    const evaluation = evaluateProposal("6x800m", easy, ctx);
    expect(evaluation.verdict).toBe("different");
    expect(evaluation.message).toContain("dia leve");
  });
});

describe("recording the decision", () => {
  const plan: WeeklyPlanData = { week_start: "2026-09-14", generated_at: "x", days: [easy, hills, long] };
  const meta = { when: "before" as const, reason: "place" as const, source: "option" as const, preserves: "p", changes: "c" };

  it("replaces the day and keeps the original inside", () => {
    const option = adaptOptions(hills, "place", ctx).options[0].day;
    const result = applyAdaptation(plan, "Wed", option, meta);
    expect("plan" in result).toBe(true);
    const day = ("plan" in result ? result.plan : plan).days.find(d => d.day === "Wed")!;
    expect(day.label).toBe(option.label);
    expect(day.adaptation?.original.label).toBe(hills.label);
  });

  it("keeps the true original when a session is adapted twice", () => {
    const first = applyAdaptation(plan, "Wed", adaptOptions(hills, "place", ctx).options[0].day, meta);
    const second = applyAdaptation("plan" in first ? first.plan : plan, "Wed", adaptOptions(hills, "time", ctx).options[0].day, meta);
    const day = ("plan" in second ? second.plan : plan).days.find(d => d.day === "Wed")!;
    expect(day.adaptation?.original.label).toBe(hills.label);
  });

  it("puts the original back on undo", () => {
    const adapted = applyAdaptation(plan, "Wed", adaptOptions(hills, "place", ctx).options[0].day, meta);
    const undone = undoAdaptation("plan" in adapted ? adapted.plan : plan, "Wed");
    const day = ("plan" in undone ? undone.plan : plan).days.find(d => d.day === "Wed")!;
    expect(day).toEqual(hills);
  });

  it("refuses to adapt a session already swapped by recovery", () => {
    const swapped: WeeklyPlanData = { ...plan, days: plan.days.map(d => d.day === "Wed" ? { ...d, swap: {} as never } : d) };
    const result = applyAdaptation(swapped, "Wed", easy, meta);
    expect("error" in result).toBe(true);
  });
});

describe("after the session: asking only when it looks different", () => {
  it("asks when hills of 3,5 km turned into an 8 km run", () => {
    expect(executionDiffers({ ...hills, distance_km: 3.5 }, { distance_km: 8.01, avg_pace_seconds_per_km: 330 })).toBe(true);
  });
  it("stays quiet when the run matches the plan", () => {
    expect(executionDiffers(easy, { distance_km: 6.02, avg_pace_seconds_per_km: 372 }, ctx.paces)).toBe(false);
  });
  it("notices an easy run clearly run as a workout", () => {
    expect(executionDiffers(easy, { distance_km: 6, avg_pace_seconds_per_km: 240 }, ctx.paces)).toBe(true);
  });
  it("does not ask again about a session adapted beforehand", () => {
    const adapted = { ...hills, adaptation: { when: "before", at: "x", reason: "place", source: "option", preserves: "", changes: "", original: hills } } as WeeklyPlanDay;
    expect(executionDiffers(adapted, { distance_km: 8, avg_pace_seconds_per_km: 330 })).toBe(false);
  });
});
