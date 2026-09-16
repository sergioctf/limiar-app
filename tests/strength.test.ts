import { describe, it, expect } from "vitest";
import { buildStrengthSession } from "@/lib/strength-builder";
import { blockWeekFor, strengthBlockFor, runningLoadFactor } from "@/lib/strength-cycle";
import { nextTarget, summarizeSessions } from "@/lib/strength-progression";
import { normalizeStrengthPrefs, GOAL_PARAMS } from "@/lib/strength-prefs";
import { exerciseById } from "@/lib/exercises";
import type { StrengthDayPlan, StrengthPrefs } from "@/lib/strength-prefs";
import type { MuscleGroup } from "@/lib/exercises";

const prefs = (over: Partial<StrengthPrefs> = {}): StrengthPrefs => normalizeStrengthPrefs({
  goal: "hipertrofia",
  experience: "intermediario",
  equipment: ["academia"],
  sessionMinutes: 60,
  style: "misto",
  days: [{ day: "Tue", muscles: ["quadriceps", "posterior", "gluteo"] }],
  ...over,
});

const legDay: StrengthDayPlan = { day: "Tue", muscles: ["quadriceps", "posterior", "gluteo"], cardio: null };

describe("buildStrengthSession", () => {
  it("prescribes the day's muscles, plus the runner essentials on leg days", () => {
    const s = buildStrengthSession({ prefs: prefs(), day: legDay, phase: "base" });
    expect(s.exercises.length).toBeGreaterThan(0);

    // Calves and the Nordic curl are added deliberately whenever legs are
    // trained — they prevent the injuries running causes, whether or not the
    // athlete thought to tick those boxes.
    for (const p of s.exercises) {
      const ex = exerciseById(p.exerciseId)!;
      const trainsChosen = [...ex.primary, ...ex.secondary]
        .some(m => legDay.muscles.includes(m as MuscleGroup));
      const isEssential = ex.id === "nordico" || ex.primary.includes("panturrilha");
      expect(trainsChosen || isEssential, `${ex.name} trains nothing requested`).toBe(true);
    }
    expect(s.exercises.some(e => e.exerciseId === "nordico")).toBe(true);
  });

  it("does not add leg essentials to an upper body day", () => {
    const s = buildStrengthSession({
      prefs: prefs({ days: [{ day: "Thu", muscles: ["peito", "costas"] }] }),
      day: { day: "Thu", muscles: ["peito", "costas"], cardio: null },
      phase: "base",
    });
    expect(s.exercises.some(e => e.exerciseId === "nordico")).toBe(false);
  });

  /**
   * A chest day came back with two exercises and 17 minutes of work out of a
   * 60-minute budget: selection stopped as soon as each requested muscle had
   * met its target and never used the time the athlete had set aside.
   */
  it("fills the session the athlete asked for, even on a narrow day", () => {
    for (const muscles of [["peito"], ["peito", "core"], ["costas"], ["biceps", "triceps"]] as MuscleGroup[][]) {
      const s = buildStrengthSession({
        prefs: prefs({ days: [{ day: "Mon", muscles }], sessionMinutes: 60 }),
        day: { day: "Mon", muscles, cardio: null }, phase: "base",
      });
      expect(s.exercises.length, muscles.join("/")).toBeGreaterThanOrEqual(4);
      // Isolation-only days are legitimately shorter (light loads, short rests),
      // so the bar is "a real session", not a fixed share of the budget.
      expect(s.estimatedMinutes, muscles.join("/")).toBeGreaterThanOrEqual(25);
    }
  });

  it("scales the session with the time available", () => {
    const day = { day: "Mon" as const, muscles: ["peito", "core"] as MuscleGroup[], cardio: null };
    const short = buildStrengthSession({
      prefs: prefs({ days: [day], sessionMinutes: 30 }), day, phase: "base",
    });
    const long = buildStrengthSession({
      prefs: prefs({ days: [day], sessionMinutes: 75 }), day, phase: "base",
    });
    expect(long.exercises.length).toBeGreaterThanOrEqual(short.exercises.length);
  });

  /**
   * A barbell squat was landing on a biceps/triceps day: candidates matched on
   * secondary muscles too, and the squat brushes the core.
   */
  it("does not put a leg compound on an arms day", () => {
    const muscles: MuscleGroup[] = ["biceps", "triceps", "core"];
    const s = buildStrengthSession({
      prefs: prefs({ days: [{ day: "Mon", muscles }] }),
      day: { day: "Mon", muscles, cardio: null }, phase: "base",
    });
    for (const p of s.exercises) {
      const ex = exerciseById(p.exerciseId)!;
      const isLeg = ex.primary.some(m => ["quadriceps", "posterior", "gluteo"].includes(m));
      expect(isLeg, `${ex.name} numa sessão de braço`).toBe(false);
    }
  });

  it("keeps single-leg work on days that actually train legs", () => {
    const chest: MuscleGroup[] = ["peito", "core"];
    const s = buildStrengthSession({
      prefs: prefs({ days: [{ day: "Mon", muscles: chest }] }),
      day: { day: "Mon", muscles: chest, cardio: null }, phase: "base",
    });
    expect(s.exercises.some(e => e.exerciseId === "bulgaro")).toBe(false);
  });

  /**
   * The roster the athlete edited while logging. The gym does not follow the
   * plan — a machine is taken, something hurts — and re-proposing the same
   * substitution every week is how an app stops being useful.
   */
  describe("roster do atleta", () => {
    const muscles: MuscleGroup[] = ["peito", "core"];
    const roster = ["supino-inclinado", "flexao", "prancha"];

    it("uses exactly the exercises the athlete kept, in order", () => {
      const day = { day: "Mon" as const, muscles, exercises: roster, cardio: null };
      const s = buildStrengthSession({
        prefs: prefs({ days: [day] }), day, phase: "base",
      });
      expect(s.exercises.map(e => e.exerciseId)).toEqual(roster);
    });

    it("still prescribes sets, reps and RIR for them", () => {
      const day = { day: "Mon" as const, muscles, exercises: roster, cardio: null };
      const s = buildStrengthSession({ prefs: prefs({ days: [day] }), day, phase: "base" });
      for (const p of s.exercises) {
        expect(p.sets).toBeGreaterThan(0);
        expect(p.reps[0]).toBeGreaterThan(0);
        expect(p.cue.length).toBeGreaterThan(5);
      }
    });

    it("still honours the avoid list over the roster", () => {
      const day = { day: "Mon" as const, muscles, exercises: roster, cardio: null };
      const s = buildStrengthSession({
        prefs: prefs({ days: [day], avoid: ["flexao"] }), day, phase: "base",
      });
      expect(s.exercises.map(e => e.exerciseId)).not.toContain("flexao");
    });

    it("falls back to choosing when there is no roster", () => {
      const day = { day: "Mon" as const, muscles, cardio: null };
      const s = buildStrengthSession({ prefs: prefs({ days: [day] }), day, phase: "base" });
      expect(s.exercises.length).toBeGreaterThanOrEqual(4);
    });

    it("still deloads a roster week", () => {
      const day = { day: "Mon" as const, muscles, exercises: roster, cardio: null };
      const normal = buildStrengthSession({
        prefs: prefs({ days: [day] }), day, phase: "base",
        block: strengthBlockFor("2026-01-05", "base"),
      });
      const deload = buildStrengthSession({
        prefs: prefs({ days: [day] }), day, phase: "base",
        block: strengthBlockFor("2026-01-26", "base"),
      });
      const sets = (s: typeof normal) => s.exercises.reduce((n, e) => n + e.sets, 0);
      expect(sets(deload)).toBeLessThan(sets(normal));
    });
  });

  it("keeps an unknown exercise id out of the roster", () => {
    const p = normalizeStrengthPrefs({
      goal: "hipertrofia", equipment: ["academia"],
      days: [{ day: "Mon", muscles: ["peito"], exercises: ["supino-reto", "inventado", 42] }],
    });
    expect(p.days[0].exercises).toEqual(["supino-reto"]);
  });

  it("leaves the roster undefined when the athlete never edited the day", () => {
    const p = normalizeStrengthPrefs({
      goal: "hipertrofia", equipment: ["academia"],
      days: [{ day: "Mon", muscles: ["peito"] }],
    });
    expect(p.days[0].exercises).toBeUndefined();
  });

  it("marks exactly one main lift and puts it first", () => {
    const s = buildStrengthSession({ prefs: prefs(), day: legDay, phase: "base" });
    const mains = s.exercises.filter(e => e.main);
    expect(mains).toHaveLength(1);
    expect(s.exercises[0].main).toBe(true);
  });

  it("fits inside the session length the athlete asked for", () => {
    for (const minutes of [30, 45, 60, 90]) {
      const s = buildStrengthSession({ prefs: prefs({ sessionMinutes: minutes }), day: legDay, phase: "base" });
      expect(s.estimatedMinutes, `${minutes} min budget`).toBeLessThanOrEqual(minutes * 1.15);
    }
  });

  it("never prescribes an exercise the athlete asked to avoid", () => {
    const full = buildStrengthSession({ prefs: prefs(), day: legDay, phase: "base" });
    const banned = full.exercises[0].exerciseId;
    const s = buildStrengthSession({ prefs: prefs({ avoid: [banned] }), day: legDay, phase: "base" });
    expect(s.exercises.map(e => e.exerciseId)).not.toContain(banned);
  });

  it("respects the equipment available", () => {
    const s = buildStrengthSession({
      prefs: prefs({ equipment: ["peso_corporal"] }), day: legDay, phase: "base",
    });
    for (const p of s.exercises) {
      expect(exerciseById(p.exerciseId)!.equipment).toBe("peso_corporal");
    }
  });

  it("uses the rep range the goal calls for", () => {
    const strength = buildStrengthSession({ prefs: prefs({ goal: "forca" }), day: legDay, phase: "base" });
    const hypertrophy = buildStrengthSession({ prefs: prefs({ goal: "hipertrofia" }), day: legDay, phase: "base" });
    const mainReps = (s: typeof strength) => s.exercises.find(e => e.main)!.reps;
    // Max-strength work sits at fewer reps than hypertrophy work.
    expect(mainReps(strength)[1]).toBeLessThanOrEqual(mainReps(hypertrophy)[1]);
    expect(GOAL_PARAMS.forca.restSeconds).toBeGreaterThan(GOAL_PARAMS.hipertrofia.restSeconds);
  });

  it("gives every prescription a cue, not just numbers", () => {
    const s = buildStrengthSession({ prefs: prefs(), day: legDay, phase: "base" });
    for (const p of s.exercises) {
      expect(p.cue.length, `${p.exerciseId} has no cue`).toBeGreaterThan(5);
      expect(p.sets).toBeGreaterThan(0);
      expect(p.restSeconds).toBeGreaterThan(0);
    }
  });

  it("does not repeat a heavy compound already used earlier in the week", () => {
    const first = buildStrengthSession({ prefs: prefs(), day: legDay, phase: "base" });
    const used = first.exercises.filter(e => e.main).map(e => e.exerciseId);
    const second = buildStrengthSession({ prefs: prefs(), day: legDay, phase: "base", usedCompounds: used });
    expect(second.exercises.find(e => e.main)!.exerciseId).not.toBe(used[0]);
  });
});

