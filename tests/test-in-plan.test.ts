import { describe, it, expect } from "vitest";
import { buildWeekPlan } from "@/lib/workout-builder";
import { shouldScheduleTest } from "@/lib/test-status";
import { weekContext, PREFS_3_DAYS } from "./fixtures";

/**
 * O teste de 3 km é o ponto de calibração do app inteiro — ritmos, zonas de FC,
 * previsões e o conselheiro saem dele. Mas ele só era pedido por push, e push
 * se dispensa com um toque. Quatro dos seis atletas do app nunca fizeram um.
 *
 * Um lembrete que compete com a tela de bloqueio perde. Um treino na agenda de
 * quarta-feira, no lugar do tiro daquela semana, não.
 */

const sessao = (over: Record<string, unknown> = {}) => {
  const plan = buildWeekPlan(
    weekContext({ weeklyKm: 25, ...over }), ["corrida"], PREFS_3_DAYS,
  );
  return plan.find(d => d.type === "intervals" || d.type === "tempo" || d.type === "test");
};

describe("o teste entra na semana quando está devendo", () => {
  it("aparece como sessão, não como aviso", () => {
    const s = sessao({ testDue: true, cycleWeek: 1 });
    expect(s?.label).toMatch(/teste de 3\s*km/i);
  });

  it("ocupa o lugar do treino de qualidade, não se soma a ele", () => {
    // Duas sessões duras na mesma semana seria o oposto de calibrar com calma.
    const plan = buildWeekPlan(
      weekContext({ weeklyKm: 25, testDue: true, cycleWeek: 1 }), ["corrida"], PREFS_3_DAYS,
    );
    const duras = plan.filter(d => d.type === "intervals" || d.type === "tempo" || d.type === "test");
    expect(duras).toHaveLength(1);
  });

  it("não aparece quando o teste está em dia", () => {
    const s = sessao({ testDue: false, cycleWeek: 1 });
    expect(s?.label ?? "").not.toMatch(/teste/i);
  });

  it("o motor obedece quem agenda, sem decidir por conta própria", () => {
    // Quando agendar é política de calendário, e mora num lugar só.
    expect(sessao({ testDue: true, cycleWeek: 2 })?.label).toMatch(/teste/i);
  });
});

describe("quando o teste é agendado", () => {
  it("só na primeira semana do bloco — testar cansado mede fadiga, não forma", () => {
    for (const w of [2, 3, 4]) expect(shouldScheduleTest({ nudge: "strong" }, w)).toBe(false);
    expect(shouldScheduleTest({ nudge: "strong" }, 1)).toBe(true);
  });

  it("quem nunca testou é chamado com urgência", () => {
    expect(shouldScheduleTest({ nudge: "strong" }, 1)).toBe(true);
  });

  it("quem tem teste envelhecendo também", () => {
    expect(shouldScheduleTest({ nudge: "soft" }, 1)).toBe(true);
  });

  it("quem está em dia não é incomodado", () => {
    expect(shouldScheduleTest({ nudge: "none" }, 1)).toBe(false);
  });

  it("sem posição no ciclo, não agenda nada", () => {
    expect(shouldScheduleTest({ nudge: "strong" }, null)).toBe(false);
    expect(shouldScheduleTest({ nudge: "strong" }, undefined)).toBe(false);
  });

  it("traz a distância certa e um pouco de aquecimento", () => {
    const s = sessao({ testDue: true, cycleWeek: 1 });
    // 3 km de esforço mais aquecimento e desaquecimento.
    expect(s?.distance_km ?? 0).toBeGreaterThan(3);
    expect(s?.distance_km ?? 0).toBeLessThan(10);
  });

  it("explica como fazer, não só o que fazer", () => {
    const s = sessao({ testDue: true, cycleWeek: 1 });
    expect(s?.description ?? "").toMatch(/sustenta/i);
  });

  it("a semana continua tendo longão e rodagem", () => {
    // O teste substitui a qualidade, não a semana inteira.
    const plan = buildWeekPlan(
      weekContext({ weeklyKm: 25, testDue: true, cycleWeek: 1 }), ["corrida"], PREFS_3_DAYS,
    );
    expect(plan.some(d => d.type === "long_run")).toBe(true);
    expect(plan.some(d => d.type === "easy")).toBe(true);
  });
});
