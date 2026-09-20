/**
 * Sequência em semanas.
 *
 * Em dias, o número media a coisa errada para quem corre três vezes por
 * semana: piscava entre 1 e 0 e punia justamente a rotina que o plano pede.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeWeekStreak } from "@/lib/training-load";
import type { Run } from "@/types";

const run = (date: string) => ({ date, distance_km: 6, duration_seconds: 2100 } as Run);

/** Congela "hoje" numa quarta-feira: 16/09/2026. */
function on(dateStr: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${dateStr}T10:00:00`));
}

afterEach(() => vi.useRealTimers());

describe("sequência de semanas", () => {
  it("conta semanas seguidas com pelo menos uma corrida", () => {
    on("2026-09-16"); // quarta
    const runs = [
      run("2026-09-14"), // semana de 14/09
      run("2026-09-09"), // semana de 07/09
      run("2026-09-02"), // semana de 31/08
    ];
    expect(computeWeekStreak(runs)).toBe(3);
  });

  it("uma corrida só na semana já segura a semana inteira", () => {
    on("2026-09-16");
    expect(computeWeekStreak([run("2026-09-14")])).toBe(1);
  });

  it("não zera na segunda de manhã, antes do primeiro treino", () => {
    // Segunda, 21/09, nada corrido ainda: a sequência da semana anterior vale.
    on("2026-09-21");
    expect(computeWeekStreak([run("2026-09-16"), run("2026-09-09")])).toBe(2);
  });

  it("uma semana em branco quebra a sequência", () => {
    on("2026-09-16");
    const runs = [run("2026-09-14"), /* semana de 07/09 vazia */ run("2026-09-02")];
    expect(computeWeekStreak(runs)).toBe(1);
  });

  it("sem corrida nenhuma, sequência é zero", () => {
    on("2026-09-16");
    expect(computeWeekStreak([])).toBe(0);
  });

  it("uma sequência que parou há um mês não conta como atual", () => {
    on("2026-09-16");
    expect(computeWeekStreak([run("2026-08-10"), run("2026-08-03")])).toBe(0);
  });
});
