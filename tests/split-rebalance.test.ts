import { describe, it, expect } from "vitest";
import { proposeSplit, type SplitDay } from "@/lib/split-rebalance";
import type { MuscleGroup } from "@/lib/exercises";

/**
 * The proposal has to be trustworthy *before* it is applied, because the whole
 * point is that the athlete looks at it and decides. So these tests care less
 * about elegance than about the promises the preview makes:
 *
 *   • it never invents work the athlete does not already do
 *   • it never silently drops a muscle
 *   • it says so when it cannot help, instead of shuffling for the sake of it
 *   • what it shows as "after" is what would actually be saved
 */

const LOWER: MuscleGroup[] = ["gluteo", "posterior", "quadriceps", "panturrilha"];

/** Sérgio's real split: five days, every muscle once. */
const BRO_SPLIT: SplitDay[] = [
  { day: "Mon", muscles: ["peito"] },
  { day: "Tue", muscles: ["costas"] },
  { day: "Wed", muscles: ["biceps", "triceps"] },
  { day: "Thu", muscles: ["ombro", "gluteo", "quadriceps"] },
  { day: "Fri", muscles: ["core"] },
];

const freq = (days: SplitDay[]) => {
  const m = new Map<string, number>();
  for (const d of days) for (const x of Array.from(new Set(d.muscles))) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};

describe("when there is nothing to fix", () => {
  it("declines a single lifting day", () => {
    const p = proposeSplit([{ day: "Mon", muscles: ["peito", "costas"] }]);
    expect(p.worthIt).toBe(false);
    expect(p.reason).toMatch(/menos de dois dias/i);
    expect(p.after).toEqual(p.before);
  });

  it("declines a split that already trains everything twice", () => {
    const good: SplitDay[] = [
      { day: "Mon", muscles: ["peito", "costas"] },
      { day: "Wed", muscles: ["gluteo", "posterior"] },
      { day: "Thu", muscles: ["peito", "costas"] },
      { day: "Sat", muscles: ["gluteo", "posterior"] },
    ];
    const p = proposeSplit(good);
    expect(p.worthIt).toBe(false);
    expect(p.reason).toMatch(/já aparecem/i);
  });

  it("returns the current split untouched when it declines", () => {
    // A preview that mutates what it was shown is a preview nobody can trust.
    const p = proposeSplit([{ day: "Mon", muscles: ["peito"] }]);
    expect(p.after).toEqual(p.before);
    expect(p.frequency).toEqual([]);
  });
});

