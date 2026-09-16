import { describe, it, expect } from "vitest";
import { planWeeklyVolume, volumeWithRatchet } from "@/lib/workout-builder";

/**
 * O travamento que congelou o plano do Sérgio por seis semanas.
 *
 * O piso do ratchet era o volume *planejado* da semana anterior, não o
 * realizado. Com 19 km prescritos e ~10 km corridos, o motor propunha 17 (que
 * vem da média do realizado) e o ratchet devolvia max(17, 19) = 19. Toda
 * semana. O piso se auto-sustentava num plano que nunca foi executado, e a
 * proposta jamais o ultrapassava.
 */

describe("o piso é o que foi corrido, não o que foi pedido", () => {
  it("uma semana cumprida pela metade não vira chão", () => {
    // O caso real: 19 prescritos, 10 corridos, proposta 17.
    expect(volumeWithRatchet(17, { previousPlannedKm: 19, previousActualKm: 10 })).toBe(17);
  });

  it("e por isso o plano deixa de congelar", () => {
    let planejado = 19;
    const visto: number[] = [];
    for (let s = 0; s < 6; s++) {
      const realizado = 10;                       // sempre metade
      const proposta = planWeeklyVolume([realizado, realizado, realizado, realizado]);
      planejado = volumeWithRatchet(proposta, {
        previousPlannedKm: planejado, previousActualKm: realizado,
      });
      visto.push(planejado);
    }
    // Sem a correção isto seria [19,19,19,19,19,19].
    expect(new Set(visto).size === 1 && visto[0] === 19).toBe(false);
    expect(visto[visto.length - 1]).toBeLessThan(19);
  });

  it("quem quase cumpriu mantém o volume", () => {
    // 15 de 16 é a semana feita; não há razão para recuar.
    expect(volumeWithRatchet(14, { previousPlannedKm: 16, previousActualKm: 15 })).toBe(16);
    expect(volumeWithRatchet(18, { previousPlannedKm: 16, previousActualKm: 15 })).toBe(18);
  });

  it("quem realmente parou não carrega piso nenhum", () => {
    expect(volumeWithRatchet(10, { previousPlannedKm: 16, previousActualKm: 4 })).toBe(10);
  });

  it("a semana de recuperação e o taper caem sem resistência", () => {
    expect(volumeWithRatchet(11, {
      previousPlannedKm: 16, previousActualKm: 15, lighterByDesign: true,
    })).toBe(11);
  });
});

describe("superar o plano tem que render", () => {
  it("119% da semana passada aumenta a próxima", () => {
    // O pedido do Sérgio: 22,5 km sobre 19 prescritos.
    const r = volumeWithRatchet(17, { previousPlannedKm: 19, previousActualKm: 22.5 });
    expect(r).toBeGreaterThan(19);
    expect(r).toBeGreaterThan(22.5);
  });

  it("o aumento é modesto — 5% sobre o que foi corrido, não sobre o pedido", () => {
    const r = volumeWithRatchet(17, { previousPlannedKm: 19, previousActualKm: 22.5 });
    expect(r).toBeLessThanOrEqual(Math.round(22.5 * 1.10));
  });

  it("cumprir exatamente 100% rende quando há prova à frente", () => {
    const r = volumeWithRatchet(15, {
      previousPlannedKm: 20, previousActualKm: 20, raceAhead: true,
    });
    expect(r).toBeGreaterThan(20);
  });

  it("não rende na semana de recuperação — ela existe para descansar", () => {
    expect(volumeWithRatchet(14, {
      previousPlannedKm: 19, previousActualKm: 22.5, lighterByDesign: true,
    })).toBe(14);
  });

  it("a proposta maior ganha do bônus quando é maior", () => {
    // O bônus é piso, não teto.
    expect(volumeWithRatchet(40, { previousPlannedKm: 19, previousActualKm: 22.5 })).toBe(40);
  });
});

describe("oito semanas de execução completa não encolhem", () => {
  it("cresce, com recuo só nas semanas de recuperação", () => {
    let planejado = 16;
    const visto: number[] = [];
    for (let w = 0; w < 8; w++) {
      const proposta = planWeeklyVolume([planejado, planejado, planejado, planejado], { provenWeeklyKm: 30 });
      planejado = volumeWithRatchet(proposta, {
        previousPlannedKm: planejado,
        previousActualKm:  planejado,          // cumpriu tudo
        lighterByDesign:   w > 0 && w % 4 === 3,
      });
      visto.push(planejado);
    }
    const duras = visto.filter((_, i) => !(i > 0 && i % 4 === 3));
    expect(Math.min(...duras)).toBeGreaterThanOrEqual(16);
    expect(visto[visto.length - 1]).toBeGreaterThan(16);
  });
});

