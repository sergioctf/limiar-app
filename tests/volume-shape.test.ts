/**
 * Quanto a semana pode crescer, e que forma ela tem.
 *
 * Três decisões do Sérgio em 21–22/09, todas vindas da semana de 21/09 (rodagem
 * de 9,5 km, do tamanho do longão da semana anterior) e da de 28/09 (3 + 3 + 8):
 *
 *   1. A trava de volume ("o que você correu vira o piso") não pode subir a
 *      semana 29% por causa de uma troca de treino. Teto — **variável conforme
 *      o desempenho**, não fixo em 10%.
 *   2. A rodagem não pode ser a válvula de escape do volume: a sobra vai para o
 *      aquecimento e o desaquecimento do dia de tiro.
 *   3. Semana de recuperação não prescreve corrida abaixo do mínimo do atleta;
 *      tira uma corrida em vez de encurtar todas.
 */
import { describe, expect, it } from "vitest";
import {
  distributeWeeklyVolume, growthCeiling, runDaysForBudget, volumeWithRatchet,
} from "@/lib/workout-builder";
import { countDeliveredStreak } from "@/lib/weekly-plan";

describe("quanto a semana pode crescer", () => {
  const base = { raceAhead: false, deliveredStreak: 0, provenWeeklyKm: null, targetKm: 20 };

  it("sem prova e sem histórico recente, o teto clássico: 10%", () => {
    expect(growthCeiling(base)).toBeCloseTo(0.10);
  });

  it("entregar a semana anterior vale cinco pontos", () => {
    expect(growthCeiling({ ...base, deliveredStreak: 1 })).toBeCloseTo(0.15);
  });

  it("três semanas seguidas entregues valem mais cinco", () => {
    expect(growthCeiling({ ...base, deliveredStreak: 3 })).toBeCloseTo(0.20);
  });

  it("voltar a um volume já sustentado é terreno conhecido, não terreno novo", () => {
    // Já segurou 29,7 km/semana; 24 km não é novidade para este corpo.
    expect(growthCeiling({ ...base, provenWeeklyKm: 29.7, targetKm: 24 })).toBeGreaterThanOrEqual(0.20);
    // Acima do que já sustentou, volta a ser terreno novo.
    expect(growthCeiling({ ...base, provenWeeklyKm: 29.7, targetKm: 33 })).toBeCloseTo(0.10);
  });

  it("uma prova marcada justifica pressa — cinco pontos a mais", () => {
    expect(growthCeiling({ ...base, raceAhead: true, deliveredStreak: 1 })).toBeCloseTo(0.20);
  });

  it("nunca passa de 25% numa semana, por melhor que esteja", () => {
    expect(growthCeiling({ ...base, raceAhead: true, deliveredStreak: 8, provenWeeklyKm: 60, targetKm: 30 }))
      .toBeLessThanOrEqual(0.25);
  });

  describe("o corpo tem voto", () => {
    it("carga aguda alta corta o teto pela metade", () => {
      // ACWR 1,31 é o que o Sérgio tinha em 21/09 — acima da faixa segura (0,8–1,3).
      const calmo = growthCeiling({ ...base, deliveredStreak: 1 });
      expect(growthCeiling({ ...base, deliveredStreak: 1, acwr: 1.31 })).toBeCloseTo(calmo / 2);
    });

    it("forma muito negativa também", () => {
      expect(growthCeiling({ ...base, deliveredStreak: 1, tsb: -18 })).toBeCloseTo(0.075);
    });

    it("carga aguda de risco trava o crescimento", () => {
      expect(growthCeiling({ ...base, deliveredStreak: 3, acwr: 1.6 })).toBe(0);
    });

    it("e o atleta pedindo mais leve trava também, por melhor que estejam os números", () => {
      expect(growthCeiling({ ...base, deliveredStreak: 3, provenWeeklyKm: 60, easedOff: true })).toBe(0);
    });
  });
});

