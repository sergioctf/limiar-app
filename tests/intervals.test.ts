import { describe, it, expect } from "vitest";
import {
  normalizeAthleteId, looksLikeApiKey, icuAuthHeader, toWellnessRow, isEmptyIcuRow,
  wellnessWindow, IcuError,
} from "@/lib/intervals";

describe("o que o atleta cola", () => {
  it("aceita o id como aparece em Settings", () => {
    expect(normalizeAthleteId("i123456")).toBe("i123456");
    expect(normalizeAthleteId("  I123456 ")).toBe("i123456");
  });

  it("aceita contas antigas só com dígitos", () => {
    expect(normalizeAthleteId("2049151")).toBe("2049151");
  });

  it("tira o id de dentro de uma URL copiada da barra de endereço", () => {
    expect(normalizeAthleteId("https://intervals.icu/athlete/i98765/calendar")).toBe("i98765");
  });

  it("campo vazio vira 0 — o dono da chave", () => {
    expect(normalizeAthleteId("")).toBe("0");
    expect(normalizeAthleteId(undefined)).toBe("0");
  });

  it("recusa o que não é id", () => {
    expect(normalizeAthleteId("sergio@gmail.com")).toBeNull();
    expect(normalizeAthleteId("abc")).toBeNull();
  });

  it("uma chave tem forma de chave", () => {
    expect(looksLikeApiKey("3k9x0f7a2b4c6d8e1g5h")).toBe(true);
  });

  it("pega o id colado no campo da chave", () => {
    expect(looksLikeApiKey("i123456")).toBe(false);
  });

  it("pega uma senha com espaço ou símbolo", () => {
    expect(looksLikeApiKey("minha senha 123 forte!")).toBe(false);
  });

  it("autentica com o usuário literal API_KEY", () => {
    const header = icuAuthHeader("abc123");
    expect(header.startsWith("Basic ")).toBe(true);
    expect(Buffer.from(header.slice(6), "base64").toString()).toBe("API_KEY:abc123");
  });

  it("401 e 403 pedem chave nova; 500 não", () => {
    expect(new IcuError(401, "x").unauthorized).toBe(true);
    expect(new IcuError(403, "x").unauthorized).toBe(true);
    expect(new IcuError(500, "x").unauthorized).toBe(false);
  });
});

describe("registro de bem-estar do intervals.icu → wellness_data", () => {
  const noite = {
    id: "2026-09-14",
    sleepSecs: 26_280,     // 7h18
    sleepScore: 82,
    hrv: 48.37,
    restingHR: 51,
    readiness: 74,
    avgSleepingHR: 55,
    steps: 0,
  };

  it("mapeia a noite", () => {
    const row = toWellnessRow(noite)!;
    expect(row.date).toBe("2026-09-14");
    expect(row.sleep_seconds).toBe(26_280);
    expect(row.sleep_score).toBe(82);
    expect(row.hrv_ms).toBe(48.4);
    expect(row.resting_hr).toBe(51);
  });

  it("zero é 'sem registro', não a pior noite possível", () => {
    const row = toWellnessRow({ id: "2026-09-14", sleepSecs: 0, sleepScore: 0, hrv: 0, restingHR: 0 })!;
    expect(row.sleep_seconds).toBeNull();
    expect(row.sleep_score).toBeNull();
    expect(row.hrv_ms).toBeNull();
    expect(row.resting_hr).toBeNull();
    expect(isEmptyIcuRow(row)).toBe(true);
  });

  it("valores impossíveis ficam de fora", () => {
    const row = toWellnessRow({ id: "2026-09-14", restingHR: 250, hrv: 900, sleepScore: 140 })!;
    expect(row.resting_hr).toBeNull();
    expect(row.hrv_ms).toBeNull();
    expect(row.sleep_score).toBeNull();
  });

  it("guarda readiness sem alimentar a prontidão ainda", () => {
    // Não se sabe de qual fornecedor é esse número; fica no raw até ser conferido.
    const row = toWellnessRow(noite)!;
    expect(row.raw).toEqual({ readiness: 74, avgSleepingHR: 55 });
    expect(Object.keys(row)).not.toContain("recovery_score");
  });

  it("um dia só de peso não conta como noite", () => {
    const row = toWellnessRow({ id: "2026-09-14", weight: 72.4 })!;
    expect(isEmptyIcuRow(row)).toBe(true);
  });

  it("descarta registro sem data válida", () => {
    expect(toWellnessRow({ id: "ontem" })).toBeNull();
  });
});

describe("janela de datas", () => {
  it("7 dias terminando hoje, inclusive", () => {
    expect(wellnessWindow("2026-09-14", 7)).toEqual({ oldest: "2026-09-08", newest: "2026-09-14" });
  });

  it("atravessa o mês", () => {
    expect(wellnessWindow("2026-09-03", 30)).toEqual({ oldest: "2026-08-05", newest: "2026-09-03" });
  });
});