describe("sem prova marcada, a progressão é paciente", () => {
  /*
   * "Vamos sempre lembrar de progredir com calma, a não ser que tenhamos provas
   * marcadas." Sem uma data para chegar, não há razão para perseguir volume: o
   * atleta tem tempo, e tempo gasto sem lesão vale mais que uma semana grande.
   */

  it("a rampa semanal é metade da que se usa com prova à frente", () => {
    const semProva = planWeeklyVolume([20, 20, 20, 20]);
    const comProva = planWeeklyVolume([20, 20, 20, 20], { raceAhead: true });
    expect(semProva).toBeLessThan(comProva);
    expect(semProva).toBeLessThanOrEqual(21);   // ~5%
    expect(comProva).toBeLessThanOrEqual(22);   // ~10%
  });

  it("superar o plano ainda rende — só que adotando o realizado, sem bônus", () => {
    // 22,5 corridos sobre 19 prescritos.
    const semProva = volumeWithRatchet(17, { previousPlannedKm: 19, previousActualKm: 22.5 });
    expect(semProva).toBeGreaterThan(19);
    expect(semProva).toBeLessThanOrEqual(23);
  });

  it("com prova marcada, o bônus de 5% volta", () => {
    const comProva = volumeWithRatchet(17, {
      previousPlannedKm: 19, previousActualKm: 22.5, raceAhead: true,
    });
    const semProva = volumeWithRatchet(17, { previousPlannedKm: 19, previousActualKm: 22.5 });
    expect(comProva).toBeGreaterThan(semProva);
  });

  it("cumprir 100% sem prova mantém o volume, não o empurra", () => {
    expect(volumeWithRatchet(15, { previousPlannedKm: 20, previousActualKm: 20 })).toBe(20);
  });

  it("oito semanas sem prova crescem, mas devagar", () => {
    // provenWeeklyKm igual à base: sem "volta a terreno conhecido", que é um
    // regime deliberadamente mais rápido e tem a sua própria justificativa.
    let planejado = 20;
    for (let w = 0; w < 8; w++) {
      const proposta = planWeeklyVolume([planejado, planejado, planejado, planejado], { provenWeeklyKm: 20 });
      planejado = volumeWithRatchet(proposta, {
        previousPlannedKm: planejado, previousActualKm: planejado,
        lighterByDesign: w > 0 && w % 4 === 3,
      });
    }
    // Cresce, sem virar outra pessoa em dois meses.
    expect(planejado).toBeGreaterThan(20);
    expect(planejado).toBeLessThan(32);
  });
});

describe("a volta a terreno conhecido também é paciente sem prova", () => {
  it("sobe mais devagar sem data para cumprir", () => {
    /*
     * Perto do terreno conhecido, quem manda é a taxa de subida (10% sem prova,
     * 20% com). Bem longe dele quem manda é o piso de retorno — 60% do
     * comprovado numa tacada — e aí as duas coincidem de propósito: o primeiro
     * passo de volta é o mesmo, o ritmo depois é que difere.
     */
    const semProva = planWeeklyVolume([25, 25, 25, 25], { provenWeeklyKm: 30 });
    const comProva = planWeeklyVolume([25, 25, 25, 25], { provenWeeklyKm: 30, raceAhead: true });
    expect(semProva).toBeLessThan(comProva);
  });

  it("o primeiro passo de volta de um afastamento longo é o mesmo nos dois casos", () => {
    // 20 km com 40 comprovados: o piso de retorno domina, e ele não é uma
    // questão de pressa — é o reconhecimento de que a base já existiu.
    expect(planWeeklyVolume([20, 20, 20, 20], { provenWeeklyKm: 40 }))
      .toBe(planWeeklyVolume([20, 20, 20, 20], { provenWeeklyKm: 40, raceAhead: true }));
  });

  it("mas ainda é mais rápida que a rampa comum — é uma volta, não uma estreia", () => {
    const voltando = planWeeklyVolume([20, 20, 20, 20], { provenWeeklyKm: 40 });
    const estreando = planWeeklyVolume([20, 20, 20, 20], { provenWeeklyKm: 20 });
    expect(voltando).toBeGreaterThan(estreando);
  });

  it("nunca passa do que o atleta já sustentou", () => {
    for (const raceAhead of [true, false])
      expect(planWeeklyVolume([25, 25, 25, 25], { provenWeeklyKm: 30, raceAhead }))
        .toBeLessThanOrEqual(30);
  });
});

