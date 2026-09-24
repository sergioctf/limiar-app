/**
 * O texto do dia e a sessão do dia não podem discordar.
 *
 * Semana de 21/09 do Sérgio, vista em 24/09: a quinta-feira dizia *"Depois
 * (idealmente ~6 h depois), musculação: peito"* e a sessão anexada era
 * agachamento, terra, desenvolvimento, búlgaro e nórdico — ombro, glúteo e
 * quadríceps. "Peito" era a musculação de **segunda**.
 *
 * A causa: a frase era gravada dentro da descrição da corrida no momento em que
 * o plano nasceu. Quando a corrida mudou de dia — e há quatro caminhos para
 * isso — a frase viajou junto e passou a descrever o dia errado. Três dos
 * quatro caminhos removiam a cauda; o quarto não.
 *
 * A correção tira a frase do texto gravado: ela é derivada da sessão que está
 * naquele dia, na hora de mostrar. Texto e sessão passam a ter uma origem só.
 */
import { describe, expect, it } from "vitest";
import { describeDay, strengthTail, stripStrengthTail } from "@/lib/day-description";
import type { WeeklyPlanDay } from "@/types";

const session = (muscles: string[], n = 5) => ({
  exercises: Array.from({ length: n }, () => ({})),
  muscles,
  estimatedMinutes: 45,
  cardio: null,
  notes: [],
  deloaded: false,
} as unknown as WeeklyPlanDay["strength"]);

const day = (over: Partial<WeeklyPlanDay>): WeeklyPlanDay => ({
  day: "Thu", dayPt: "Quinta", type: "easy", sport: "corrida",
  label: "Rodagem leve", description: "Rodagem tranquila de 6 km em ritmo fácil.",
  ...over,
} as WeeklyPlanDay);

describe("a cauda de musculação vem do dia, não do passado", () => {
  it("o caso real: a quinta dizia peito e treinava ombro e perna", () => {
    const quinta = day({
      description: "Rodagem tranquila de 6 km em ritmo fácil. Depois (idealmente ~6 h depois), musculação: peito.",
      strength: session(["ombro", "gluteo", "quadriceps"]),
    });
    const texto = describeDay(quinta);

    expect(texto).not.toContain("peito");
    expect(texto).toContain("ombro");
    expect(texto).toContain("Rodagem tranquila de 6 km em ritmo fácil.");
  });

  it("a cauda antiga é removida mesmo sem sessão nova no dia", () => {
    const semMusculacao = day({
      description: "Rodagem de 6 km. Depois (idealmente ~6 h depois), musculação: peito.",
    });
    expect(describeDay(semMusculacao)).toBe("Rodagem de 6 km.");
  });

  it("remove também a forma antiga, sem o parêntese", () => {
    expect(stripStrengthTail("Longão de 11,5 km. Depois, musculação: core e estabilidade."))
      .toBe("Longão de 11,5 km.");
  });

  it("um dia sem musculação não ganha frase nenhuma", () => {
    expect(strengthTail(day({}))).toBeNull();
  });

  it("no dia que é só musculação, a corrida não é mencionada", () => {
    // Ali a sessão É o treino do dia; a frase "depois, musculação" não faz sentido.
    const forca = day({ type: "strength", sport: "musculacao", label: "Musculação", strength: session(["costas"]) });
    expect(strengthTail(forca)).toBeNull();
  });

  it("sem saber os músculos, fala do que sabe — e não inventa grupo", () => {
    const semMusculos = day({ strength: session([], 4) });
    const tail = strengthTail(semMusculos)!;
    expect(tail).toContain("4 exercícios");
    expect(tail).not.toMatch(/peito|costas|perna/i);
  });

  it("não duplica a cauda quando o texto é passado duas vezes", () => {
    const d = day({ strength: session(["core"]) });
    const uma = describeDay(d);
    const duas = describeDay({ ...d, description: uma });
    expect(duas).toBe(uma);
  });
});
