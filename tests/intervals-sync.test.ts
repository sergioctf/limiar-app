import { describe, it, expect } from "vitest";
import { countChanged, type StoredReading } from "@/lib/intervals-sync";

/**
 * Cada sincronização regrava a janela inteira, então "salvou N" nunca é zero e
 * a tela recarregava a cada 5 minutos sem nada novo. Só o que mudou de verdade
 * deve fazer a tela redesenhar.
 */
const r = (date: string, f: Partial<StoredReading> = {}): StoredReading => ({
  date, sleep_seconds: null, sleep_score: null, hrv_ms: null, resting_hr: null, raw: null, ...f,
});

describe("o que mudou desde a última leitura", () => {
  it("nada mudou", () => {
    const same = [r("2026-09-14", { hrv_ms: 83, resting_hr: 50, raw: { steps: 13099 } })];
    expect(countChanged(same, same)).toBe(0);
  });

  it("o banco devolve numeric como string — não conta como mudança", () => {
    expect(countChanged([r("2026-09-14", { hrv_ms: 83 })], [r("2026-09-14", { hrv_ms: "83.0" as unknown as number })])).toBe(0);
  });

  it("o sono da noite chegou à tarde", () => {
    expect(countChanged(
      [r("2026-09-14", { hrv_ms: 83, sleep_seconds: 27000 })],
      [r("2026-09-14", { hrv_ms: 83 })],
    )).toBe(1);
  });

  it("passos subiram", () => {
    expect(countChanged(
      [r("2026-09-14", { raw: { steps: 14000 } })],
      [r("2026-09-14", { raw: { steps: 13099 } })],
    )).toBe(1);
  });

  it("dia novo conta", () => {
    expect(countChanged([r("2026-09-15", { hrv_ms: 80 })], [])).toBe(1);
  });
});
