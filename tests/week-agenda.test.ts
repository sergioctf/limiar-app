/**
 * A semana lida como agenda: cada dia vira uma frase.
 *
 * O que importa aqui é o que a grade antiga não dizia — que quinta-feira tem
 * duas sessões, e que o nome do treino não termina em "…".
 */
import { describe, expect, it } from "vitest";
import { agendaLine, weekSummaryLine } from "@/lib/week-agenda";
import type { WeeklyPlanDay } from "@/types";

const day = (over: Partial<WeeklyPlanDay>): WeeklyPlanDay => ({
  day: "Thu", dayPt: "Quinta", type: "easy", sport: "corrida",
  label: "Corrida leve", description: "", ...over,
} as WeeklyPlanDay);

describe("a linha do dia na agenda", () => {
  it("diz o nome inteiro do treino, não seis letras", () => {
    const line = agendaLine(day({ type: "intervals", label: "Tiros curtos", distance_km: 8 }));
    expect(line.main).toBe("Tiros curtos");
    expect(line.metric).toBe("8 km");
  });

  it("mostra a segunda sessão do dia", () => {
    const line = agendaLine(day({
      distance_km: 6,
      strength: { exercises: [{}, {}, {}], estimatedMinutes: 45 },
    } as Partial<WeeklyPlanDay>));
    expect(line.main).toBe("Corrida leve");
    expect(line.extra).toBe("musculação");
    // A medida é a da corrida: é ela que manda no dia.
    expect(line.metric).toBe("6 km");
  });

  it("num dia só de musculação, a medida é a da musculação", () => {
    const line = agendaLine(day({
      type: "strength", sport: "musculacao", label: "Musculação",
      distance_km: undefined, duration_min: undefined,
      strength: { exercises: [{}, {}], estimatedMinutes: 50 },
    } as Partial<WeeklyPlanDay>));
    expect(line.main).toBe("Musculação");
    expect(line.extra).toBeNull();
    expect(line.metric).toBe("50 min");
  });

  it("descanso é descanso, sem medida", () => {
    const line = agendaLine(day({ type: "rest", sport: undefined, label: "Descanso" } as Partial<WeeklyPlanDay>));
    expect(line).toEqual({ main: "Descanso", extra: null, metric: null });
  });

  it("sem distância, a medida é o tempo", () => {
    const line = agendaLine(day({ sport: "ciclismo", label: "Pedal leve", duration_min: 40 }));
    expect(line.metric).toBe("40 min");
  });
});

describe("o resumo da semana no cabeçalho", () => {
  const week = (): WeeklyPlanDay[] => [
    day({ day: "Mon", type: "easy", label: "Rodagem leve", distance_km: 6,
      strength: { exercises: [{}, {}], estimatedMinutes: 45 } } as Partial<WeeklyPlanDay>),
    day({ day: "Tue", type: "rest", sport: undefined, label: "Descanso" } as Partial<WeeklyPlanDay>),
    day({ day: "Wed", type: "intervals", label: "Tiros", distance_km: 9 }),
    day({ day: "Thu", type: "strength", sport: "musculacao", label: "Musculação",
      strength: { exercises: [{}], estimatedMinutes: 50 } } as Partial<WeeklyPlanDay>),
    day({ day: "Sat", type: "long_run", label: "Longão", distance_km: 11.5 }),
  ];

  it("conta corridas, quilômetros e sessões de musculação", () => {
    // 6 + 9 + 11,5 = 26,5 → 27 km. O total da semana é ordem de grandeza.
    expect(weekSummaryLine(week())).toBe("3 corridas · 27 km · 2 sessões de musculação");
  });

  it("fala no singular quando é uma só", () => {
    const line = weekSummaryLine([day({ day: "Wed", label: "Rodagem", distance_km: 5 })]);
    expect(line).toBe("1 corrida · 5 km");
  });

  it("conta os outros esportes sem misturar com a corrida", () => {
    const line = weekSummaryLine([day({ sport: "natacao", type: "easy", label: "Natação", duration_min: 40 })]);
    expect(line).toBe("1 treino de outro esporte");
  });

  it("uma semana inteira de descanso não inventa resumo", () => {
    const line = weekSummaryLine([day({ type: "rest", sport: undefined, label: "Descanso" } as Partial<WeeklyPlanDay>)]);
    expect(line).toBeNull();
  });
});