describe("a trava de volume respeita o teto", () => {
  it("a semana de 21/09 do Sérgio: 19 planejados, 24,5 corridos", () => {
    // Sem teto era 24,5 km — +29% num pulo, puxado por uma troca de treino.
    const semTeto = volumeWithRatchet(17, { previousPlannedKm: 19, previousActualKm: 24.5 });
    expect(semTeto).toBe(25);

    // Com ACWR 1,31 o teto cai para 10%: 19 → 21 km, que foi onde ele próprio chegou.
    const comTeto = volumeWithRatchet(17, {
      previousPlannedKm: 19, previousActualKm: 24.5, growthCeiling: 0.10,
    });
    expect(comTeto).toBe(21);
  });

  it("correr menos que o plano não vira crescimento", () => {
    expect(volumeWithRatchet(17, { previousPlannedKm: 19, previousActualKm: 14, growthCeiling: 0.2 })).toBe(17);
  });

  it("teto zero segura na semana anterior, sem encolher", () => {
    expect(volumeWithRatchet(17, { previousPlannedKm: 19, previousActualKm: 24.5, growthCeiling: 0 })).toBe(19);
  });

  it("semana mais leve por desenho ignora a trava, como antes", () => {
    expect(volumeWithRatchet(14, {
      previousPlannedKm: 21, previousActualKm: 21, lighterByDesign: true, growthCeiling: 0.2,
    })).toBe(14);
  });
});

describe("a rodagem não é a válvula de escape", () => {
  it("na semana de 24,5 km, a rodagem para de ter o tamanho do longão", () => {
    // Antes: longão 11, rodagem 10 — uma rodagem do tamanho do longão da semana
    // anterior, um dia depois de um longão de 10,5.
    const d = distributeWeeklyVolume(24.5, 1, 3.5, 3, 21.4, { minRunKm: 5, minLongRunKm: 8 });

    expect(d.easyKm).toBeLessThanOrEqual(d.longKm * 0.7 + 0.25);
    // O que a rodagem recusou tem que aparecer, não sumir do total da semana.
    expect(d.longKm + d.easyKm + d.surplusKm + 3.5).toBeCloseTo(24.5, 1);
    expect(d.surplusKm).toBeGreaterThan(0);
  });

  it("sem dia de tiro para absorver, a rodagem fica com a sobra", () => {
    // Melhor uma rodagem longa do que a semana perder quilômetros em silêncio.
    const d = distributeWeeklyVolume(24.5, 1, 0, 2, 21.4, { minRunKm: 5, minLongRunKm: 8, hasQualityDay: false });
    expect(d.surplusKm).toBe(0);
    expect(d.longKm + d.easyKm).toBeCloseTo(24.5, 1);
  });
});

describe("semana de recuperação não inventa corrida de 3 km", () => {
  const dias = ["Mon", "Wed", "Sat"] as const;

  it("14 km com longão de 8 e mínimo de 5 cabem em duas corridas, não três", () => {
    const kept = runDaysForBudget([...dias], {
      weeklyKm: 14, longFloorKm: 8, minRunKm: 5, longRunDay: "Sat",
    });
    expect(kept).toEqual(["Mon", "Sat"]);
  });

  it("com volume que paga o mínimo em todas, não tira nada", () => {
    const kept = runDaysForBudget([...dias], {
      weeklyKm: 21, longFloorKm: 8, minRunKm: 5, longRunDay: "Sat",
    });
    expect(kept).toEqual(["Mon", "Wed", "Sat"]);
  });

  it("no limite, o longão é a última corrida a cair", () => {
    const kept = runDaysForBudget([...dias], {
      weeklyKm: 8, longFloorKm: 8, minRunKm: 5, longRunDay: "Sat",
    });
    expect(kept).toEqual(["Sat"]);
  });
});

describe("semanas seguidas entregues", () => {
  const w = (plannedKm: number, actualKm: number, finished = true) => ({ plannedKm, actualKm, finished });

  it("conta de trás para frente, parando na primeira falhada", () => {
    expect(countDeliveredStreak([w(19, 24.5), w(19, 19), w(18, 12), w(18, 20)])).toBe(2);
  });

  it("semana em curso não conta nem quebra — ela não teve chance", () => {
    expect(countDeliveredStreak([w(21, 6, false), w(19, 24.5), w(19, 19)])).toBe(2);
  });

  it("semana sem plano quebra a sequência: não há o que entregar", () => {
    expect(countDeliveredStreak([w(19, 24.5), w(0, 15), w(19, 19)])).toBe(1);
  });

  it("sem histórico, zero", () => {
    expect(countDeliveredStreak([])).toBe(0);
  });
});
