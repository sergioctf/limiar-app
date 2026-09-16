import { describe, it, expect } from "vitest";
import { morningNotification } from "@/lib/morning-message";
import type { RecoveryToday } from "@/lib/recovery-today";
import type { WeeklyPlanDay } from "@/types";

const tiro: WeeklyPlanDay = { day: "Wed", dayPt: "Quarta", type: "intervals", label: "Tiro 5×800", distance_km: 5, description: "Aquecimento 2 km, 5×800 m" };

function rec(f: Partial<RecoveryToday> = {}): RecoveryToday {
  return {
    date: "2026-09-16",
    readiness: { score: 82, verdict: "alta", components: [], recommendation: "", source: "wearable" },
    score: 82, verdict: "alta", basis: "watch", calibratingNights: null, needsCheckin: false,
    session: tiro, sessionDone: false,
    advice: { headline: "Pronto para treinar forte", detail: "Tiro 5×800 5 km hoje: faça como planejado." },
    short: "Pronto para o treino forte", offer: null,
    ...f,
  };
}

describe("notificação da manhã", () => {
  it("noite chegou: score no título e a decisão no corpo", () => {
    const n = morningNotification(rec(), { connected: true, nightArrived: true })!;
    expect(n.title).toBe("Recuperação 82 · Hoje: Tiro 5×800 · 5km");
    expect(n.body).toContain("faça como planejado");
    expect(n.url).toBe("/");
  });

  it("recuperação baixa com troca disponível: convida a trocar", () => {
    const n = morningNotification(
      rec({ score: 34, verdict: "baixa", offer: { options: ["easy", "tomorrow"], undo: false },
        advice: { headline: "x", detail: "Tiro 5×800 5 km hoje: troque por rodagem leve." } }),
      { connected: true, nightArrived: true },
    )!;
    expect(n.body).toContain("trocar o treino com um toque");
  });

  it("relógio conectado mas a noite não chegou: diz isso, não inventa score", () => {
    const n = morningNotification(rec(), { connected: true, nightArrived: false })!;
    expect(n.title).not.toContain("Recuperação");
    expect(n.body).toContain("ainda não chegou");
    expect(n.url).toBe("/health");
  });

  it("sem relógio: pede o check-in e abre direto nele", () => {
    const n = morningNotification(rec({ basis: "load", needsCheckin: true }), { connected: false, nightArrived: false })!;
    expect(n.body).toContain("Como você dormiu?");
    expect(n.url).toBe("/health?checkin=1");
  });

  it("sem plano para hoje: não manda nada", () => {
    expect(morningNotification(rec({ session: null }), { connected: true, nightArrived: true })).toBeNull();
  });

  it("uma por dia: a tag é do dia", () => {
    expect(morningNotification(rec(), { connected: true, nightArrived: true })!.tag).toBe("limiar-morning-2026-09-16");
  });

  it("corpo cabe na tela de bloqueio", () => {
    const long = "palavra ".repeat(60);
    const n = morningNotification(rec({ advice: { headline: "x", detail: long } }), { connected: true, nightArrived: true })!;
    expect(n.body.length).toBeLessThanOrEqual(150);
  });
});
