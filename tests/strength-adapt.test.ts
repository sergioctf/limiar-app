/**
 * Encolher a musculação sem descaracterizá-la.
 *
 * O que estes testes protegem: meia hora de agachamento e terra é um treino;
 * meia hora de rosca e abdominal é uma visita à academia. O composto principal
 * não sai, aconteça o que acontecer com o relógio.
 */
import { describe, expect, it } from "vitest";
import { fitToMinutes, lighten, sessionMinutes, shorterOptions } from "@/lib/strength-adapt";
import type { StrengthSession } from "@/lib/strength-builder";

const ex = (name: string, sets: number, main = false) => ({
  exerciseId: name, name, sets, reps: [8, 10] as [number, number],
  rir: 2, restSeconds: 90, main, unilateral: false, cue: "", timeBased: false,
});

const session = (over: Partial<StrengthSession> = {}): StrengthSession => ({
  exercises: [
    ex("agachamento", 4, true),
    ex("terra", 3),
    ex("bulgaro", 3),
    ex("panturrilha", 3),
    ex("abdominal", 3),
  ],
  muscles: ["quadriceps"],
  cardio: null,
  estimatedMinutes: 0,
  notes: [],
  deloaded: false,
  ...over,
} as StrengthSession);

describe("quanto custa a sessão", () => {
  it("conta trabalho mais descanso, como o gerador", () => {
    // 16 séries × (40 s + 90 s) / 60 = 34,67 → 35 min
    expect(sessionMinutes(session())).toBe(35);
  });

  it("o cardio junto entra na conta", () => {
    const s = session({ cardio: { machine: "esteira", minutes: 15, position: "depois" } } as Partial<StrengthSession>);
    expect(sessionMinutes(s)).toBe(50);
  });
});

describe("menos tempo", () => {
  it("cabe no tempo pedido", () => {
    const s = fitToMinutes(session(), 20);
    expect(sessionMinutes(s)).toBeLessThanOrEqual(22);
  });

  it("não tira o composto principal", () => {
    const s = fitToMinutes(session(), 15);
    expect(s.exercises.some(e => e.main)).toBe(true);
    expect(s.exercises[0].exerciseId).toBe("agachamento");
  });

  it("deixa pelo menos três exercícios", () => {
    const s = fitToMinutes(session(), 10);
    expect(s.exercises.length).toBeGreaterThanOrEqual(3);
  });

  it("tira acessório antes de cortar série", () => {
    const s = fitToMinutes(session(), 28);
    expect(s.exercises.length).toBeLessThan(5);
    expect(s.exercises.find(e => e.main)?.sets).toBe(4);
  });

  it("atualiza a duração que a tela mostra", () => {
    const s = fitToMinutes(session(), 25);
    expect(s.estimatedMinutes).toBe(sessionMinutes(s));
    expect(s.estimatedMinutes).toBeLessThan(35);
  });

  it("não cresce quando o tempo pedido é maior", () => {
    const s = fitToMinutes(session(), 60);
    expect(s.exercises).toHaveLength(5);
    expect(s.estimatedMinutes).toBe(35);
  });

  it("só oferece tamanhos menores que o de hoje", () => {
    expect(shorterOptions(session())).toEqual([30, 20]);
  });
});

describe("mais leve", () => {
  it("tira uma série e afasta uma repetição da falha", () => {
    const s = lighten(session());
    expect(s.exercises[0].sets).toBe(3);
    expect(s.exercises[0].rir).toBe(3);
  });

  it("nunca desce de duas séries nem passa de RIR 4", () => {
    const s = lighten(lighten(lighten(session())));
    expect(Math.min(...s.exercises.map(e => e.sets))).toBe(2);
    expect(Math.max(...s.exercises.map(e => e.rir))).toBe(4);
  });

  it("mantém todos os exercícios — é a mesma sessão, com menos custo", () => {
    expect(lighten(session()).exercises).toHaveLength(5);
  });

  it("fica marcada como semana/sessão reduzida", () => {
    expect(lighten(session()).deloaded).toBe(true);
  });
});
