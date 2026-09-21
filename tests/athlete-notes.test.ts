/**
 * O que o atleta diz sobre UMA semana não vira regra para todas.
 *
 * Domingo, 20/09, no chat do plano da semana de 21/09: *"essa segunda não estou
 * com muito tempo para correr 9,5 km"*. O chat ajustou aquela semana — e o
 * extrator de memória gravou "[availability] segunda-feira tem pouco tempo,
 * reduzindo corrida para 6 km" como nota permanente do perfil. À meia-noite a
 * semana de 28/09 foi gerada, o recado leu a nota e disse "como a
 * segunda-feira tem tempo limitado, mantenha a corrida curta (6 km)". A
 * restrição de uma segunda-feira tinha virado a segunda-feira de sempre.
 */
import { describe, expect, it } from "vitest";
import { noteExpiry, stillValidFilter, weekStartsAt } from "@/lib/athlete-notes";

describe("até quando uma nota vale", () => {
  it("disponibilidade dita no chat de uma semana vale até o fim daquela semana", () => {
    // Semana de 21/09: termina no domingo 27/09; às 00:00 de segunda em Brasília (03:00 UTC) expira.
    expect(noteExpiry("availability", "2026-09-21")).toBe("2026-09-28T03:00:00.000Z");
  });

  it("preferência dita no chat de uma semana também é daquela semana", () => {
    // "Adicionar mais tiros na quarta" foi o jeito de fechar aquela semana, não um gosto novo.
    expect(noteExpiry("preference", "2026-09-21")).toBe("2026-09-28T03:00:00.000Z");
  });

  it("lesão não vence com a semana — um joelho não sara no domingo", () => {
    expect(noteExpiry("injury", "2026-09-21")).toBeNull();
  });

  it("objetivo e observação também não", () => {
    expect(noteExpiry("goal", "2026-09-21")).toBeNull();
    expect(noteExpiry("observation", "2026-09-21")).toBeNull();
  });

  it("sem semana conhecida, a nota não ganha prazo inventado", () => {
    expect(noteExpiry("availability", null)).toBeNull();
    expect(noteExpiry("availability", "não é data")).toBeNull();
  });
});

describe("quem monta a semana lê as notas daquela semana, não de agora", () => {
  it("o pedido de 'essa segunda' não chega na semana seguinte, mesmo gerada à meia-noite", () => {
    // O que aconteceu: a semana de 28/09 foi gerada às 00:02 de 21/09 — dentro
    // da semana em que a nota ainda valia. Quem decide é o começo da semana
    // montada, e a nota vence exatamente ali.
    const expires = noteExpiry("availability", "2026-09-21")!;
    const nextWeek = weekStartsAt("2026-09-28").toISOString();
    expect(expires <= nextWeek).toBe(true);          // não vale para 28/09
    expect(expires > weekStartsAt("2026-09-21").toISOString()).toBe(true);  // valeu para 21/09
  });

  it("o filtro usa o instante que recebe", () => {
    expect(stillValidFilter(weekStartsAt("2026-09-28")))
      .toBe("expires_at.is.null,expires_at.gt.2026-09-28T03:00:00.000Z");
  });
});