describe("the bro-split, rebalanced", () => {
  const p = proposeSplit(BRO_SPLIT, { longRunDay: "Sat" });

  it("finds it worth changing", () => {
    expect(p.worthIt).toBe(true);
  });

  it("keeps the same days — it rebalances, it does not add gym time", () => {
    expect(p.after.map(d => d.day)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("raises frequency for most muscles", () => {
    const antes = freq(p.before);
    const depois = freq(p.after);
    const subiu = Array.from(antes.keys()).filter(m => (depois.get(m) ?? 0) > (antes.get(m) ?? 0));
    expect(subiu.length).toBeGreaterThanOrEqual(4);
  });

  it("never invents a muscle the athlete does not train", () => {
    // Somebody who never trains calves did not ask to start today.
    const treinados = new Set(BRO_SPLIT.flatMap(d => d.muscles));
    for (const d of p.after) {
      for (const m of d.muscles) expect(treinados.has(m)).toBe(true);
    }
  });

  it("never silently drops a muscle group", () => {
    const antes = new Set(BRO_SPLIT.flatMap(d => d.muscles));
    const depois = new Set(p.after.flatMap(d => d.muscles));
    for (const m of Array.from(antes)) expect(depois.has(m)).toBe(true);
  });

  it("keeps sessions to a size that fits in an hour", () => {
    for (const d of p.after) expect(d.muscles.length).toBeLessThanOrEqual(3);
  });

  it("leaves no day empty", () => {
    for (const d of p.after) expect(d.muscles.length).toBeGreaterThan(0);
  });
});

describe("running comes first", () => {
  it("keeps heavy legs off the eve of the long run", () => {
    // Saturday's long run is the week's most valuable session; Friday legs
    // would hand it a pair of legs 24 hours into repair.
    const p = proposeSplit(BRO_SPLIT, { longRunDay: "Sat" });
    const friday = p.after.find(d => d.day === "Fri")!;
    const pernaNaSexta = friday.muscles.filter(m => LOWER.includes(m)).length;
    expect(pernaNaSexta).toBe(0);
  });

  it("does the same when the long run moves", () => {
    const p = proposeSplit(BRO_SPLIT, { longRunDay: "Thu" });
    const wed = p.after.find(d => d.day === "Wed")!;
    expect(wed.muscles.filter(m => LOWER.includes(m))).toHaveLength(0);
  });

  it("still trains legs somewhere", () => {
    // Protecting the long run must not mean skipping lower body altogether.
    const p = proposeSplit(BRO_SPLIT, { longRunDay: "Sat" });
    const temPerna = p.after.some(d => d.muscles.some(m => LOWER.includes(m)));
    expect(temPerna).toBe(true);
  });

  it("works with no long run set", () => {
    const p = proposeSplit(BRO_SPLIT);
    expect(p.worthIt).toBe(true);
    expect(p.after.some(d => d.muscles.some(m => LOWER.includes(m)))).toBe(true);
  });
});

describe("upper and lower alternate", () => {
  it("does not put two leg days back to back", () => {
    const p = proposeSplit([
      { day: "Mon", muscles: ["peito"] },
      { day: "Tue", muscles: ["costas"] },
      { day: "Wed", muscles: ["gluteo"] },
      { day: "Thu", muscles: ["quadriceps"] },
    ]);
    const isLower = p.after.map(d => d.muscles.some(m => LOWER.includes(m)));
    for (let i = 1; i < isLower.length; i++) {
      expect(isLower[i] && isLower[i - 1]).toBe(false);
    }
  });
});

describe("the summary tells the truth", () => {
  const p = proposeSplit(BRO_SPLIT, { longRunDay: "Sat" });

  it("counts the muscles that actually improved", () => {
    const subiram = p.frequency.filter(f => f.after > f.before).length;
    expect(p.summary).toContain(String(subiram));
    expect(p.summary).toContain("5 dias");
  });

  it("admits when something loses frequency instead of hiding it", () => {
    const perderam = p.frequency.filter(f => f.after < f.before);
    if (perderam.length > 0) {
      for (const w of perderam) expect(p.summary).toContain(w.label);
    }
  });

  it("reports a before and after for every muscle trained", () => {
    const treinados = new Set(BRO_SPLIT.flatMap(d => d.muscles));
    expect(new Set(p.frequency.map(f => f.muscle))).toEqual(treinados);
    for (const f of p.frequency) {
      expect(f.label.length).toBeGreaterThan(2);
      expect(f.before).toBeGreaterThanOrEqual(1);
    }
  });

  it("puts the biggest losses first, so bad news is not buried", () => {
    const deltas = p.frequency.map(f => f.after - f.before);
    expect([...deltas].sort((a, b) => a - b)).toEqual(deltas);
  });
});

describe("determinism", () => {
  it("gives the same answer every time", () => {
    const a = proposeSplit(BRO_SPLIT, { longRunDay: "Sat" });
    const b = proposeSplit(BRO_SPLIT, { longRunDay: "Sat" });
    expect(a.after).toEqual(b.after);
  });

  it("does not depend on the order the days arrive in", () => {
    const shuffled = [...BRO_SPLIT].reverse();
    const a = proposeSplit(BRO_SPLIT, { longRunDay: "Sat" });
    const b = proposeSplit(shuffled, { longRunDay: "Sat" });
    expect(b.after).toEqual(a.after);
  });

  it("does not mutate what it was given", () => {
    const original = JSON.parse(JSON.stringify(BRO_SPLIT));
    proposeSplit(BRO_SPLIT, { longRunDay: "Sat" });
    expect(BRO_SPLIT).toEqual(original);
  });
});
