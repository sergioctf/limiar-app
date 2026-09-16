import { describe, it, expect } from "vitest";
import { regenerationTarget } from "@/lib/mesocycle";

/**
 * "Não era para ter mudado uma semana no meio dela, isso não é aceitável."
 *
 * O piso de volume impedia a semana de encolher, mas as *sessões* ainda podiam
 * ser reescritas — trocar "Tiro 3×400" por "6 tiros curtos" na quarta-feira,
 * com o atleta já tendo organizado a semana, é o mesmo erro com outro número.
 *
 * Uma semana que já começou é intocável. Correções vão para a próxima.
 */

describe("o que uma regeração pode reescrever", () => {
  const hoje = "2026-09-02";   // uma quarta-feira

  it("recusa a semana em andamento", () => {
    expect(regenerationTarget("2026-08-31", hoje, false).allowed).toBe(false);
  });

  it("diz por quê, em vez de falhar em silêncio", () => {
    expect(regenerationTarget("2026-08-31", hoje, false).reason).toMatch(/andamento/i);
  });

  it("aponta a próxima semana como alvo", () => {
    expect(regenerationTarget("2026-08-31", hoje, false).suggestWeek).toBe("2026-09-07");
  });

  it("libera a semana que ainda não começou", () => {
    expect(regenerationTarget("2026-09-07", hoje, false).allowed).toBe(true);
  });

  it("libera uma semana em andamento que ainda não tem plano", () => {
    // Gerar o que não existe não reescreve nada de ninguém.
    expect(regenerationTarget("2026-08-31", hoje, true).allowed).toBe(true);
  });

  it("na segunda-feira a semana já é intocável", () => {
    // O plano da segunda vale a partir do momento em que é publicado.
    expect(regenerationTarget("2026-08-31", "2026-08-31", false).allowed).toBe(false);
  });

  it("semanas passadas também ficam como estão", () => {
    expect(regenerationTarget("2026-08-24", hoje, false).allowed).toBe(false);
  });
});
