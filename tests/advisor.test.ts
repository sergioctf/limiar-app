import { describe, it, expect } from "vitest";
import { analyzeTraining, applyAdvisorPatch, setsPerMuscleFromLogs, type AdvisorInput } from "@/lib/advisor";
import { normalizeStrengthPrefs } from "@/lib/strength-prefs";
import { normalizePrefs } from "@/lib/workout-builder";
import type { MuscleGroup } from "@/lib/exercises";
import type { WeeklyPlanDay, Race } from "@/types";

const day = (d: WeeklyPlanDay["day"], type: WeeklyPlanDay["type"], label: string, km?: number): WeeklyPlanDay =>
  ({ day: d, dayPt: d, type, label, distance_km: km, description: "" });

const PLAN: WeeklyPlanDay[] = [
  day("Mon", "easy", "Rodagem leve", 8),
  day("Tue", "strength", "Musculação"),
  day("Wed", "intervals", "Tiro", 9),
  day("Thu", "strength", "Musculação"),
  day("Fri", "strength", "Musculação"),
  day("Sat", "long_run", "Longão", 16),
  day("Sun", "rest", "Descanso"),
];

const RACE = {
  id: "r", user_id: "u", name: "Meia de SP", race_date: "2026-10-04",
  distance_km: 21.1, time_seconds: null, is_target_race: true,
} as unknown as Race;

/** Legs on Friday — the day before the Saturday long run. */
const LEGS_ON_FRIDAY = normalizeStrengthPrefs({
  goal: "hipertrofia", equipment: ["academia"], sessionMinutes: 60,
  days: [
    { day: "Tue", muscles: ["peito", "triceps"] },
    { day: "Thu", muscles: ["costas", "biceps"] },
    { day: "Fri", muscles: ["quadriceps", "posterior", "gluteo"] },
  ],
});

function input(over: Partial<AdvisorInput> = {}): AdvisorInput {
  return {
    prefs: normalizePrefs({ runDays: ["Mon", "Wed", "Sat"], strengthDays: ["Tue", "Thu", "Fri"], qualityPerWeek: 1 }),
    strengthPrefs: LEGS_ON_FRIDAY,
    planDays: PLAN,
    weeklyKm: [40, 38, 36, 35],
    loggedSetsPerMuscle: new Map<MuscleGroup, number>(),
    liftProgress: [],
    strengthLogged: { prescribed: 9, logged: 7 },
    nextRace: RACE,
    adherence: 0.9,
    ...over,
  };
}

const keys = (i: AdvisorInput) => analyzeTraining(i).map(f => f.key);

describe("integração corrida × força", () => {
  it("catches heavy legs the day before the long run", () => {
    const f = analyzeTraining(input()).find(x => x.key.startsWith("perna_antes_longao"));
    expect(f).toBeDefined();
    expect(f!.severity).toBe("alta");
    expect(f!.patch).not.toBeNull();
  });

  it("proposes swapping with an upper body day rather than the day after the long run", () => {
    const f = analyzeTraining(input()).find(x => x.key.startsWith("perna_antes_longao"))!;
    expect(f.patch!.kind).toBe("strength_swap_days");
    // Sunday is free but sits right after the long run — legs on trashed legs.
    expect(JSON.stringify(f.patch)).not.toContain("Sun");
  });

  it("says nothing when legs are already far from the long run", () => {
    const fine = normalizeStrengthPrefs({
      goal: "hipertrofia", equipment: ["academia"],
      days: [
        { day: "Tue", muscles: ["quadriceps", "posterior", "gluteo"] },
        { day: "Thu", muscles: ["peito", "costas"] },
      ],
    });
    expect(keys(input({ strengthPrefs: fine }))).not.toContain("perna_antes_longao_Tue");
  });

  it("flags a week with no free day at all", () => {
    const everyDay = normalizeStrengthPrefs({
      goal: "hipertrofia", equipment: ["academia"],
      days: (["Tue", "Thu", "Fri", "Sun"] as const).map(d => ({ day: d, muscles: ["peito"] })),
    });
    expect(keys(input({ strengthPrefs: everyDay }))).toContain("sem_dia_livre");
  });

  it("explains a cardio add-on that is being downgraded", () => {
    const withCardio = normalizeStrengthPrefs({
      goal: "hipertrofia", equipment: ["academia"],
      days: [{
        day: "Tue", muscles: ["peito"],
        cardio: { machine: "esteira", minutes: 20, position: "antes", intensity: "tempo" },
      }],
    });
    const f = analyzeTraining(input({ strengthPrefs: withCardio })).find(x => x.key === "cardio_conflito_Tue");
    expect(f).toBeDefined();
    expect(f!.patch).toMatchObject({ kind: "strength_cardio_intensity", intensity: "recuperacao" });
  });
});

