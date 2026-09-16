/**
 * The dashboard shows one calorie number for the day. Opening it has to explain
 * that number honestly — including that part of it was never measured.
 *
 * Presenting a MET estimate identically to a figure the watch recorded is the
 * failure mode here: nothing errors, and the athlete plans a meal around a
 * number nobody measured.
 */
import { describe, it, expect } from "vitest";
import { calorieBreakdown } from "@/lib/calorie-breakdown";

const run = (over = {}) => ({
  name: "Corrida matinal", distance_km: 4.04, duration_seconds: 1500, calories: 276, ...over,
});
const gym = (over = {}) => ({
  name: "Musculação matinal", sport_type: "WeightTraining",
  duration_seconds: 3600, calories: null, ...over,
});

describe("o dia do atleta", () => {
  it("soma corrida e musculação do mesmo dia", () => {
    // O caso real: correu de manhã, levantou no almoço.
    const d = calorieBreakdown([run()], [gym({ duration_seconds: 1800 })], 75);
    expect(d.lines).toHaveLength(2);
    expect(d.total).toBe(d.lines.reduce((s, l) => s + l.kcal, 0));
  });

  it("distingue o que foi medido do que foi estimado", () => {
    const d = calorieBreakdown([run()], [gym()], 75);
    const corrida = d.lines.find(l => l.sport === "corrida")!;
    const musc    = d.lines.find(l => l.sport === "musculacao")!;
    expect(corrida.source).toBe("medido");
    expect(corrida.kcal).toBe(276);
    expect(musc.source).toBe("estimado");
    expect(d.hasEstimate).toBe(true);
  });

  it("não marca estimativa quando tudo veio do relógio", () => {
    const d = calorieBreakdown([run()], [gym({ calories: 300 })], 75);
    expect(d.hasEstimate).toBe(false);
  });

  it("ordena pela maior queima — é o que a pessoa abriu para descobrir", () => {
    const d = calorieBreakdown([run({ calories: 100 })], [gym({ calories: 400 })], 75);
    expect(d.lines[0].kcal).toBe(400);
  });

  it("estima a corrida quando o Strava não mandou calorias", () => {
    const d = calorieBreakdown([run({ calories: null })], [], 75);
    expect(d.lines[0].source).toBe("estimado");
    expect(d.lines[0].kcal).toBeGreaterThan(0);
  });
});

describe("linhas que não deveriam aparecer", () => {
  it("descarta atividade que não queimou nada", () => {
    // "0 kcal" numa lista lê como registro quebrado, não como ausência.
    const d = calorieBreakdown([], [gym({ duration_seconds: 0 })], 75);
    expect(d.lines).toEqual([]);
    expect(d.total).toBe(0);
  });

  it("aguenta um dia sem treino nenhum", () => {
    const d = calorieBreakdown([], [], 75);
    expect(d).toEqual({ total: 0, lines: [], hasEstimate: false });
  });

  it("dá nome a atividade sem nome em vez de mostrar vazio", () => {
    const d = calorieBreakdown([], [gym({ name: "  " })], 75);
    expect(d.lines[0].name.length).toBeGreaterThan(0);
  });
});

describe("esportes fora da taxonomia", () => {
  it("não quebra com um tipo desconhecido", () => {
    const d = calorieBreakdown([], [gym({ sport_type: "Parkour" })], 75);
    // Sem MET conhecido não há estimativa — melhor omitir que inventar.
    expect(() => d.total).not.toThrow();
    expect(d.lines.every(l => l.emoji.length > 0)).toBe(true);
  });

  it("classifica caminhada, pilates e bike sem cair", () => {
    const acts = ["Walk", "Pilates", "Ride", "Yoga"].map(t =>
      gym({ sport_type: t, name: t, duration_seconds: 1800 }));
    expect(() => calorieBreakdown([], acts, 75)).not.toThrow();
  });
});
