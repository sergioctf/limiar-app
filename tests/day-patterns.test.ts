/**
 * "Você costuma precisar encurtar o treino de quarta. Quer deixar esse dia mais
 * leve no planejamento?"
 */
import { describe, expect, it } from "vitest";
import { troubledDays } from "@/lib/day-patterns";
import { analyzeTraining, applyAdvisorPatch } from "@/lib/advisor";
import { allocateRunSessions, normalizePrefs } from "@/lib/workout-builder";
import type { DayStatus, WeekAdherence } from "@/lib/plan-adherence";
import type { TrainingPrefs, WeeklyPlanDay } from "@/types";

const today = "2026-09-18";
const tiro: WeeklyPlanDay = { day: "Wed", dayPt: "Quarta", sport: "corrida", type: "intervals", label: "Tiro 3×400 m", distance_km: 3.5, description: "", quality: "intervals" };
const leve: WeeklyPlanDay = { day: "Mon", dayPt: "Segunda", sport: "corrida", type: "easy", label: "Rodagem leve", distance_km: 6, description: "" };

/** One week: Monday easy (done), Wednesday's quality session with the given outcome. */
function week(monday: string, wed: { status: DayStatus; planned?: Partial<WeeklyPlanDay> }): WeekAdherence {
  const date = (n: number) => { const d = new Date(`${monday}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  return {
    weekStart: monday, score: null, doneCount: 0, partialCount: 0, adaptedCount: 0, missedCount: 0,
    days: [
      { day: "Mon", dayPt: "Segunda", date: date(0), planned: leve, actualKm: 6, actualMin: 36, status: "done" },
      { day: "Wed", dayPt: "Quarta", date: date(2), planned: { ...tiro, ...wed.planned }, actualKm: 2, actualMin: 14, status: wed.status },
    ],
  };
}
const shortened = { status: "done" as DayStatus, planned: { adaptation: { when: "before", at: "x", reason: "time", source: "option", preserves: "", changes: "", original: tiro } } as Partial<WeeklyPlanDay> };

describe("reading the weekday that keeps bending", () => {
  it("flags Wednesday after three of four hard sessions needed adjusting", () => {
    const weeks = [
      week("2026-08-17", { status: "partial" }),
      week("2026-08-24", shortened),
      week("2026-08-31", { status: "done" }),
      week("2026-09-07", { status: "missed" }),
    ];
    expect(troubledDays(weeks, today)).toEqual([
      { day: "Wed", role: "quality", troubled: 3, total: 4, kinds: ["encurtado", "encurtado", "não feito"] },
    ]);
  });

  it("does not call two bad Wednesdays a pattern", () => {
    const weeks = [week("2026-08-24", { status: "partial" }), week("2026-08-31", { status: "missed" }), week("2026-09-07", { status: "done" })];
    expect(troubledDays(weeks, today)).toEqual([]);
  });

  it("does not count an adaptation for place or format as the day being too busy", () => {
    const place = { status: "done" as DayStatus, planned: { adaptation: { ...shortened.planned.adaptation!, reason: "place" as const } } };
    const weeks = [week("2026-08-17", place), week("2026-08-24", place), week("2026-08-31", place), week("2026-09-07", place)];
    expect(troubledDays(weeks, today)).toEqual([]);
  });

  it("ignores days that have not happened yet", () => {
    const weeks = [week("2026-09-14", { status: "missed" }), week("2026-09-21", { status: "missed" })];
    expect(troubledDays(weeks, today).length).toBe(0);
  });
});

describe("the coach suggests, the athlete decides", () => {
  const trouble = [{ day: "Wed" as const, role: "quality" as const, troubled: 3, total: 4, kinds: ["encurtado" as const, "não feito" as const] }];
  const inputFor = (prefs: TrainingPrefs) => ({
    prefs, strengthPrefs: null, planDays: [], weeklyKm: [], loggedSetsPerMuscle: new Map(), liftProgress: [],
    strengthLogged: { prescribed: 0, logged: 0 }, nextRace: null, adherence: null, troubledDays: trouble,
  });
  // Four running days: Thursday can take the quality session and keep leve → tiro → longão.
  const four: TrainingPrefs = normalizePrefs({ runDays: ["Mon", "Wed", "Thu", "Sat"], strengthDays: ["Tue", "Fri"], longRunDay: "Sat" });
  // Sérgio's week: Monday, Wednesday, Saturday — no other place for the quality session.
  const sergio: TrainingPrefs = normalizePrefs({ runDays: ["Mon", "Wed", "Sat"], strengthDays: ["Tue", "Thu", "Fri"], longRunDay: "Sat" });

  it("asks whether to keep Wednesday light, with the numbers", () => {
    const finding = analyzeTraining(inputFor(four)).find(f => f.key === "dia_pesado_Wed")!;
    expect(finding.title).toBe("Você costuma precisar ajustar o treino na quarta");
    expect(finding.evidence).toContain("3 de 4 vezes");
    expect(finding.patch).toEqual({ kind: "prefs_light_day", day: "Wed" });
    expect(finding.actionLabel).toBe("Deixar quarta mais leve");
  });

  it("never offers a light day that would break leve → tiro → longão", () => {
    const finding = analyzeTraining(inputFor(sergio)).find(f => f.key === "dia_pesado_Wed")!;
    expect(finding.patch).toBeNull();
    expect(finding.proposal).toContain("não há outro dia para o treino forte sem abrir a semana com ele ou colá-lo no longão");
    expect(finding.proposal).toContain("Minha agenda desta semana");
  });

  it("does not ask again once the day is light", () => {
    expect(analyzeTraining(inputFor({ ...four, lightDays: ["Wed"] })).some(f => f.key === "dia_pesado_Wed")).toBe(false);
  });

  it("applies only when the athlete taps it, and the next week moves the quality session", () => {
    const { prefs: next, changed } = applyAdvisorPatch(four, null, { kind: "prefs_light_day", day: "Wed" });
    expect(changed).toBe(true);
    expect(next.lightDays).toEqual(["Wed"]);
    expect(normalizePrefs(next).lightDays).toEqual(["Wed"]);        // survives the round-trip to the database
    const before = allocateRunSessions(four.runDays, { longRunDay: "Sat", qualityPerWeek: 1 });
    const after = allocateRunSessions(next.runDays, { longRunDay: "Sat", qualityPerWeek: 1, lightDays: next.lightDays });
    expect(before.get("Wed")).toBe("quality");
    expect(after.get("Wed")).toBe("easy");
    expect(after.get("Thu")).toBe("quality");
    expect(after.get("Mon")).toBe("easy");                            // easy still opens the week
    expect(after.get("Sat")).toBe("long");
  });

  it("lets the light day yield rather than open the week with the quality session", () => {
    const after = allocateRunSessions(["Mon", "Wed", "Sat"], { longRunDay: "Sat", qualityPerWeek: 1, lightDays: ["Wed"] });
    expect(after.get("Mon")).toBe("easy");
    expect(after.get("Wed")).toBe("quality");
  });
});
