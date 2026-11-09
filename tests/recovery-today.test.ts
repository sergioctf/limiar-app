import { describe, it, expect } from "vitest";
import { buildRecoveryToday, basisLabel } from "@/lib/recovery-today";
import { addDays, type LoadDay } from "@/lib/health-view";
import type { HealthCheckin, WeeklyPlanData, WeeklyPlanDay, WellnessData } from "@/types";

const HOJE = "2026-09-16";   // quarta-feira

const d = (day: WeeklyPlanDay["day"], type: WeeklyPlanDay["type"], label: string, km?: number): WeeklyPlanDay =>
  ({ day, dayPt: day, type, label, distance_km: km, description: "" });

const plano: WeeklyPlanData = {
  week_start: "2026-09-14", generated_at: "x",
  days: [
    d("Mon", "easy", "Rodagem leve", 6), d("Tue", "strength", "Musculação"),
    d("Wed", "intervals", "Tiro 5×800", 5), d("Thu", "strength", "Musculação"),
    d("Fri", "strength", "Musculação"), d("Sat", "long_run", "Longão", 10), d("Sun", "rest", "Descanso"),
  ],
};

const w = (date: string, f: Partial<WellnessData>): WellnessData => ({
  date, sleep_seconds: null, sleep_score: null, hrv_ms: null, hrv_status: null,
  resting_hr: null, stress_avg: null, body_battery: null, source: "intervals", ...f,
});

const noites = (n: number, f: Partial<WellnessData>) =>
  Array.from({ length: n }, (_, i) => w(addDays(HOJE, -(i + 1)), f));

const carga: Record<string, LoadDay> = { [HOJE]: { tss: 0, tsb: 2 } };

const base = { date: HOJE, load: carga, checkin: null, plan: plano, doneKm: 0, strengthDone: false };

describe("recuperação de hoje", () => {
  it("com relógio calibrado, a base é o relógio", () => {
    const noite = { hrv_ms: 50, resting_hr: 50, sleep_score: 80, sleep_seconds: 7.5 * 3600 };
    const rows = [...noites(10, noite), w(HOJE, { ...noite, hrv_ms: 52, resting_hr: 49, sleep_score: 84 })];
    const r = buildRecoveryToday({ ...base, rows });
    expect(r.basis).toBe("watch");
    expect(r.needsCheckin).toBe(false);
    expect(basisLabel(r)).toBe("Relógio + carga");
    expect(r.session?.label).toBe("Tiro 5×800");
  });

  it("diz quando o número foi montado sem parte dos sinais do relógio", () => {
    // Nota de sono sem a duração: não há como ler as últimas noites.
    const rows = [...noites(10, { hrv_ms: 50, resting_hr: 50, sleep_score: 80 }), w(HOJE, { hrv_ms: 52, resting_hr: 49, sleep_score: 84 })];
    const r = buildRecoveryToday({ ...base, rows });
    expect(basisLabel(r)).toBe("Relógio + carga · 3 de 4 sinais");
  });

  it("relógio chegando mas sem média ainda: calibrando, sem pedir check-in", () => {
    const rows = [w(addDays(HOJE, -1), { hrv_ms: 75 }), w(HOJE, { hrv_ms: 83 })];
    const r = buildRecoveryToday({ ...base, rows });
    expect(r.calibratingNights).toBe(6);
    expect(r.needsCheckin).toBe(false);
  });

  it("sem relógio e sem check-in: pede o check-in", () => {
    const r = buildRecoveryToday({ ...base, rows: [] });
    expect(r.basis).toBe("load");
    expect(r.needsCheckin).toBe(true);
    expect(basisLabel(r)).toBe("Só carga de treino");
  });

  it("com check-in, a base é o check-in e não pede de novo", () => {
    const checkin = { date: HOJE, sleep_hours: 6, sleep_quality: 2, soreness: 4, rpe: 8, energy: null, soreness_areas: null, notes: null } as HealthCheckin;
    const r = buildRecoveryToday({ ...base, rows: [], checkin });
    expect(r.basis).toBe("checkin");
    expect(r.needsCheckin).toBe(false);
  });

  it("recuperação baixa em dia de tiro oferece a troca", () => {
    const checkin = { date: HOJE, sleep_hours: 4, sleep_quality: 1, soreness: 5, rpe: 10, energy: null, soreness_areas: null, notes: null } as HealthCheckin;
    const r = buildRecoveryToday({ ...base, rows: [], checkin, load: { [HOJE]: { tss: 0, tsb: -35 } } });
    expect(r.verdict).toBe("baixa");
    expect(r.short).toBe("Recuperação baixa: hoje pede um treino mais leve");
    expect(r.offer?.options).toContain("easy");
  });

  it("tiro já feito: nada a trocar, e a frase diz que foi feito", () => {
    const r = buildRecoveryToday({ ...base, rows: [], doneKm: 5.2 });
    expect(r.sessionDone).toBe(true);
    expect(r.short).toBe("Sessão principal registrada");
    expect(r.offer).toBeNull();
  });

  it("amanhã do plano entra no conselho depois do treino", () => {
    const r = buildRecoveryToday({ ...base, rows: [], doneKm: 5 });
    expect(r.advice.detail).toContain("Amanhã: Musculação");
  });
});
