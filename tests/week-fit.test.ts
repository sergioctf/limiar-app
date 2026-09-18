/**
 * "Esta semana só consigo treinar terça, quinta e sábado."
 *
 * The coach reorganises the week around the days the athlete has, says what it
 * prioritised, and changes nothing until they confirm.
 */
import { describe, expect, it } from "vitest";
import { fitWeek, prefsForAgenda, undoFit, type FitProposal } from "@/lib/week-fit";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const strength = { exercises: [{}, {}, {}], estimatedMinutes: 40 } as unknown as WeeklyPlanDay["strength"];

const day = (d: WeeklyPlanDay["day"], dayPt: string, over: Partial<WeeklyPlanDay>): WeeklyPlanDay =>
  ({ day: d, dayPt, sport: "corrida", type: "rest", label: "Descanso", description: "", ...over } as WeeklyPlanDay);

/** Sérgio's usual week: leve segunda, tiro quarta, longão sábado, musculação ter/qui/sex. */
const week: WeeklyPlanData = {
  week_start: "2026-09-21", generated_at: "x",
  days: [
    day("Mon", "Segunda", { type: "easy", label: "Rodagem leve", distance_km: 6, description: "Leve." }),
    day("Tue", "Terça", { type: "strength", sport: "musculacao", label: "Musculação", strength }),
    day("Wed", "Quarta", {
      type: "intervals", label: "Tiros curtos 6×200 m", distance_km: 3.5, quality: "repetitions",
      description: "6 tiros de 200 m. Depois (idealmente ~6 h depois), musculação: bíceps, tríceps.", strength,
    }),
    day("Thu", "Quinta", { type: "strength", sport: "musculacao", label: "Musculação", strength }),
    day("Fri", "Sexta", { type: "strength", sport: "musculacao", label: "Musculação", strength }),
    day("Sat", "Sábado", { type: "long_run", label: "Longão", distance_km: 9.5, description: "Longão." }),
    day("Sun", "Domingo", {}),
  ],
};

const ok = (r: ReturnType<typeof fitWeek>): FitProposal => {
  if ("error" in r) throw new Error(r.error);
  return r;
};
const at = (p: FitProposal, d: WeeklyPlanDay["day"]) => p.plan.days.find(x => x.day === d)!;

describe("terça, quinta e sábado", () => {
  const p = ok(fitWeek(week, { available: ["Tue", "Thu", "Sat"], longRunDay: "Sat" }));

  it("keeps the order leve → tiro → longão on the days available", () => {
    expect(at(p, "Tue").label).toBe("Rodagem leve");
    expect(at(p, "Thu").label).toBe("Tiros curtos 6×200 m");
    expect(at(p, "Sat").label).toBe("Longão");
    expect(p.dropped).toEqual([]);
  });

  it("leaves the lifting where it was and frees the days that lost their run", () => {
    expect(at(p, "Tue").strength).toBe(strength);         // run rides along with the lifting
    expect(at(p, "Mon").type).toBe("rest");
    expect(at(p, "Wed").type).toBe("strength");            // Wednesday keeps its lifting, loses the run
  });

  it("moves the whole session — tag and structure — and drops the note about another day's lifting", () => {
    expect(at(p, "Thu").quality).toBe("repetitions");
    expect(at(p, "Thu").movedFrom).toBe("Quarta");
    expect(at(p, "Thu").description).toBe("6 tiros de 200 m.");
  });

  it("says what it did", () => {
    expect(p.explanation).toEqual([
      "O longão (9,5 km) fica no sábado.",
      "O treino forte (Tiros curtos 6×200 m) vai para quinta.",
      "A rodagem leve de 6 km vai para terça.",
    ]);
  });

  it("keeps the week as it was, for 'desfazer'", () => {
    const undone = undoFit(p.plan);
    expect("plan" in undone && undone.plan.days).toEqual(week.days);
    expect("plan" in undone && undone.plan.rearrangement).toBeUndefined();
  });
});

describe("when the days run out", () => {
  it("drops the easy run first and says the volume went down, without compensating", () => {
    const p = ok(fitWeek(week, { available: ["Wed", "Sat"], longRunDay: "Sat" }));
    expect(at(p, "Wed").label).toBe("Tiros curtos 6×200 m");
    expect(at(p, "Sat").label).toBe("Longão");
    expect(p.dropped.map(d => d.role)).toEqual(["easy"]);
    expect(p.explanation).toContain("A rodagem leve de 6 km de segunda sai: com 2 dias, o longão e o treino forte vêm primeiro.");
    expect(p.explanation).toContain("Volume da semana: 19 km → 13 km. Não tentamos compensar os quilômetros que saíram.");
  });

  it("does not stack the quality session on the day before the long run", () => {
    const p = ok(fitWeek(week, { available: ["Fri", "Sat"], longRunDay: "Sat" }));
    expect(at(p, "Sat").label).toBe("Longão");
    expect(at(p, "Fri").label).toBe("Rodagem leve");        // easy, not the intervals
    expect(p.dropped.map(d => d.role)).toEqual(["quality"]);
    expect(p.explanation.join(" ")).toContain("dois dias fortes seguidos cobram mais do que rendem");
  });

  it("keeps the long run above everything when only one day is left", () => {
    const p = ok(fitWeek(week, { available: ["Sun"] }));
    expect(at(p, "Sun").label).toBe("Longão");
    expect(p.dropped.map(d => d.role).sort()).toEqual(["easy", "quality"]);
  });
});

describe("the week in progress", () => {
  it("never touches a day already lived or a run already done", () => {
    const p = ok(fitWeek(week, { available: ["Thu", "Sat"], fromDay: "Wed", doneDays: [], longRunDay: "Sat" }));
    expect(at(p, "Mon").label).toBe("Rodagem leve");        // Monday is past
    expect(at(p, "Thu").label).toBe("Tiros curtos 6×200 m");
    expect(at(p, "Sat").label).toBe("Longão");
  });

  it("leaves today alone once it was run", () => {
    const p = ok(fitWeek(week, { available: ["Thu", "Sat"], fromDay: "Wed", doneDays: ["Wed"] }));
    expect(at(p, "Wed").label).toBe("Tiros curtos 6×200 m");
    expect(at(p, "Thu").type).toBe("strength");
  });

  it("asks to undo a recovery swap first", () => {
    const swapped = { ...week, days: week.days.map(d => d.day === "Wed" ? { ...d, swap: {} as never } : d) };
    expect(fitWeek(swapped, { available: ["Thu", "Sat"], fromDay: "Wed" })).toHaveProperty("error");
  });

  it("changes nothing when the agenda already fits", () => {
    expect(ok(fitWeek(week, { available: ["Mon", "Wed", "Sat"], longRunDay: "Sat" })).unchanged).toBe(true);
  });
});

describe("the agenda as planning data", () => {
  it("builds the next week on the days the athlete gave", () => {
    const prefs = { runDays: ["Mon", "Wed", "Sat"] as WeeklyPlanDay["day"][], longRunDay: "Sat" as const };
    expect(prefsForAgenda(prefs, ["Sat", "Tue", "Thu"])).toEqual({ runDays: ["Tue", "Thu", "Sat"], longRunDay: "Sat" });
    expect(prefsForAgenda(prefs, ["Tue", "Thu"]).longRunDay).toBeNull();
    expect(prefsForAgenda(prefs, null)).toBe(prefs);
  });
});