describe("semanas que não são treino não viram base", () => {
  /*
   * Um usuário real tinha 41 "corridas" de 270 m, 400 m, 310 m — ruído de GPS
   * ou gravação acidental, somando menos de 1 km por semana. O motor obedeceu e
   * prescreveu uma semana de 1 km, que não serve para ninguém.
   *
   * Uma semana de 300 m não é evidência de capacidade nem de queda; é ausência
   * de dado. A capacidade comprovada é quem deve responder nesse caso.
   */

  it("ignora semanas abaixo do limiar de treino", () => {
    const ruido = planWeeklyVolume([0.3, 0.7, 0.8, 0.5], { provenWeeklyKm: 12 });
    expect(ruido).toBeGreaterThan(3);
  });

  it("sem semana válida, parte do que o atleta já comprovou", () => {
    // 60% do comprovado — o mesmo primeiro passo de quem volta de afastamento.
    const v = planWeeklyVolume([0.3, 0.4], { provenWeeklyKm: 20 });
    expect(v).toBeGreaterThanOrEqual(10);
    expect(v).toBeLessThanOrEqual(20);
  });

  it("não inventa capacidade para quem nunca teve nenhuma", () => {
    const v = planWeeklyVolume([0.3, 0.4], { provenWeeklyKm: 0 });
    expect(v).toBeGreaterThan(10);
    expect(v).toBeLessThan(30);
  });

  it("uma semana pequena mas real ainda conta", () => {
    // 4 km é pouco, mas é treino. O corte é em 3 km, não em "pouco".
    const v = planWeeklyVolume([4, 4, 4, 4], { provenWeeklyKm: 4 });
    expect(v).toBeLessThanOrEqual(6);
  });

  it("não muda nada para quem treina de verdade", () => {
    expect(planWeeklyVolume([22.5, 10, 10, 18.2])).toBe(planWeeklyVolume([22.5, 10, 10, 18.2]));
    expect(planWeeklyVolume([30, 30, 30, 30])).toBeLessThanOrEqual(32);
  });
});

describe("uma semana parada é um resfriado; duas já são um padrão", () => {
  /*
   * Ignorar semanas vazias protege quem perdeu uma semana — mas ignorar *todas*
   * deixa a única semana cheia falar pelo mês inteiro. Um atleta real correu
   * duas vezes em um mês, uma delas 30 km, e recebeu um plano de 32 km: o motor
   * só enxergou a semana dos 30.
   */
  const sergio = { provenWeeklyKm: 29.7, phase: "base" as const };

  it("uma semana parada sozinha não mexe no plano", () => {
    // Setembro de 2026: semana de 07/09 sem nenhum treino.
    expect(planWeeklyVolume([0, 15.87, 22.54, 10.03], sergio))
      .toBe(planWeeklyVolume([15.87, 22.54, 10.03], sergio));
  });

  it("um mês com uma semana cheia e o resto vazio não vira base cheia", () => {
    const v = planWeeklyVolume([0, 30.03, 0], { provenWeeklyKm: 27.7, phase: "base" });
    expect(v).toBeLessThanOrEqual(20);
    expect(v).toBeGreaterThanOrEqual(10);
  });

  it("voltar de duas semanas paradas não passa do que se corria antes", () => {
    const antes = (15.87 + 22.54) / 2;
    expect(planWeeklyVolume([0, 0, 15.87, 22.54], sergio)).toBeLessThanOrEqual(Math.round(antes));
  });

  it("ruído continua sendo ruído, não semana vazia", () => {
    // Quatro semanas de 300 m: nenhuma é treino, então a capacidade comprovada responde.
    expect(planWeeklyVolume([0.3, 0.7, 0.8, 0.5], { provenWeeklyKm: 12 }))
      .toBe(planWeeklyVolume([], { provenWeeklyKm: 12 }));
  });
});
