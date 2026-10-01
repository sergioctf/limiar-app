/**
 * O menu de quem acabou de entrar.
 *
 * Esconder navegação é perigoso de um jeito específico: some a porta e some o
 * caminho para destravá-la. Os testes aqui existem para garantir as duas
 * promessas feitas em 01/10 — o app nunca fica sem o essencial, e nada do que
 * foi escondido vira beco sem saída.
 */
import { describe, expect, it } from "vitest";
import { EMPTY_NAV, hiddenAreas, isAreaVisible, isTabVisible, type NavData } from "@/lib/nav-visibility";

const novo: NavData = EMPTY_NAV;
const comUmaCorrida: NavData = { ...EMPTY_NAV, runs: 1 };
const veterano: NavData = { runs: 120, activities: 40, races: 2, goals: 1, friends: 5, healthDevice: true };

describe("o app nunca fica sem o essencial", () => {
  it("Hoje, Treinador e Configurações aparecem sempre", () => {
    for (const k of ["hoje", "treinador", "config"] as const) {
      expect(isAreaVisible(k, novo), k).toBe(true);
    }
  });

  it("e o Treinador mantém Plano e Calibração — é por onde se começa", () => {
    expect(isTabVisible("/coach", novo)).toBe(true);
    expect(isTabVisible("/coach/calibracao", novo)).toBe(true);
  });
});

describe("conta nova vê pouco", () => {
  it("sem corrida, sem Histórico", () => {
    expect(isAreaVisible("historico", novo)).toBe(false);
  });

  it("sem relógio, sem Saúde", () => {
    expect(isAreaVisible("saude", novo)).toBe(false);
  });

  it("sem corrida e sem amigo, sem Amigos", () => {
    expect(isAreaVisible("amigos", novo)).toBe(false);
  });

  it("sem corrida, sem Provas nem Metas", () => {
    expect(isTabVisible("/races", novo)).toBe(false);
    expect(isTabVisible("/goals", novo)).toBe(false);
  });
});

describe("a primeira corrida destrava quase tudo", () => {
  it("Histórico, Amigos, Provas e Metas aparecem", () => {
    expect(isAreaVisible("historico", comUmaCorrida)).toBe(true);
    expect(isAreaVisible("amigos", comUmaCorrida)).toBe(true);
    expect(isTabVisible("/races", comUmaCorrida)).toBe(true);
    expect(isTabVisible("/goals", comUmaCorrida)).toBe(true);
  });

  it("mas Gráficos esperam três — com uma, a linha não é linha", () => {
    expect(isTabVisible("/analytics", comUmaCorrida)).toBe(false);
    expect(isTabVisible("/analytics", { ...EMPTY_NAV, runs: 3 })).toBe(true);
  });

  it("uma atividade de academia também abre o Histórico", () => {
    expect(isAreaVisible("historico", { ...EMPTY_NAV, activities: 1 })).toBe(true);
  });

  it("um amigo abre Amigos mesmo sem correr", () => {
    expect(isAreaVisible("amigos", { ...EMPTY_NAV, friends: 1 })).toBe(true);
  });

  it("um relógio abre Saúde", () => {
    expect(isAreaVisible("saude", { ...EMPTY_NAV, healthDevice: true })).toBe(true);
  });
});

describe("quem já usa o app vê tudo", () => {
  it("nenhuma área escondida", () => {
    for (const k of ["hoje", "treinador", "historico", "saude", "amigos", "config"] as const) {
      expect(isAreaVisible(k, veterano), k).toBe(true);
    }
    expect(hiddenAreas(veterano)).toEqual([]);
  });
});

describe("esconder é promessa, não sumiço", () => {
  it("toda área escondida diz o que falta", () => {
    const escondidas = hiddenAreas(novo);
    expect(escondidas.length).toBeGreaterThan(0);
    for (const a of escondidas) {
      expect(a.unlocks.length, a.label).toBeGreaterThan(20);
      expect(a.href.startsWith("/"), a.label).toBe(true);
    }
  });

  it("cobre tudo que foi escondido", () => {
    const labels = hiddenAreas(novo).map(a => a.label);
    expect(labels).toContain("Histórico");
    expect(labels).toContain("Saúde");
    expect(labels).toContain("Amigos");
    expect(labels).toContain("Provas");
    expect(labels).toContain("Metas");
  });

  it("com corridas de menos, explica os Gráficos sem repetir o Histórico", () => {
    const labels = hiddenAreas(comUmaCorrida).map(a => a.label);
    expect(labels).toContain("Gráficos");
    expect(labels).not.toContain("Histórico");
  });
});
