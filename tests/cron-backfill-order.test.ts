import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * O backfill de recordes ficou cinco dias sem rodar uma única vez.
 *
 * Ele tinha sido posto no cron do Strava depois de dois `continue` que disparam
 * quando o atleta não tem atividade nova para importar — e como o webhook
 * entrega as corridas ao vivo, a rede de segurança quase nunca acha nada. O
 * resultado: três atletas parados em 0 de 61, 0 de 62 e 3 de 91 corridas lidas,
 * com o código funcionando perfeitamente e nunca sendo alcançado.
 *
 * Ordem de statements não é coisa que teste de unidade pegue, então este teste
 * lê o arquivo. É feio, e é o que teria evitado cinco dias de silêncio.
 */
describe("o backfill roda independente de haver importação", () => {
  const src = readFileSync("src/app/api/cron/strava-sync/route.ts", "utf8");

  it("aparece antes de qualquer saída antecipada do laço", () => {
    const backfill = src.indexOf("backfillEfforts(");
    const exits = Array.from(src.matchAll(/^\s+if \([^)]*\) continue;/gm))
      .map(m => m.index ?? 0)
      // O `continue` por falta de refresh_token é legítimo: sem token não há
      // nada a fazer para esse atleta, backfill inclusive.
      .filter(i => !src.slice(i, i + 80).includes("refresh_token"));

    expect(backfill).toBeGreaterThan(0);
    expect(exits.length).toBeGreaterThan(0);
    for (const e of exits) expect(backfill).toBeLessThan(e);
  });

  it("continua protegido por try/catch — não pode derrubar o sync", () => {
    const i = src.indexOf("backfillEfforts(");
    const antes = src.slice(Math.max(0, i - 400), i);
    expect(antes).toMatch(/try\s*\{/);
  });
});
