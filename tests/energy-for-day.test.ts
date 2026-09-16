import { describe, it, expect } from "vitest";
import { energyForDay, tdeeForDay } from "@/lib/nutrition";

const HOJE = "2026-09-14";
const BMR = 1750;

describe("sem relógio, nada muda", () => {
  it("é exatamente a fórmula de antes", () => {
    for (const treino of [0, 412.6, 900]) {
      const e = energyForDay({ formulaBmr: BMR, trainingKcal: treino, today: HOJE });
      expect(e.tdee).toBe(tdeeForDay(BMR, treino));
      expect(e.bmrSource).toBe("formula");
      expect(e.activeSource).toBe("estimate");
    }
  });
});

describe("basal medido pelo relógio", () => {
  it("usa a mediana dos dias fechados", () => {
    const readings = [
      { date: "2026-09-11", resting_kcal: 1810 },
      { date: "2026-09-12", resting_kcal: 1790 },
      { date: "2026-09-13", resting_kcal: 1830 },
    ];
    const e = energyForDay({ formulaBmr: BMR, trainingKcal: 0, today: HOJE, readings });
    expect(e.bmr).toBe(1810);
    expect(e.bmrSource).toBe("watch");
  });

  it("ignora o dia de hoje — às 8h ele tem um terço do basal", () => {
    const e = energyForDay({
      formulaBmr: BMR, trainingKcal: 0, today: HOJE,
      readings: [{ date: HOJE, resting_kcal: 1800 }],
    });
    expect(e.bmrSource).toBe("formula");
  });

  it("ignora um dia em que o atalho rodou cedo e pegou só a manhã", () => {
    const e = energyForDay({
      formulaBmr: BMR, trainingKcal: 0, today: HOJE,
      readings: [{ date: "2026-09-13", resting_kcal: 610 }],
    });
    expect(e.bmr).toBe(BMR);
  });

  it("ignora leituras de mais de duas semanas", () => {
    const e = energyForDay({
      formulaBmr: BMR, trainingKcal: 0, today: HOJE,
      readings: [{ date: "2026-08-20", resting_kcal: 1900 }],
    });
    expect(e.bmrSource).toBe("formula");
  });
});

describe("gasto ativo", () => {
  it("de manhã o relógio quase não mediu — vale a estimativa, a meta não despenca", () => {
    const e = energyForDay({
      formulaBmr: BMR, trainingKcal: 0, today: HOJE,
      readings: [{ date: HOJE, active_kcal: 45 }],
    });
    expect(e.activeSource).toBe("estimate");
    expect(e.tdee).toBe(tdeeForDay(BMR, 0));
  });

  it("um dia a pé que passou da estimativa usa o que foi medido", () => {
    const e = energyForDay({
      formulaBmr: BMR, trainingKcal: 0, today: HOJE,
      readings: [{ date: HOJE, active_kcal: 1100 }],
    });
    expect(e.activeSource).toBe("watch");
    expect(e.tdee).toBe(BMR + 1100);
  });

  it("não conta a corrida duas vezes — o relógio já inclui o treino", () => {
    // Corrida de 700 kcal no Strava; o relógio mediu 1300 no dia, com a corrida dentro.
    const e = energyForDay({
      formulaBmr: BMR, trainingKcal: 700, today: HOJE,
      readings: [{ date: HOJE, active_kcal: 1300 }],
    });
    expect(e.tdee).toBe(BMR + 1300);          // não BMR + 1300 + 700
    expect(e.activeSource).toBe("watch");
  });
});
