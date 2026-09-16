import { describe, it, expect } from "vitest";
import { compactWellnessRow, groupByColumns, carriesNothing, upsertWellness } from "@/lib/wellness-upsert";

/**
 * Duas fontes escrevem a mesma linha do dia: o intervals.icu traz a noite de
 * manhã, o Atalho do iPhone traz as calorias à noite. Um upsert da linha inteira
 * zerava o que a outra fonte tinha escrito — as calorias das 22h apagavam a HRV
 * das 8h.
 */

describe("só vai o que foi medido", () => {
  it("tira os nulos, mantém a identidade da linha", () => {
    const row = { user_id: "u", date: "2026-09-14", source: "ios_shortcut",
      hrv_ms: null, resting_hr: undefined, active_kcal: 640, resting_kcal: 1710 };
    expect(compactWellnessRow(row)).toEqual({
      user_id: "u", date: "2026-09-14", source: "ios_shortcut", active_kcal: 640, resting_kcal: 1710,
    });
  });

  it("zero é medida, não ausência", () => {
    expect(compactWellnessRow({ user_id: "u", date: "d", source: "s", active_kcal: 0 }))
      .toHaveProperty("active_kcal", 0);
  });

  it("uma linha só com identidade não carrega nada", () => {
    expect(carriesNothing({ user_id: "u", date: "d", source: "s" })).toBe(true);
    expect(carriesNothing({ user_id: "u", date: "d", source: "s", hrv_ms: 40 })).toBe(false);
  });

  it("agrupa por colunas iguais — um lote misto preencheria as lacunas com null", () => {
    const a = { user_id: "u", date: "1", hrv_ms: 40 };
    const b = { user_id: "u", date: "2", hrv_ms: 42 };
    const c = { user_id: "u", date: "3", active_kcal: 500 };
    const groups = groupByColumns([a, b, c]);
    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual([a, b]);
    expect(groups).toContainEqual([c]);
  });

  it("a ordem das chaves não separa grupos", () => {
    expect(groupByColumns([{ a: 1, b: 2 }, { b: 3, a: 4 }])).toHaveLength(1);
  });
});

describe("upsertWellness", () => {
  function fakeDb(fail = false) {
    const calls: Array<Array<Record<string, unknown>>> = [];
    return {
      calls,
      from: () => ({
        upsert: async (rows: Array<Record<string, unknown>>) => {
          calls.push(rows);
          return { error: fail ? { message: "boom" } : null };
        },
      }),
    };
  }

  it("nunca envia null para o banco", async () => {
    const db = fakeDb();
    await upsertWellness(db, [
      { user_id: "u", date: "2026-09-14", source: "ios_shortcut", hrv_ms: null, sleep_seconds: null, active_kcal: 640 },
    ]);
    for (const batch of db.calls) for (const row of batch)
      expect(Object.values(row)).not.toContain(null);
  });

  it("não escreve linha vazia", async () => {
    const db = fakeDb();
    const r = await upsertWellness(db, [{ user_id: "u", date: "d", source: "s", hrv_ms: null }]);
    expect(db.calls).toHaveLength(0);
    expect(r.saved).toBe(0);
  });

  it("conta o que salvou e devolve o erro sem lançar", async () => {
    expect(await upsertWellness(fakeDb(), [
      { user_id: "u", date: "1", source: "intervals", hrv_ms: 40 },
      { user_id: "u", date: "2", source: "intervals", hrv_ms: 41 },
    ])).toEqual({ saved: 2, error: null });

    const r = await upsertWellness(fakeDb(true), [{ user_id: "u", date: "1", source: "s", hrv_ms: 40 }]);
    expect(r.error).toBe("boom");
  });
});
