import { describe, it, expect } from "vitest";
import { reconcileSuggestions, dedupeForDisplay, DISMISS_COOLDOWN_DAYS } from "@/lib/advisor-inbox";

/**
 * A caixa de sugestões do conselheiro acumulava a mesma coisa toda semana.
 *
 * A gravação deduplicava só dentro de `week_start`, então uma condição que
 * persiste — "seu split treina cada grupo 1×/semana" — ganhava uma linha nova a
 * cada semana, todas com status pending, todas exibidas. No banco real: 5 cópias
 * para o Sérgio e 5 para a Manoela do mesmo achado, de 28 linhas totais.
 *
 * Um achado aberto é um achado, não um por semana.
 */

const achado = (key: string, over: Record<string, unknown> = {}) => ({
  key, area: "forca", severity: "media", title: `t-${key}`,
  evidence: "e", proposal: "p", rationale: "r", actionLabel: null, patch: {}, ...over,
});

const linha = (key: string, over: Record<string, unknown> = {}) => ({
  id: `id-${key}`, finding_key: key, area: "forca", severity: "media",
  title: `t-${key}`, evidence: "e", proposal: "p", rationale: "r",
  action_label: null, patch: {}, status: "pending",
  week_start: "2026-08-03", created_at: "2026-08-03T00:00:00Z", ...over,
});

const AGORA = new Date("2026-09-05T12:00:00Z");

describe("um achado aberto vira uma linha, não uma por semana", () => {
  it("atualiza a linha pendente em vez de inserir outra", () => {
    const r = reconcileSuggestions([achado("split_1x")], [linha("split_1x")], "2026-08-31", AGORA);
    expect(r.toInsert).toHaveLength(0);
    expect(r.toUpdate).toHaveLength(1);
    expect(r.toUpdate[0].id).toBe("id-split_1x");
  });

  it("a linha atualizada passa a apontar para a semana corrente", () => {
    const r = reconcileSuggestions([achado("split_1x")], [linha("split_1x")], "2026-08-31", AGORA);
    expect(r.toUpdate[0].values.week_start).toBe("2026-08-31");
  });

  it("e traz as evidências novas — os números mudam toda semana", () => {
    // "15 sessões prescritas nas últimas 3 semanas" vira 18 na semana seguinte.
    const novo = achado("split_1x", { evidence: "18 sessões", severity: "alta" });
    const r = reconcileSuggestions([novo], [linha("split_1x")], "2026-08-31", AGORA);
    expect(r.toUpdate[0].values.evidence).toBe("18 sessões");
    expect(r.toUpdate[0].values.severity).toBe("alta");
  });

  it("um achado novo continua sendo inserido", () => {
    const r = reconcileSuggestions([achado("outro")], [linha("split_1x")], "2026-08-31", AGORA);
    expect(r.toInsert.map(x => x.finding_key)).toEqual(["outro"]);
    expect(r.toUpdate).toHaveLength(0);
  });

  it("cinco semanas seguidas do mesmo achado não criam cinco linhas", () => {
    let linhas = [linha("split_1x")];
    for (const w of ["2026-08-10","2026-08-17","2026-08-24","2026-08-31"]) {
      const r = reconcileSuggestions([achado("split_1x")], linhas, w, AGORA);
      expect(r.toInsert).toHaveLength(0);
      linhas = linhas.map(l => ({ ...l, week_start: w }));
    }
    expect(linhas).toHaveLength(1);
  });
});

describe("a dispensa continua valendo", () => {
  it("não ressuscita um achado dispensado dentro da carência", () => {
    const dispensado = linha("split_1x", {
      status: "dismissed", created_at: "2026-08-28T00:00:00Z",
    });
    const r = reconcileSuggestions([achado("split_1x")], [dispensado], "2026-08-31", AGORA);
    expect(r.toInsert).toHaveLength(0);
    expect(r.toUpdate).toHaveLength(0);
    expect(r.muted).toContain("split_1x");
  });

  it("depois da carência ele pode voltar", () => {
    const velho = new Date(AGORA);
    velho.setDate(velho.getDate() - DISMISS_COOLDOWN_DAYS - 1);
    const dispensado = linha("split_1x", { status: "dismissed", created_at: velho.toISOString() });
    const r = reconcileSuggestions([achado("split_1x")], [dispensado], "2026-08-31", AGORA);
    expect(r.toInsert).toHaveLength(1);
  });

  it("uma linha aceita não é reaproveitada — a situação mudou", () => {
    // Aceitar aplica um patch; se o achado reaparece, é um caso novo.
    const aceita = linha("split_1x", { status: "accepted" });
    const r = reconcileSuggestions([achado("split_1x")], [aceita], "2026-08-31", AGORA);
    expect(r.toInsert).toHaveLength(1);
    expect(r.toUpdate).toHaveLength(0);
  });
});

describe("a exibição nunca repete", () => {
  const vivas = new Set(["split_1x", "perna_longao"]);

  it("colapsa duplicatas já existentes no banco", () => {
    const rows = [
      linha("split_1x", { id: "a", created_at: "2026-08-03T00:00:00Z" }),
      linha("split_1x", { id: "b", created_at: "2026-08-31T00:00:00Z" }),
      linha("split_1x", { id: "c", created_at: "2026-08-17T00:00:00Z" }),
    ];
    const out = dedupeForDisplay(rows, vivas, "2026-08-31");
    expect(out).toHaveLength(1);
  });

  it("mantém a mais recente, que traz as evidências atuais", () => {
    const rows = [
      linha("split_1x", { id: "velha", created_at: "2026-08-03T00:00:00Z" }),
      linha("split_1x", { id: "nova",  created_at: "2026-08-31T00:00:00Z" }),
    ];
    expect(dedupeForDisplay(rows, vivas, "2026-08-31")[0].id).toBe("nova");
  });

  it("some com o achado que deixou de valer", () => {
    const rows = [linha("resolvido", { week_start: "2026-08-03" })];
    expect(dedupeForDisplay(rows, vivas, "2026-08-31")).toHaveLength(0);
  });

  it("mas mantém o desta semana mesmo que já não esteja na lista viva", () => {
    // Foi detectado nesta semana; sumir no mesmo dia confunde mais que informa.
    const rows = [linha("recente", { week_start: "2026-08-31" })];
    expect(dedupeForDisplay(rows, vivas, "2026-08-31")).toHaveLength(1);
  });

  it("preserva achados distintos", () => {
    const rows = [linha("split_1x"), linha("perna_longao")];
    expect(dedupeForDisplay(rows, vivas, "2026-08-31")).toHaveLength(2);
  });
});
