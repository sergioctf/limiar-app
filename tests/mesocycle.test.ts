import { describe, it, expect } from "vitest";
import {
  cyclePosition, qualityForWeek, repBonusForCycle, mondayOf, cutbackWeekIndex, CYCLE_WEEKS,
} from "@/lib/mesocycle";
import { planWeeklyVolume } from "@/lib/workout-builder";

/**
 * O plano do Sérgio ficou seis semanas idêntico — 6 km leve, 3×400 m, 9,5 km de
 * longão, 19,0 km — porque nada dava posição à semana. A periodização existia e
 * nunca era chamada; a fase nunca saía de "base" por falta de prova com data.
 */

describe("posição no ciclo", () => {
  const A = "2026-08-03";   // segunda-feira âncora

  it("a semana da âncora abre o ciclo 1", () => {
    const p = cyclePosition(A, A);
    expect(p).toEqual({ cycle: 1, week: 1, isRecovery: false, weekIndex: 0 });
  });

  it("caminha semana a semana", () => {
    expect(cyclePosition("2026-08-10", A).week).toBe(2);
    expect(cyclePosition("2026-08-17", A).week).toBe(3);
    expect(cyclePosition("2026-08-24", A).week).toBe(4);
  });

  it("a quarta semana é a de recuperação", () => {
    expect(cyclePosition("2026-08-24", A).isRecovery).toBe(true);
    for (const d of ["2026-08-03", "2026-08-10", "2026-08-17"])
      expect(cyclePosition(d, A).isRecovery).toBe(false);
  });

  it("vira o ciclo depois de quatro semanas", () => {
    const p = cyclePosition("2026-08-31", A);
    expect(p.cycle).toBe(2);
    expect(p.week).toBe(1);
  });

  it("o weekIndex é o que planWeeklyVolume espera", () => {
    // A regra de corte lá é `weekIndex % 4 === 3`.
    expect(cyclePosition("2026-08-24", A).weekIndex % CYCLE_WEEKS).toBe(3);
    expect(cyclePosition("2026-08-10", A).weekIndex % CYCLE_WEEKS).not.toBe(3);
  });

  it("aceita uma data no meio da semana como âncora", () => {
    // O primeiro treino de alguém raramente cai numa segunda.
    expect(cyclePosition("2026-08-10", "2026-08-06").week).toBe(2);
  });

  it("sem âncora, o atleta está começando", () => {
    const p = cyclePosition("2026-09-07", null);
    expect(p.cycle).toBe(1);
    expect(p.week).toBe(1);
  });

  it("uma âncora no futuro não produz ciclo negativo", () => {
    const p = cyclePosition("2026-08-03", "2026-12-01");
    expect(p.cycle).toBe(1);
    expect(p.weekIndex).toBe(0);
  });

  it("é estável — a mesma semana devolve sempre o mesmo lugar", () => {
    expect(cyclePosition("2026-09-14", A)).toEqual(cyclePosition("2026-09-14", A));
  });

  it("um ano de semanas nunca sai de 1..4", () => {
    for (let i = 0; i < 52; i++) {
      const d = new Date(`${A}T12:00:00`); d.setDate(d.getDate() + i * 7);
      const p = cyclePosition(d.toISOString().slice(0, 10), A);
      expect(p.week).toBeGreaterThanOrEqual(1);
      expect(p.week).toBeLessThanOrEqual(4);
    }
  });

  it("uma recuperação a cada quatro semanas, nem mais nem menos", () => {
    let recs = 0;
    for (let i = 0; i < 52; i++) {
      const d = new Date(`${A}T12:00:00`); d.setDate(d.getDate() + i * 7);
      if (cyclePosition(d.toISOString().slice(0, 10), A).isRecovery) recs++;
    }
    expect(recs).toBe(13);
  });
});