describe("achados de força", () => {
  it("catches a neglected posterior chain", () => {
    const f = analyzeTraining(input({
      loggedSetsPerMuscle: new Map<MuscleGroup, number>([["quadriceps", 9], ["posterior", 2]]),
    })).find(x => x.key === "posterior_negligenciado");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("alta");
    expect(f!.rationale).toMatch(/nórdico/i);
  });

  it("stays quiet when the posterior chain is balanced", () => {
    expect(keys(input({
      loggedSetsPerMuscle: new Map<MuscleGroup, number>([["quadriceps", 8], ["posterior", 7]]),
    }))).not.toContain("posterior_negligenciado");
  });

  it("names the split, not seven muscles, when everything is trained once", () => {
    const found = analyzeTraining(input()).find(x => x.key === "split_frequencia_1x");
    expect(found).toBeDefined();
    // The old version listed every muscle and suggested chest on leg day.
    expect(found!.patch).toBeNull();
    expect(found!.title.length).toBeLessThan(60);
  });

  it("catches a stalled lift", () => {
    const f = analyzeTraining(input({
      liftProgress: [{ exerciseId: "agachamento-livre", name: "Agachamento livre", sessions: 5, deltaKg: 0, weeksInPlan: 6 }],
    })).find(x => x.key.startsWith("carga_estagnada"));
    expect(f).toBeDefined();
    expect(f!.title).toContain("Agachamento livre");
  });

  it("does not call a progressing lift stalled", () => {
    expect(keys(input({
      liftProgress: [{ exerciseId: "agachamento-livre", name: "Agachamento livre", sessions: 5, deltaKg: 10, weeksInPlan: 6 }],
    })).some(k => k.startsWith("carga_estagnada"))).toBe(false);
  });

  it("asks for logs when sessions are prescribed but never recorded", () => {
    expect(keys(input({ strengthLogged: { prescribed: 9, logged: 0 } }))).toContain("sem_registro_forca");
  });
});

describe("achados de corrida", () => {
  it("catches two consecutive volume jumps above 15%", () => {
    const f = analyzeTraining(input({ weeklyKm: [40, 33, 27, 25] }))
      .find(x => x.key === "salto_de_volume");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("alta");
  });

  it("accepts a normal 10% progression", () => {
    expect(keys(input({ weeklyKm: [40, 37, 34, 31] }))).not.toContain("salto_de_volume");
  });

  it("flags flat volume only when there is no race to train for", () => {
    const flat = [30, 30, 30, 30, 30, 30];
    expect(keys(input({ weeklyKm: flat, nextRace: null }))).toContain("volume_estagnado");
    expect(keys(input({ weeklyKm: flat, nextRace: RACE }))).not.toContain("volume_estagnado");
  });

  it("proposes fewer quality sessions at low volume", () => {
    const f = analyzeTraining(input({
      prefs: normalizePrefs({ runDays: ["Mon", "Wed", "Sat"], qualityPerWeek: 2 }),
      weeklyKm: [22, 21, 20, 20],
    })).find(x => x.key === "qualidade_demais");
    expect(f).toBeDefined();
    expect(f!.patch).toMatchObject({ kind: "prefs_quality", qualityPerWeek: 1 });
  });

  it("proposes shrinking a plan the athlete is not completing", () => {
    const f = analyzeTraining(input({
      prefs: normalizePrefs({ runDays: ["Mon", "Tue", "Wed", "Fri", "Sat"], qualityPerWeek: 1 }),
      adherence: 0.4,
    })).find(x => x.key === "aderencia_baixa");
    expect(f).toBeDefined();
    expect((f!.patch as { runDays: string[] }).runDays).toHaveLength(4);
  });

  it("does not nag an athlete who is keeping up", () => {
    expect(keys(input({ adherence: 0.95 }))).not.toContain("aderencia_baixa");
  });
});

describe("ordering and tone", () => {
  it("puts the most severe findings first", () => {
    const rank = { alta: 0, media: 1, baixa: 2 };
    const found = analyzeTraining(input({
      loggedSetsPerMuscle: new Map<MuscleGroup, number>([["quadriceps", 9], ["posterior", 2]]),
      weeklyKm: [40, 33, 27, 25],
    }));
    const severities = found.map(f => rank[f.severity]);
    expect(severities).toEqual([...severities].sort((a, b) => a - b));
  });

  it("always says what was measured and why", () => {
    for (const f of analyzeTraining(input())) {
      expect(f.evidence.length, `${f.key} has no evidence`).toBeGreaterThan(15);
      expect(f.rationale.length, `${f.key} has no rationale`).toBeGreaterThan(40);
      expect(f.proposal.length, `${f.key} has no proposal`).toBeGreaterThan(15);
    }
  });

  it("gives every actionable finding a button label", () => {
    for (const f of analyzeTraining(input())) {
      if (f.patch) expect(f.actionLabel, `${f.key} is actionable but unlabelled`).toBeTruthy();
    }
  });

  it("gets Portuguese prepositions right for weekend days", () => {
    const f = analyzeTraining(input()).find(x => x.key.startsWith("perna_antes_longao"))!;
    expect(f.title).toContain("no sábado");
    expect(f.title).not.toContain("na sábado");
  });

  it("finds nothing to say about a coherent week", () => {
    const tidy = normalizeStrengthPrefs({
      goal: "suporte", equipment: ["academia"],
      days: [
        { day: "Tue", muscles: ["quadriceps", "posterior", "gluteo"] },
        { day: "Thu", muscles: ["peito", "costas", "ombro"] },
      ],
    });
    expect(analyzeTraining(input({
      prefs: normalizePrefs({ runDays: ["Mon", "Wed", "Sat"], strengthDays: ["Tue", "Thu"], qualityPerWeek: 1 }),
      strengthPrefs: tidy,
      loggedSetsPerMuscle: new Map<MuscleGroup, number>([["quadriceps", 6], ["posterior", 5]]),
      weeklyKm: [40, 37, 34, 31],
    }))).toHaveLength(0);
  });
});

