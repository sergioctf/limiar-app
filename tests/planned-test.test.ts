/**
 * O teste de 3 km marcado para um dia.
 *
 * As duas regras que importam: ele **não** mexe na semana (o motor não roda de
 * novo, o volume não é recalculado) e ele **conta como quilômetro**, ocupando o
 * lugar da corrida daquele dia — porque dois treinos de qualidade no mesmo dia
 * não é um plano, é um acidente.
 */
import { describe, expect, it } from "vitest";
import { applyPlannedTest, dayKeyOfDate, mondayOfDate, replacedByTest, testDateOptions, testSession } from "@/lib/planned-test";
import type { WeeklyPlanDay } from "@/types";

const day = (o: Partial<WeeklyPlanDay>): WeeklyPlanDay => ({
  day: "Mon", dayPt: "Segunda", type: "easy", sport: "corrida",
  label: "Rodagem leve", description: "", ...o,
} as WeeklyPlanDay);

const plan = () => ({
  week_start: "2026-09-28",
  days: [
    day({ day: "Mon", dayPt: "Segunda", distance_km: 6, strength: { exercises: [{}], estimatedMinutes: 40 } } as Partial<WeeklyPlanDay>),
    day({ day: "Tue", dayPt: "Terça", type: "rest", sport: undefined, label: "Descanso" } as Partial<WeeklyPlanDay>),
    day({ day: "Wed", dayPt: "Quarta", type: "intervals", label: "Tiros de 1 km", distance_km: 9 }),
    day({ day: "Sat", dayPt: "Sábado", type: "long_run", label: "Longão", distance_km: 12 }),
  ],
});

const scheduled = (date: string) => ({ id: "t1", date, distanceKm: 3, status: "scheduled" as const });

describe("datas", () => {
  it("acha o dia da semana", () => {
    expect(dayKeyOfDate("2026-09-30")).toBe("Wed");
    expect(dayKeyOfDate("2026-10-04")).toBe("Sun");
  });

  it("acha a segunda-feira da semana", () => {
    expect(mondayOfDate("2026-10-04")).toBe("2026-09-28");
    expect(mondayOfDate("2026-09-28")).toBe("2026-09-28");
  });

  it("oferece de amanhã em diante, nunca hoje", () => {
    const opcoes = testDateOptions("2026-09-29");
    expect(opcoes[0]).toBe("2026-09-30");
    expect(opcoes).toHaveLength(14);
  });
});

describe("a sessão do teste", () => {
  it("são 6 km no total: 2 de aquecimento, 3 de teste, 1 de volta", () => {
    const s = testSession("Wed", "Quarta");
    expect(s.distance_km).toBe(6);
    expect(s.structure!.blocks).toHaveLength(3);
    expect(s.type).toBe("test");
  });
});

describe("marcar o teste na semana", () => {
  it("ocupa o lugar do tiro", () => {
    const out = applyPlannedTest(plan(), scheduled("2026-09-30"));
    const wed = out.days.find(d => d.day === "Wed")!;
    expect(wed.label).toBe("Teste de 3 km");
    expect(wed.distance_km).toBe(6);
  });

  it("não toca no resto da semana", () => {
    const antes = plan();
    const out = applyPlannedTest(antes, scheduled("2026-09-30"));
    expect(out.days.find(d => d.day === "Sat")).toEqual(antes.days.find(d => d.day === "Sat"));
    expect(out.days.find(d => d.day === "Mon")!.distance_km).toBe(6);
  });

  it("num dia de descanso, simplesmente aparece", () => {
    const out = applyPlannedTest(plan(), scheduled("2026-09-29"));
    const tue = out.days.find(d => d.day === "Tue")!;
    expect(tue.label).toBe("Teste de 3 km");
    expect(tue.dayPt).toBe("Terça");
  });

  it("a musculação do dia continua lá", () => {
    const out = applyPlannedTest(plan(), scheduled("2026-09-28"));
    const mon = out.days.find(d => d.day === "Mon")!;
    expect(mon.label).toBe("Teste de 3 km");
    expect(mon.strength).toBeTruthy();
  });

  it("teste de outra semana não entra nesta", () => {
    const antes = plan();
    expect(applyPlannedTest(antes, scheduled("2026-10-07"))).toBe(antes);
  });

  it("teste já feito ou cancelado não aparece", () => {
    const antes = plan();
    expect(applyPlannedTest(antes, { ...scheduled("2026-09-30"), status: "done" })).toBe(antes);
    expect(applyPlannedTest(antes, { ...scheduled("2026-09-30"), status: "skipped" })).toBe(antes);
    expect(applyPlannedTest(antes, null)).toBe(antes);
  });

  it("diz o que saiu do lugar", () => {
    expect(replacedByTest(plan(), scheduled("2026-09-30"))!.label).toBe("Tiros de 1 km");
    expect(replacedByTest(plan(), scheduled("2026-09-29"))).toBeNull();
  });
});
