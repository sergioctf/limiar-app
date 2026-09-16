import { describe, it, expect } from "vitest";
import { buildWeekPlan, planWeeklyVolume, volumeWithRatchet } from "@/lib/workout-builder";
import { cyclePosition } from "@/lib/mesocycle";
import { weekContext, PREFS_3_DAYS } from "./fixtures";

/**
 * O sintoma que abriu tudo isto: seis semanas seguidas com o plano idêntico —
 * "Rodagem leve 6 km · Tiro 3×400 m · Longão 9,5 km · 19,0 km" — de 03/08 a
 * 07/09 de 2026. Só os dias embaralhavam.
 *
 * Três causas, e cada uma tem um teste aqui: o piso do ratchet ancorado no
 * planejado, o weekIndex que nunca era passado, e a sessão de qualidade sendo
 * função pura do volume.
 */

const ANCORA = "2026-08-03";
const semanas = (n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${ANCORA}T12:00:00`);
  d.setDate(d.getDate() + i * 7);
  return d.toISOString().slice(0, 10);
});

/** O rótulo da sessão de qualidade da semana. */
function qualidade(weekStart: string, weeklyKm: number) {
  const c = cyclePosition(weekStart, ANCORA);
  const plan = buildWeekPlan(
    weekContext({ weeklyKm, cycleWeek: c.week, cycleNumber: c.cycle }),
    ["corrida"], PREFS_3_DAYS,
  );
  return plan.find(d => d.type === "intervals" || d.type === "tempo")?.label ?? null;
}

describe("a sessão de qualidade deixa de se repetir", () => {
  it("seis semanas não produzem seis rótulos iguais", () => {
    const vistos = semanas(6).map(w => qualidade(w, 19));
    expect(new Set(vistos).size).toBeGreaterThan(1);
  });

  it("nunca repete a mesma sessão duas semanas seguidas dentro do bloco", () => {
    const vistos = semanas(4).map(w => qualidade(w, 19));
    for (let i = 1; i < vistos.length; i++) expect(vistos[i]).not.toBe(vistos[i - 1]);
  });

  it("o bloco denso aparece na rotação", () => {
    // Não numa semana fixa: a rotação anda entre blocos de propósito, para o
    // atleta não trocar um loop de 1 semana por um loop de 4.
    const doze = semanas(12).map(w => qualidade(w, 19) ?? "");
    expect(doze.some(l => /denso/i.test(l))).toBe(true);
  });

  it("a variedade não é só tiro mais comprido", () => {
    // O pedido: 10×200 m também treina; subida e fartlek também.
    const doze = semanas(12).map(w => qualidade(w, 24) ?? "");
    expect(doze.some(l => /Tiros curtos/i.test(l))).toBe(true);
    expect(doze.some(l => /Subidas/i.test(l))).toBe(true);
    expect(doze.some(l => /Fartlek/i.test(l))).toBe(true);
    expect(doze.some(l => /Progressivo/i.test(l))).toBe(true);
  });

  it("a semana de recuperação não traz tiro pesado", () => {
    const l = qualidade(semanas(4)[3], 19) ?? "";
    expect(l).not.toMatch(/^Tiro \d+×/);
  });

  it("volume idêntico ainda produz semanas diferentes", () => {
    // O ponto central: sem isto, 19 km sempre dava 3×400 m.
    const a = qualidade(semanas(2)[0], 19);
    const b = qualidade(semanas(2)[1], 19);
    expect(a).not.toBe(b);
  });
});

describe("o volume volta a se mover", () => {
  /** Roda n semanas com uma dada taxa de cumprimento. */
  function simular(n: number, cumprimento: number, inicial = 19) {
    let planejado = inicial;
    let historico = [inicial, inicial, inicial, inicial];
    const out: number[] = [];
    for (const w of semanas(n)) {
      const c = cyclePosition(w, ANCORA);
      const realizado = planejado * cumprimento;
      const proposta = planWeeklyVolume(historico, { weekIndex: c.weekIndex });
      planejado = volumeWithRatchet(proposta, {
        previousPlannedKm: planejado,
        previousActualKm:  realizado,
        lighterByDesign:   c.isRecovery,
      });
      historico = [realizado, ...historico].slice(0, 4);
      out.push(planejado);
    }
    return out;
  }

  it("não congela mais quando o atleta cumpre metade", () => {
    const v = simular(6, 0.53);
    expect(new Set(v).size).toBeGreaterThan(1);
  });

  it("cumprir tudo faz o volume subir — em escala de bloco, não de semana", () => {
    // Sem prova marcada a rampa é de 5%, então três semanas somem no
    // arredondamento. Isso é a política, não uma falha: progredir com calma.
    const v = simular(12, 1.0);
    const duras = v.filter((_, i) => (i % 4) !== 3);
    expect(duras[duras.length - 1]).toBeGreaterThan(duras[0]);
  });

  it("e nunca encolhe para quem cumpre tudo", () => {
    /*
     * A regressão que quase passou: a semana de recuperação entrava na média de
     * quatro semanas e derrubava a base 7,5%, mais do que a rampa de 5%
     * devolvia. O plano encolhia de 20 para 17 km em seis meses com o atleta
     * cumprindo cada semana.
     */
    const v = simular(26, 1.0);
    const duras = v.filter((_, i) => (i % 4) !== 3);
    expect(duras[duras.length - 1]).toBeGreaterThanOrEqual(duras[0]);
  });

  it("superar o plano rende mais que apenas cumpri-lo", () => {
    const cumpriu   = simular(2, 1.0);
    const superou   = simular(2, 1.19);
    expect(superou[1]).toBeGreaterThan(cumpriu[1]);
  });

  it("a quarta semana recua", () => {
    const v = simular(4, 1.0);
    expect(v[3]).toBeLessThan(v[2]);
  });

  it("e o bloco seguinte retoma acima de onde o anterior começou", () => {
    const v = simular(5, 1.0);
    expect(v[4]).toBeGreaterThan(v[0]);
  });
});
