/**
 * Readiness — the "Limiar Score": a 0-100 read on whether the body is ready
 * to train hard today. Combines training-load freshness (TSB) with the day's
 * subjective check-in (sleep, soreness, yesterday's RPE).
 *
 * Each sub-score is 0-100; the final score is a weighted blend over whatever
 * inputs are available (weights renormalize when something is missing).
 */
import type { HealthCheckin } from "@/types";

export type ReadinessVerdict = "alta" | "moderada" | "baixa";

export interface ReadinessComponent {
  key: "tsb" | "sleep" | "soreness" | "rpe";
  label: string;
  score: number;       // 0-100
  weight: number;
}

export interface Readiness {
  score: number;                 // 0-100
  verdict: ReadinessVerdict;
  components: ReadinessComponent[];
  recommendation: string;
  hasCheckin: boolean;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** TSB (form) → readiness. Very fresh = high; deeply fatigued = low. */
function tsbScore(tsb: number): number {
  // +10 or better → 100; -30 or worse → 15; linear between
  if (tsb >= 10) return 100;
  if (tsb <= -30) return 15;
  return clamp(15 + ((tsb + 30) / 40) * 85);
}

/** Sleep hours (target ~8h) + quality (1-5). */
function sleepScore(hours: number | null, quality: number | null): number | null {
  if (hours == null && quality == null) return null;
  let hScore = 70;
  if (hours != null) {
    // 8h = 100, 6h ≈ 60, 5h ≈ 35, 10h ≈ 90 (slight over-sleep penalty)
    hScore = hours >= 7.5 && hours <= 9 ? 100
      : hours >= 6.5 ? 80
      : hours >= 5.5 ? 55
      : hours >= 4.5 ? 35
      : 20;
    if (hours > 9.5) hScore = 85;
  }
  const qScore = quality != null ? ((quality - 1) / 4) * 100 : hScore;
  return clamp(hours != null && quality != null ? hScore * 0.6 + qScore * 0.4 : (hours != null ? hScore : qScore));
}

/** Soreness 1 (none) … 5 (intense) → inverted. */
function sorenessScore(soreness: number | null): number | null {
  if (soreness == null) return null;
  return clamp(((5 - soreness) / 4) * 100);
}

/** Yesterday's RPE 0-10: hard sessions leave residual fatigue. */
function rpeScore(rpe: number | null): number | null {
  if (rpe == null) return null;
  // RPE ≤3 → ~100, RPE 10 → ~40 (one hard day doesn't tank readiness alone)
  return clamp(100 - Math.max(0, rpe - 3) * 8.5);
}

export function computeReadiness(checkin: HealthCheckin | null, tsb: number | null): Readiness {
  const raw: ReadinessComponent[] = [];

  if (tsb != null) raw.push({ key: "tsb", label: "Forma (carga)", score: Math.round(tsbScore(tsb)), weight: 0.40 });

  const sl = sleepScore(checkin?.sleep_hours ?? null, checkin?.sleep_quality ?? null);
  if (sl != null) raw.push({ key: "sleep", label: "Sono", score: Math.round(sl), weight: 0.30 });

  const so = sorenessScore(checkin?.soreness ?? null);
  if (so != null) raw.push({ key: "soreness", label: "Dor muscular", score: Math.round(so), weight: 0.20 });

  const rp = rpeScore(checkin?.rpe ?? null);
  if (rp != null) raw.push({ key: "rpe", label: "Esforço de ontem", score: Math.round(rp), weight: 0.10 });

  // Renormalize weights over available components
  const totalW = raw.reduce((s, c) => s + c.weight, 0) || 1;
  const score = Math.round(raw.reduce((s, c) => s + c.score * (c.weight / totalW), 0));

  const verdict: ReadinessVerdict = score >= 70 ? "alta" : score >= 45 ? "moderada" : "baixa";

  const recommendation =
    verdict === "alta"
      ? "Corpo pronto — bom dia para um treino de qualidade ou um esforço mais longo."
      : verdict === "moderada"
        ? "Prontidão parcial — treine, mas ajuste a intensidade ao que o corpo pedir."
        : "Prontidão baixa — priorize recuperação: rodagem leve, mobilidade ou descanso.";

  return { score, verdict, components: raw, recommendation, hasCheckin: !!checkin };
}
