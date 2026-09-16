import { describe, it, expect } from "vitest";
import { volumeWithRatchet } from "@/lib/workout-builder";
import { recoveryApplies, weekIsUnderway } from "@/lib/mesocycle";

/**
 * Uma semana já começada não é uma folha em branco.
 *
 * O caso real: o Sérgio tinha um plano de 19 km para a semana de 31/08, correu
 * 5,87 km na segunda, e na terça aceitou o banner de "plano desatualizado". A
 * regeração reescreveu a semana em andamento — que o ciclo classificava como
 * semana de recuo — cortando a rodagem de 6 para 3 km e o longão de 9,5 para 8.
 *
 * Ele já tinha organizado a semana em torno do plano anterior. Reescrevê-la por
 * baixo depois de a pessoa ter treinado não é atualizar, é apagar.
 */

describe("semana em andamento", () => {
  it("reconhece uma semana que já começou", () => {
    expect(weekIsUnderway("2026-08-31", "2026-09-02")).toBe(true);
    expect(weekIsUnderway("2026-08-31", "2026-08-31")).toBe(true);
  });

  it("a semana que vem não está em andamento", () => {
    expect(weekIsUnderway("2026-09-07", "2026-09-02")).toBe(false);
  });

  it("uma semana passada conta como começada", () => {
    expect(weekIsUnderway("2026-08-24", "2026-09-02")).toBe(true);
  });
});

describe("o volume de uma semana começada nunca encolhe", () => {
  it("mantém o que já estava prescrito", () => {
    // 14 proposto contra 19 já publicados, com a semana rodando.
    expect(volumeWithRatchet(14, { alreadyPlannedThisWeekKm: 19 })).toBe(19);
  });

  it("mas pode crescer, se o motor achar que cabe mais", () => {
    expect(volumeWithRatchet(22, { alreadyPlannedThisWeekKm: 19 })).toBe(22);
  });

  it("não interfere quando a semana ainda não começou", () => {
    expect(volumeWithRatchet(14, {})).toBe(14);
  });

  it("o recuo planejado ainda pode cair, se a semana não começou", () => {
    expect(volumeWithRatchet(14, { previousPlannedKm: 19, previousActualKm: 19, lighterByDesign: true })).toBe(14);
  });
});

describe("o recuo precisa ser merecido", () => {
  /*
   * Recuar de quê? Uma semana de recuo depois de três semanas fracas não
   * recupera nada — só reduz um volume que já estava baixo. A cadência do
   * bloco é uma âncora de calendário, e calendário não sabe o que o atleta fez.
   */
  it("vale quando as semanas anteriores tiveram carga", () => {
    expect(recoveryApplies([20, 22, 19], 20)).toBe(true);
  });

  it("não vale quando o atleta mal treinou", () => {
    expect(recoveryApplies([4, 3, 5], 20)).toBe(false);
  });

  it("não vale sem histórico nenhum", () => {
    expect(recoveryApplies([], 20)).toBe(false);
  });

  it("tolera uma semana fraca no meio de duas boas", () => {
    expect(recoveryApplies([20, 6, 21], 20)).toBe(true);
  });

  it("sem base conhecida, não inventa recuo", () => {
    expect(recoveryApplies([10, 10, 10], 0)).toBe(false);
  });
});
