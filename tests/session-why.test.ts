import { describe, it, expect } from "vitest";
import { sessionWhy } from "@/lib/session-why";

/**
 * O motor decide muito e conta nada. Ele escolhe o tipo de treino forte pela
 * posição no bloco de quatro semanas, dimensiona o longão como fração do
 * volume e segura os dias leves de propósito — e o atleta recebe tudo isso
 * como uma planilha que por acaso tem números.
 *
 * Uma frase por sessão. Não uma aula: uma razão.
 */

const dia = (over: Record<string, unknown> = {}) => ({
  day: "Wed", dayPt: "Quarta", type: "intervals", sport: "corrida",
  label: "Tiro 3×400 m", distance_km: 3.5, description: "", ...over,
} as never);

describe("o treino forte explica por que é este hoje", () => {
  it("a semana densa diz o que a torna densa", () => {
    const w = sessionWhy(dia({ label: "Tiro denso 3×600 m" }), { cycleWeek: 3 });
    expect(w).toMatch(/menos trote/i);
  });

  it("os 200 m dizem que não são treino de fôlego", () => {
    expect(sessionWhy(dia({ label: "Tiros curtos 7×200 m" }))).toMatch(/economia|giro/i);
  });

  it("a subida explica o custo articular baixo", () => {
    expect(sessionWhy(dia({ label: "Subidas 8×45 s" }))).toMatch(/articular|força/i);
  });

  it("o fartlek nomeia o que o tiro com parada não ensaia", () => {
    expect(sessionWhy(dia({ label: "Fartlek 6×2 min" }))).toMatch(/recuperar correndo|marcha/i);
  });

  it("o progressivo fala de controle de ritmo", () => {
    expect(sessionWhy(dia({ label: "Progressivo 6.5 km" }))).toMatch(/controle de ritmo/i);
  });
});

describe("longão", () => {
  it("diz que fatia da semana ele é", () => {
    const w = sessionWhy(dia({ type: "long_run", label: "Longão", distance_km: 9.5 }), { weeklyKm: 19 });
    expect(w).toMatch(/50%/);
  });

  it("numa semana de recuo, explica por que encolheu", () => {
    const w = sessionWhy(dia({ type: "long_run", distance_km: 7 }), { weeklyKm: 15, isRecovery: true });
    expect(w).toMatch(/recuo/i);
  });
});

describe("dias leves", () => {
  it("dizem por que são leves, que é o que ninguém respeita", () => {
    const w = sessionWhy(dia({ type: "easy", label: "Rodagem leve" }));
    expect(w).toMatch(/base|acelerar/i);
  });
});

describe("quando calar é melhor", () => {
  it("um descanso comum não precisa de justificativa", () => {
    expect(sessionWhy(dia({ type: "rest", label: "Descanso", distance_km: null }))).toBeNull();
  });

  it("mas o descanso de uma semana de recuo precisa", () => {
    const w = sessionWhy(dia({ type: "rest", distance_km: null }), { isRecovery: true });
    expect(w).toMatch(/recuo/i);
  });

  it("a musculação já se explica no próprio card", () => {
    expect(sessionWhy(dia({ type: "strength", label: "Musculação", distance_km: null }))).toBeNull();
  });
});

describe("o teste", () => {
  it("explica por que cai numa semana com perna descansada", () => {
    const w = sessionWhy(dia({ type: "test", label: "Teste de 3 km", distance_km: 6 }));
    expect(w).toMatch(/cansad|descansad/i);
  });
});

describe("robustez", () => {
  it("nunca devolve frase vazia", () => {
    for (const t of ["easy","long_run","intervals","tempo","test","rest","strength"]) {
      const w = sessionWhy(dia({ type: t }), { cycleWeek: 2, weeklyKm: 20 });
      if (w !== null) expect(w.trim().length).toBeGreaterThan(20);
    }
  });

  it("não quebra sem contexto nenhum", () => {
    expect(() => sessionWhy(dia({ label: "" }), {})).not.toThrow();
  });
});