describe("o corte de volume cai só na semana de recuperação conquistada", () => {
  /*
   * O motor passava `weekIndex + 1` quando a recuperação não era conquistada,
   * para fugir da regra `% 4 === 3`. Isso fugia do corte na semana 4 e o jogava
   * na semana 3: toda terceira semana do bloco saía 30% menor. O ratchet
   * escondia quase sempre — mas bastava a semana anterior ficar abaixo de 90%
   * (a volta de uma semana parada, por exemplo) para o corte aparecer inteiro.
   */
  const A = "2026-01-26";
  const historico = [20, 20, 20, 20];
  const semCorte = planWeeklyVolume(historico, {});

  it("nenhuma semana é cortada quando a recuperação não foi conquistada", () => {
    for (let i = 0; i < 12; i++) {
      const d = new Date(`${A}T12:00:00`); d.setDate(d.getDate() + i * 7);
      const pos = cyclePosition(d.toISOString().slice(0, 10), A);
      expect(planWeeklyVolume(historico, { weekIndex: cutbackWeekIndex(pos, false) }), `semana ${pos.week}`)
        .toBe(semCorte);
    }
  });

  it("com recuperação conquistada, só a semana 4 é cortada", () => {
    for (let i = 0; i < 12; i++) {
      const d = new Date(`${A}T12:00:00`); d.setDate(d.getDate() + i * 7);
      const pos = cyclePosition(d.toISOString().slice(0, 10), A);
      const km = planWeeklyVolume(historico, { weekIndex: cutbackWeekIndex(pos, true) });
      if (pos.week === 4) expect(km, `semana ${pos.week}`).toBeLessThan(semCorte);
      else expect(km, `semana ${pos.week}`).toBe(semCorte);
    }
  });

  it("o caso real: 21/09 é semana 3 e não pode sair com 30% a menos", () => {
    // Sérgio: 15,9 e 22,5 km nas semanas que contam, semana de 07/09 parada.
    const pos = cyclePosition("2026-09-21", A);
    expect(pos.week).toBe(3);
    const vols = [0, 15.87, 22.54];
    const opts = { provenWeeklyKm: 29.7, phase: "base" as const };
    expect(planWeeklyVolume(vols, { ...opts, weekIndex: cutbackWeekIndex(pos, true) }))
      .toBe(planWeeklyVolume(vols, opts));
  });
});

describe("mondayOf", () => {
  it("puxa qualquer dia para a segunda da sua semana", () => {
    expect(mondayOf("2026-08-06")).toBe("2026-08-03");   // quinta
    expect(mondayOf("2026-08-09")).toBe("2026-08-03");   // domingo
    expect(mondayOf("2026-08-03")).toBe("2026-08-03");   // já é segunda
  });
});

describe("o estímulo muda de semana para semana", () => {
  it("não repete a mesma sessão duas semanas seguidas", () => {
    // Era exatamente o sintoma: "Tiro 3×400 m" seis vezes.
    const seq = [1, 2, 3, 4].map(w => qualityForWeek(w, 1));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });

  it("a semana de recuperação é sempre a leve", () => {
    for (const c of [1, 2, 3, 7, 12]) expect(qualityForWeek(4, c)).toBe("strides");
  });

  it("blocos diferentes trazem sessões diferentes", () => {
    // Sem isto o atleta troca um loop de 1 semana por um loop de 4.
    const b1 = [1, 2, 3].map(w => qualityForWeek(w, 1));
    const b2 = [1, 2, 3].map(w => qualityForWeek(w, 2));
    expect(b1).not.toEqual(b2);
  });

  it("a semana dura nunca cai em 'strides'", () => {
    for (let c = 1; c <= 12; c++)
      for (const w of [1, 2, 3]) expect(qualityForWeek(w, c)).not.toBe("strides");
  });

  it("o cardápio inclui trabalho que não é só tiro mais longo", () => {
    // O pedido do Sérgio: 10×200 m também treina, e a resposta nem sempre é
    // aumentar a extensão.
    const tudo = new Set<string>();
    for (let c = 1; c <= 8; c++)
      for (const w of [1, 2, 3]) tudo.add(qualityForWeek(w, c));
    expect(tudo.has("repetitions")).toBe(true);
    expect(tudo.has("hills")).toBe(true);
    expect(tudo.has("fartlek")).toBe(true);
    expect(tudo.has("progression")).toBe(true);
  });

  it("percorre o cardápio inteiro antes de repetir", () => {
    const seq: string[] = [];
    for (let c = 1; c <= 3; c++) for (const w of [1, 2, 3]) seq.push(qualityForWeek(w, c));
    // Sete tipos duros em nove semanas duras: nada de voltar cedo demais.
    expect(new Set(seq).size).toBe(7);
  });

  it("é determinístico", () => {
    expect(qualityForWeek(2, 5)).toBe(qualityForWeek(2, 5));
  });
});

describe("progressão entre ciclos", () => {
  it("o primeiro bloco não ganha bônus", () => {
    expect(repBonusForCycle(1)).toBe(0);
  });

  it("cada bloco concluído vale uma repetição", () => {
    expect(repBonusForCycle(2)).toBe(1);
    expect(repBonusForCycle(3)).toBe(2);
  });

  it("mas para de crescer — o volume é outro botão", () => {
    expect(repBonusForCycle(10)).toBe(2);
    expect(repBonusForCycle(52)).toBe(2);
  });
});
