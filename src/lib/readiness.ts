/**
 * Readiness — the "Limiar Score": a 0-100 read on whether the body is ready
 * to train hard today.
 *
 * Primary signals come from the wearable (Garmin via Health Connect/HealthKit):
 * body battery, sleep, HRV status, resting HR. Training-load freshness (TSB)
 * is always blended in. The manual check-in (soreness, RPE, and sleep when no
 * wearable data) is an optional augment — so the score works hands-off once a
 * watch is connected, and still works with manual input alone.
 */
import type { HealthCheckin, WellnessData } from "@/types";

export type ReadinessVerdict = "alta" | "moderada" | "baixa";

export interface ReadinessComponent {
  key: "body_battery" | "sleep" | "hrv" | "rhr" | "tsb" | "soreness" | "rpe";
  label: string;
  score: number;       // 0-100
  weight: number;
  auto: boolean;       // true = from the watch, false = manual
}

export interface Readiness {
  score: number;
  verdict: ReadinessVerdict;
  components: ReadinessComponent[];
  recommendation: string;
  source: "wearable" | "manual" | "mixed" | "none";
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function tsbScore(tsb: number): number {
  if (tsb >= 10) return 100;
  if (tsb <= -30) return 15;
  return clamp(15 + ((tsb + 30) / 40) * 85);
}

function sleepFromSeconds(sec: number): number {
  const h = sec / 3600;
  if (h >= 7.5 && h <= 9) return 100;
  if (h >= 6.5) return 80;
  if (h >= 5.5) return 55;
  if (h >= 4.5) return 35;
  return h > 9.5 ? 85 : 20;
}

function manualSleepScore(hours: number | null, quality: number | null): number | null {
  if (hours == null && quality == null) return null;
  const hScore = hours != null ? sleepFromSeconds(hours * 3600) : null;
  const qScore = quality != null ? ((quality - 1) / 4) * 100 : null;
  if (hScore != null && qScore != null) return clamp(hScore * 0.6 + qScore * 0.4);
  return clamp((hScore ?? qScore)!);
}

const HRV_STATUS_SCORE: Record<string, number> = {
  balanced: 92, unbalanced: 55, low: 30, poor: 25,
};

export interface ReadinessInput {
  wellness?: WellnessData | null;
  checkin?: HealthCheckin | null;
  tsb?: number | null;
  rhrBaseline?: number | null;   // trailing avg resting HR (to judge "elevated")
}

export function computeReadiness({ wellness, checkin, tsb, rhrBaseline }: ReadinessInput): Readiness {
  const c: ReadinessComponent[] = [];
  const w = wellness ?? null;

  // ── Wearable signals (preferred) ──────────────────────────────────────────
  if (w?.body_battery != null) {
    c.push({ key: "body_battery", label: "Body Battery", score: clamp(w.body_battery), weight: 0.30, auto: true });
  }

  // Sleep — wearable score > wearable duration > manual
  if (w?.sleep_score != null) {
    c.push({ key: "sleep", label: "Sono", score: clamp(w.sleep_score), weight: 0.22, auto: true });
  } else if (w?.sleep_seconds != null) {
    c.push({ key: "sleep", label: "Sono", score: Math.round(sleepFromSeconds(w.sleep_seconds)), weight: 0.22, auto: true });
  } else {
    const ms = manualSleepScore(checkin?.sleep_hours ?? null, checkin?.sleep_quality ?? null);
    if (ms != null) c.push({ key: "sleep", label: "Sono", score: Math.round(ms), weight: 0.22, auto: false });
  }

  if (w?.hrv_status && HRV_STATUS_SCORE[w.hrv_status] != null) {
    c.push({ key: "hrv", label: "HRV", score: HRV_STATUS_SCORE[w.hrv_status], weight: 0.18, auto: true });
  }

  if (w?.resting_hr != null && rhrBaseline != null && rhrBaseline > 0) {
    // Elevated RHR vs baseline = fatigue/illness. +0 bpm → 90, +8 bpm → ~40.
    const delta = w.resting_hr - rhrBaseline;
    c.push({ key: "rhr", label: "FC repouso", score: Math.round(clamp(90 - Math.max(0, delta) * 6 + Math.max(0, -delta) * 2)), weight: 0.10, auto: true });
  }

  // ── Training load (always) ────────────────────────────────────────────────
  if (tsb != null) c.push({ key: "tsb", label: "Forma (carga)", score: Math.round(tsbScore(tsb)), weight: 0.20, auto: true });

  // ── Manual augments (optional) ────────────────────────────────────────────
  if (checkin?.soreness != null) {
    c.push({ key: "soreness", label: "Dor muscular", score: Math.round(clamp(((5 - checkin.soreness) / 4) * 100)), weight: 0.10, auto: false });
  }
  if (checkin?.rpe != null) {
    c.push({ key: "rpe", label: "Esforço de ontem", score: Math.round(clamp(100 - Math.max(0, checkin.rpe - 3) * 8.5)), weight: 0.06, auto: false });
  }

  const totalW = c.reduce((s, x) => s + x.weight, 0) || 1;
  const score = Math.round(c.reduce((s, x) => s + x.score * (x.weight / totalW), 0));

  const verdict: ReadinessVerdict = score >= 70 ? "alta" : score >= 45 ? "moderada" : "baixa";
  const recommendation =
    verdict === "alta"
      ? "Corpo pronto — bom dia para um treino de qualidade ou um esforço mais longo."
      : verdict === "moderada"
        ? "Prontidão parcial — treine, mas ajuste a intensidade ao que o corpo pedir."
        : "Prontidão baixa — priorize recuperação: rodagem leve, mobilidade ou descanso.";

  const hasAuto = c.some(x => x.auto && x.key !== "tsb");
  const hasManual = c.some(x => !x.auto);
  const source: Readiness["source"] = c.length === 0 ? "none"
    : hasAuto && hasManual ? "mixed" : hasAuto ? "wearable" : "manual";

  return { score, verdict, components: c, recommendation, source };
}

/** Trailing average resting HR from recent wellness rows (baseline for RHR scoring). */
export function restingHrBaseline(rows: WellnessData[]): number | null {
  const vals = rows.map(r => r.resting_hr).filter((v): v is number => v != null);
  if (vals.length < 3) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}