describe("deload weeks", () => {
  /**
   * The deload once failed to deload: fewer sets per exercise freed up time, so
   * the builder fitted MORE exercises and total weekly volume went up. Compare
   * total sets, never sets-per-exercise.
   */
  it("actually reduces total sets", () => {
    const normal = buildStrengthSession({
      prefs: prefs(), day: legDay, phase: "base",
      block: strengthBlockFor("2026-01-05", "base"),      // week 1 of the block
    });
    const deload = buildStrengthSession({
      prefs: prefs(), day: legDay, phase: "base",
      block: strengthBlockFor("2026-01-26", "base"),      // week 4 — consolidation
    });

    const totalSets = (s: typeof normal) => s.exercises.reduce((n, e) => n + e.sets, 0);
    expect(deload.deloaded).toBe(true);
    expect(totalSets(deload)).toBeLessThan(totalSets(normal));
  });

  /**
   * Bug reported from the gym: a consolidation week prescribed exercises with a
   * single set. `round(2 × 0.6)` is 1, and one set of an accessory is not a
   * lighter dose — it is a rounding artefact that reads as a broken plan. The
   * volume cut belongs to the total-set ceiling, which drops whole accessories.
   */
  it("nunca prescreve série única fora da semana de prova", () => {
    for (const week of ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]) {
      for (const phase of ["base", "build", "peak"] as const) {
        const s = buildStrengthSession({
          prefs: prefs(), day: legDay, phase,
          block: strengthBlockFor(week, phase),
        });
        for (const e of s.exercises) {
          expect(e.sets, `${week} ${phase} — ${e.name}`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("ainda assim entrega menos volume na semana 4 que na semana 1", () => {
    const total = (w: string) => buildStrengthSession({
      prefs: prefs(), day: legDay, phase: "base", block: strengthBlockFor(w, "base"),
    }).exercises.reduce((n, e) => n + e.sets, 0);

    // O piso de 2 não pode virar desculpa para a semana de consolidação sumir.
    expect(total("2026-01-26")).toBeLessThan(total("2026-01-05"));
  });

  it("backs off during race week regardless of the block", () => {
    const race = buildStrengthSession({
      prefs: prefs(), day: legDay, phase: "race",
      block: strengthBlockFor("2026-01-05", "race"),
    });
    expect(race.deloaded).toBe(true);
    expect(race.exercises.every(e => e.rir >= 3)).toBe(true);
  });

  it("cuts volume when the running week jumps", () => {
    const normal = buildStrengthSession({ prefs: prefs(), day: legDay, phase: "build", runningLoadFactor: 1 });
    const heavy  = buildStrengthSession({ prefs: prefs(), day: legDay, phase: "build", runningLoadFactor: 0.7 });
    const totalSets = (s: typeof normal) => s.exercises.reduce((n, e) => n + e.sets, 0);
    expect(totalSets(heavy)).toBeLessThan(totalSets(normal));
  });
});

describe("strength-cycle", () => {
  it("cycles through weeks 1–4 and back", () => {
    expect(blockWeekFor("2026-01-05")).toBe(1);
    expect(blockWeekFor("2026-01-12")).toBe(2);
    expect(blockWeekFor("2026-01-19")).toBe(3);
    expect(blockWeekFor("2026-01-26")).toBe(4);
    expect(blockWeekFor("2026-02-02")).toBe(1);
  });

  it("stays in range for dates before the epoch", () => {
    for (const d of ["2025-11-03", "2025-06-16", "2024-01-01"]) {
      const w = blockWeekFor(d);
      expect(w, d).toBeGreaterThanOrEqual(1);
      expect(w, d).toBeLessThanOrEqual(4);
    }
  });

  it("ramps effort across the block and releases on week 4", () => {
    const rirs = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]
      .map(d => strengthBlockFor(d, "base").rir);
    expect(rirs).toEqual([3, 2, 1, 4]);
  });

  it("marks only week 4 as a deload in normal phases", () => {
    expect(strengthBlockFor("2026-01-05", "base").deload).toBe(false);
    expect(strengthBlockFor("2026-01-26", "base").deload).toBe(true);
  });

  it("goes heavier in the build phase", () => {
    expect(strengthBlockFor("2026-01-05", "build").repShift).toBeLessThan(0);
    expect(strengthBlockFor("2026-01-05", "peak").volume)
      .toBeLessThan(strengthBlockFor("2026-01-05", "base").volume);
  });

  it("always explains the week to the athlete", () => {
    for (const phase of ["base", "build", "peak", "taper", "race"] as const) {
      expect(strengthBlockFor("2026-01-05", phase).intent.length).toBeGreaterThan(20);
    }
  });

  it("yields strength volume to a heavy running week", () => {
    expect(runningLoadFactor(40, 40)).toBe(1);
    expect(runningLoadFactor(45, 40)).toBeLessThan(1);       // +12%
    expect(runningLoadFactor(55, 40)).toBeLessThanOrEqual(0.7); // +37%
    expect(runningLoadFactor(40, 0)).toBe(1);                // no history: don't guess
  });
});

describe("progression", () => {
  const rx = { reps: [8, 12] as [number, number], rir: 2, exerciseId: "agachamento-livre" };
  const sets = (date: string, weight: number, reps: number, rir: number, n = 3) =>
    Array.from({ length: n }, (_, i) => ({
      date, exerciseId: rx.exerciseId, setIndex: i + 1, weightKg: weight, reps, rir,
    }));

  it("asks for a first load instead of inventing one", () => {
    const a = nextTarget([], rx);
    expect(a.weightKg).toBeNull();
    expect(a.reason).toMatch(/registre|escolha/i);
  });

  it("raises the load once the athlete fills the rep range", () => {
    const a = nextTarget(sets("2026-07-01", 60, 12, 1), rx);
    expect(a.weightKg).toBeGreaterThan(60);
    expect(a.stalled).toBe(false);
  });

  it("holds the load while the athlete is still climbing inside the range", () => {
    const a = nextTarget(sets("2026-07-01", 60, 9, 1), rx);
    expect(a.weightKg).toBeLessThanOrEqual(60 + 5);
  });

  it("jumps further when the athlete reports lots left in reserve", () => {
    const easy = nextTarget(sets("2026-07-01", 60, 12, 5), rx);
    const normal = nextTarget(sets("2026-07-01", 60, 12, 1), rx);
    expect(easy.weightKg!).toBeGreaterThan(normal.weightKg!);
  });

  it("backs off 10% after three flat sessions", () => {
    const a = nextTarget([
      ...sets("2026-07-15", 60, 8, 1),
      ...sets("2026-07-08", 60, 9, 1),
      ...sets("2026-07-01", 60, 10, 1),
    ], rx);
    expect(a.stalled).toBe(true);
    expect(a.weightKg!).toBeLessThan(60);
    expect(a.weightKg!).toBeGreaterThan(50);
  });

  it("uses bigger jumps for big lower-body lifts than for isolation", () => {
    const squat = nextTarget(sets("2026-07-01", 60, 12, 1), rx);
    const curl  = nextTarget(sets("2026-07-01", 12, 12, 1),
      { ...rx, exerciseId: "rosca-direta" });
    expect(squat.weightKg! - 60).toBeGreaterThan(curl.weightKg! - 12);
  });

  it("progresses bodyweight work by difficulty, not load", () => {
    const a = nextTarget(
      [{ date: "2026-07-01", exerciseId: "prancha", setIndex: 1, weightKg: null, reps: 60, rir: 2 }],
      { reps: [30, 60], rir: 2, exerciseId: "prancha" },
    );
    expect(a.weightKg).toBeNull();
    expect(a.reason.length).toBeGreaterThan(10);
  });

  it("groups sets into one summary per session, newest first", () => {
    const s = summarizeSessions([
      ...sets("2026-07-01", 60, 10, 2),
      ...sets("2026-07-08", 62.5, 10, 2),
    ], rx.reps);
    expect(s).toHaveLength(2);
    expect(s[0].date).toBe("2026-07-08");
  });

  /**
   * A pyramid — load up, reps down — is a structure the athlete repeats week to
   * week. `topWeight` reports 50 kg for both 40×12/45×10/50×8 and 50×8 three
   * times, so the summary alone cannot tell them apart. The raw sequence can.
   */
  it("guarda cada série na ordem, não só o pico", () => {
    const pyramid = [
      { date: "2026-07-08", exerciseId: "supino-reto", setIndex: 3, weightKg: 50, reps: 8,  rir: 1 },
      { date: "2026-07-08", exerciseId: "supino-reto", setIndex: 1, weightKg: 40, reps: 12, rir: 3 },
      { date: "2026-07-08", exerciseId: "supino-reto", setIndex: 2, weightKg: 45, reps: 10, rir: 2 },
    ];

    const [s] = summarizeSessions(pyramid, rx.reps);

    // Chega fora de ordem do banco; sai na ordem em que foi executado.
    expect(s.detail.map(d => d.setIndex)).toEqual([1, 2, 3]);
    expect(s.detail.map(d => d.weightKg)).toEqual([40, 45, 50]);
    expect(s.detail.map(d => d.reps)).toEqual([12, 10, 8]);
    expect(s.detail.map(d => d.rir)).toEqual([3, 2, 1]);

    // O resumo continua achatando isso — é por isso que o detalhe existe.
    expect(s.topWeight).toBe(50);
  });

  it("distingue pirâmide de séries retas com o mesmo pico", () => {
    const straight = [1, 2, 3].map(i => (
      { date: "2026-07-08", exerciseId: "supino-reto", setIndex: i, weightKg: 50, reps: 8, rir: 1 }
    ));
    const pyramid = [
      { date: "2026-07-08", exerciseId: "supino-reto", setIndex: 1, weightKg: 40, reps: 12, rir: 3 },
      { date: "2026-07-08", exerciseId: "supino-reto", setIndex: 2, weightKg: 45, reps: 10, rir: 2 },
      { date: "2026-07-08", exerciseId: "supino-reto", setIndex: 3, weightKg: 50, reps: 8,  rir: 1 },
    ];

    const [a] = summarizeSessions(straight, rx.reps);
    const [b] = summarizeSessions(pyramid, rx.reps);

    expect(a.topWeight).toBe(b.topWeight);          // indistinguíveis no resumo
    expect(a.detail).not.toEqual(b.detail);          // distinguíveis no detalhe
  });
});

describe("normalizeStrengthPrefs", () => {
  it("survives junk without throwing", () => {
    for (const junk of [null, undefined, {}, { days: "nope" }, { days: [{ day: "Xyz" }] }]) {
      expect(() => normalizeStrengthPrefs(junk)).not.toThrow();
    }
  });

  it("drops days with no muscles rather than prescribing nothing", () => {
    const p = normalizeStrengthPrefs({ days: [{ day: "Tue", muscles: [] }, { day: "Thu", muscles: ["peito"] }] });
    expect(p.days.map(d => d.day)).toEqual(["Thu"]);
  });

  it("clamps the cardio add-on to a sane length", () => {
    const p = normalizeStrengthPrefs({
      days: [{ day: "Tue", muscles: ["peito"], cardio: { machine: "esteira", minutes: 999, position: "depois" } }],
    });
    expect(p.days[0].cardio!.minutes).toBeLessThanOrEqual(60);
  });

  it("treats 'nenhum' as no cardio at all", () => {
    const p = normalizeStrengthPrefs({
      days: [{ day: "Tue", muscles: ["peito"], cardio: { machine: "nenhum", minutes: 20, position: "depois" } }],
    });
    expect(p.days[0].cardio).toBeNull();
  });
});
