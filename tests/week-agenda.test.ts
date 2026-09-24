/**
 * A semana lida como agenda: cada sessão vira uma linha.
 *
 * O que importa aqui é o que a grade antiga não dizia — que quinta-feira tem
 * duas sessões, quanto dura cada uma, e que o nome do treino não termina em
 * "…". E o que a primeira versão da agenda ainda não dizia: a duração da
 * musculação quando ela divide o dia com uma corrida.
 */
import { describe, expect, it } from "vitest";
import { agendaLine, weekSummaryLine } from "@/lib/week-agenda";
import type { WeeklyPlanDay } from "@/types";

const day = (over: Partial<WeeklyPlanDay>): WeeklyPlanDay => ({
  day: "Thu", dayPt: "Quinta", type: "easy", sport: "corrida",
  label: "Corrida leve", description: "", ...over,
} as WeeklyPlanDay);

describe("as linhas do dia na agenda", () => {
  it("encurta o nome do treino de tiro — o nome inteiro fica no card", () => {
    const { sessions } = agendaLine(day({ type: "intervals", label: "Tiros curtos 6×200 m", distance_km: 8 }));
    expect(sessions[0].label).toBe("Tiro");
    expect(sessions[0].metric).toBe("8 km");
  });

  it("mas não encurta o que já é curto", () => {
    const { sessions } = agendaLine(day({ type: "long_run", label: "Longão", distance_km: 12 }));
    expect(sessions[0].label).toBe("Longão");
  });

  it("a segunda sessão do dia tem linha e medida próprias", () => {
    const { sessions } = agendaLine(day({
      distance_km: 6,
      strength: { exercises: [{}, {}, {}], estimatedMinutes: 45 },
    } as Partial<WeeklyPlanDay>));
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ label: "Corrida leve", metric: "6 km" });
    // Era "+ musculação", em cinza e sem duração nenhuma.
    expect(sessions[1]).toMatchObject({ label: "Musculação", metric: "45 min" });
  });

  it("num dia só de musculação, a medida é a dela", () => {
    const { sessions } = agendaLine(day({
      type: "strength", sport: "musculacao", label: "Musculação",
      distance_km: undefined, duration_min: undefined,
      strength: { exercises: [{}, {}], estimatedMinutes: 50 },
    } as Partial<WeeklyPlanDay>));
    expect(sessions).toEqual([{ label: "Musculação", metric: "50 min", type: "strength" }]);
  });

  it("descanso é descanso, sem sessão nenhuma", () => {
    const line = agendaLine(day({ type: "rest", sport: undefined, label: "Descanso" } as Partial<WeeklyPlanDay>));
    expect(line).toEqual({ sessions: [], rest: true });
  });

  it("sem distância, a medida é o tempo", () => {
    const { sessions } = agendaLine(day({ sport: "ciclismo", label: "Pedal leve", duration_min: 40 }));
    expect(sessions[0].metric).toBe("40 min");
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
