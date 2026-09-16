/**
 * The bug this closes: Wednesday had an interval session and a chest workout,
 * and the dashboard said "Tiro 3×400 m". The lifting was in the data, in the
 * plan, and rendered further down the page — but the heading, which is where
 * anyone looks to learn what their day is, named one of the two.
 */
import { describe, it, expect } from "vitest";
import { daySessions, dayTitle, isDoubleDay } from "@/lib/day-sessions";
import type { WeeklyPlanDay } from "@/types";

const strength = (n = 5) => ({
  exercises: Array.from({ length: n }, (_, i) => ({ exerciseId: `e${i}`, name: `Ex ${i}` })),
  estimatedMinutes: 45,
}) as WeeklyPlanDay["strength"];

const day = (over: Partial<WeeklyPlanDay> = {}): WeeklyPlanDay => ({
  day: "Wed", dayPt: "Quarta", type: "intervals", sport: "corrida",
  label: "Tiro 3×400 m", distance_km: 3.5, description: "", ...over,
});

describe("dias com duas sessões", () => {
  it("nomeia corrida e musculação, nessa ordem", () => {
    // Corrida primeiro porque é a ordem que o próprio plano prescreve.
    const s = daySessions(day({ strength: strength() }));
    expect(s.map(x => x.kind)).toEqual(["corrida", "musculacao"]);
    expect(dayTitle(day({ strength: strength() }))).toBe("Tiro 3×400 m + Musculação");
  });

  it("marca o dia como duplo", () => {
    expect(isDoubleDay(day({ strength: strength() }))).toBe(true);
    expect(isDoubleDay(day())).toBe(false);
  });

  it("leva distância e volume de cada sessão", () => {
    const [corrida, musc] = daySessions(day({ strength: strength(6) }));
    expect(corrida.detail).toBe("3.5 km");
    expect(musc.detail).toBe("6 exercícios · ~45 min");
  });

  it("usa duração quando não há distância", () => {
    const [s] = daySessions(day({ distance_km: undefined, duration_min: 40 }));
    expect(s.detail).toBe("40 min");
  });
});

describe("dias com uma sessão só", () => {
  it("não duplica quando o dia já é de musculação", () => {
    // "Musculação + Musculação" foi exatamente o risco de compor sem checar.
    const d = day({ type: "strength", sport: "musculacao", label: "Peito e tríceps",
                    distance_km: undefined, strength: strength() });
    expect(dayTitle(d)).toBe("Peito e tríceps");
    expect(daySessions(d)).toHaveLength(1);
  });

  it("mostra só a corrida quando não há musculação", () => {
    expect(dayTitle(day())).toBe("Tiro 3×400 m");
  });

  it("chama descanso de descanso", () => {
    expect(dayTitle(day({ type: "rest", label: "Descanso", sport: undefined,
                          distance_km: undefined }))).toBe("Descanso");
  });

  it("não conta sessão de força vazia", () => {
    const d = day({ strength: { exercises: [], estimatedMinutes: 0 } as never });
    expect(dayTitle(d)).toBe("Tiro 3×400 m");
    expect(isDoubleDay(d)).toBe(false);
  });
});

describe("descanso com musculação", () => {
  it("um dia sem corrida mas com força é dia de treino", () => {
    // Foi assim que a quinta apareceu como "descanso" tendo musculação.
    const d = day({ type: "rest", label: "Descanso", sport: undefined,
                    distance_km: undefined, strength: strength(4) });
    expect(dayTitle(d)).toBe("Musculação");
    expect(daySessions(d).map(x => x.kind)).toEqual(["musculacao"]);
  });
});

describe("entradas degeneradas", () => {
  it("aguenta dia nulo", () => {
    expect(daySessions(null)).toEqual([]);
    expect(dayTitle(undefined)).toBe("");
    expect(isDoubleDay(null)).toBe(false);
  });
});