describe("applyAdvisorPatch", () => {
  const prefs = normalizePrefs({ runDays: ["Mon", "Wed", "Sat"], strengthDays: ["Tue", "Thu", "Fri"], qualityPerWeek: 1 });

  it("never mutates the stored preferences", () => {
    const beforePrefs = JSON.stringify(prefs);
    const beforeStrength = JSON.stringify(LEGS_ON_FRIDAY);
    applyAdvisorPatch(prefs, LEGS_ON_FRIDAY, { kind: "strength_swap_days", a: "Fri", b: "Tue" });
    expect(JSON.stringify(prefs)).toBe(beforePrefs);
    expect(JSON.stringify(LEGS_ON_FRIDAY)).toBe(beforeStrength);
  });

  it("swaps what two days train, keeping the days themselves", () => {
    const r = applyAdvisorPatch(prefs, LEGS_ON_FRIDAY, { kind: "strength_swap_days", a: "Fri", b: "Tue" });
    expect(r.changed).toBe(true);
    expect(r.strengthPrefs!.days.map(d => d.day)).toEqual(["Tue", "Thu", "Fri"]);
    expect(r.strengthPrefs!.days.find(d => d.day === "Tue")!.muscles).toContain("quadriceps");
    expect(r.strengthPrefs!.days.find(d => d.day === "Fri")!.muscles).toContain("peito");
  });

  it("moves a day and keeps the running plan's view in step", () => {
    const r = applyAdvisorPatch(prefs, LEGS_ON_FRIDAY, { kind: "strength_move_day", from: "Fri", to: "Sun" });
    expect(r.strengthPrefs!.days.map(d => d.day)).toEqual(["Tue", "Thu", "Sun"]);
    expect(r.prefs.strengthDays).toEqual(["Tue", "Thu", "Sun"]);
  });

  it("refuses to move onto a day that is already taken", () => {
    const r = applyAdvisorPatch(prefs, LEGS_ON_FRIDAY, { kind: "strength_move_day", from: "Fri", to: "Tue" });
    expect(r.changed).toBe(false);
  });

  it("refuses to empty a day of all its muscles", () => {
    const oneMuscle = normalizeStrengthPrefs({
      goal: "suporte", equipment: ["academia"], days: [{ day: "Tue", muscles: ["peito"] }],
    });
    const r = applyAdvisorPatch(prefs, oneMuscle, { kind: "strength_remove_muscle", day: "Tue", muscle: "peito" });
    expect(r.changed).toBe(false);
  });

  it("drops a long run day that stops being a run day", () => {
    const withLong = normalizePrefs({ runDays: ["Mon", "Wed", "Sat"], longRunDay: "Sat" });
    const r = applyAdvisorPatch(withLong, null, { kind: "prefs_run_days", runDays: ["Mon", "Wed"] });
    expect(r.prefs.longRunDay).toBeNull();
  });

  it("reports no change for advice-only findings", () => {
    expect(applyAdvisorPatch(prefs, LEGS_ON_FRIDAY, null).changed).toBe(false);
  });

  it("ignores a patch that would change nothing", () => {
    expect(applyAdvisorPatch(prefs, LEGS_ON_FRIDAY, { kind: "prefs_quality", qualityPerWeek: 1 }).changed).toBe(false);
  });

  it("does nothing to strength patches when there is no strength config", () => {
    expect(applyAdvisorPatch(prefs, null, { kind: "strength_swap_days", a: "Fri", b: "Tue" }).changed).toBe(false);
  });
});

describe("setsPerMuscleFromLogs", () => {
  it("counts primary muscles fully and secondary at half", () => {
    const m = setsPerMuscleFromLogs([
      { date: "2026-07-01", exercise_id: "agachamento-livre" },
      { date: "2026-07-01", exercise_id: "agachamento-livre" },
    ], 1);
    expect(m.get("quadriceps")).toBe(2);
    expect(m.get("gluteo")).toBeLessThan(2);
  });

  it("averages over the window", () => {
    const rows = Array.from({ length: 8 }, () => ({ date: "2026-07-01", exercise_id: "agachamento-livre" }));
    expect(setsPerMuscleFromLogs(rows, 4).get("quadriceps")).toBe(2);
  });

  it("ignores unknown exercises instead of throwing", () => {
    expect(() => setsPerMuscleFromLogs([{ date: "2026-07-01", exercise_id: "inventado" }])).not.toThrow();
  });
});
