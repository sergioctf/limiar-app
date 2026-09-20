/**
 * A contagem do teste de 3 km.
 *
 * O teste calibra ritmos, zonas, previsões e o conselheiro. O app sabia dizer
 * há quanto tempo ele foi feito; não sabia dizer quando refazer.
 */
import { describe, expect, it } from "vitest";
import { daysUntilTestDue, TEST_AGING_WEEKS } from "@/lib/test-status";

const now = new Date(2026, 8, 20, 12, 0); // 20/09/2026

describe("quando refazer o teste", () => {
  it("conta os dias que faltam a partir da validade de 8 semanas", () => {
    // Teste de 04/08 vence em 29/09 — faltam 9 dias.
    expect(daysUntilTestDue("2026-08-04", now)).toBe(9);
  });

  it("um teste de hoje vale o período inteiro", () => {
    expect(daysUntilTestDue("2026-09-20", now)).toBe(TEST_AGING_WEEKS * 7);
  });

  it("vencido conta para trás", () => {
    expect(daysUntilTestDue("2026-07-01", now)).toBeLessThan(0);
    expect(daysUntilTestDue("2026-07-26", now)).toBe(0);   // vence hoje
  });

  it("não se perde no horário de verão nem na hora do dia", () => {
    // A mesma data lida às 6h e às 23h tem que dar o mesmo número de dias.
    const manha = daysUntilTestDue("2026-08-04", new Date(2026, 8, 20, 6, 0));
    const noite = daysUntilTestDue("2026-08-04", new Date(2026, 8, 20, 23, 0));
    expect(manha).toBe(noite);
  });
});
