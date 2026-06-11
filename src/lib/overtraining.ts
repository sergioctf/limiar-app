/**
 * Overtraining detection — combines multiple load signals into a single
 * actionable risk assessment:
 *   1. TSB (Training Stress Balance / "Forma") deeply negative
 *   2. ACWR (Acute:Chronic Workload Ratio = ATL/CTL) in the injury-risk zone
 *   3. Long run streak without a rest day
 *   4. Sharp week-over-week volume jump (violates the ~10% rule)
 */
import type { Run } from "@/types";
import { computeTrainingLoad, computeRunStreak, weeklyVolumeProgress } from "./training-load";

export type OvertrainingLevel = "ok" | "caution" | "high";

export interface OvertrainingSignal {
  id: string;
  label: string;
  detail: string;
  severity: "caution" | "high";
}

export interface OvertrainingAssessment {
  level: OvertrainingLevel;
  tsb: number;
  acwr: number;             // acute:chronic ratio (ATL/CTL)
  signals: OvertrainingSignal[];
  recommendation: string;
}

export function detectOvertraining(
  runs: Run[],
  lthr?: number | null,
  thresholdPaceSecKm?: number | null,
): OvertrainingAssessment {
  const empty: OvertrainingAssessment = {
    level: "ok", tsb: 0, acwr: 0, signals: [], recommendation: "Carga sob controle.",
  };
  if (!runs || runs.length < 5) return empty;

  const load = computeTrainingLoad(runs, lthr, thresholdPaceSecKm, 90);
  if (load.length === 0) return empty;

  const latest = load[load.length - 1];
  const tsb = latest.tsb;
  const acwr = latest.ctl > 0 ? Math.round((latest.atl / latest.ctl) * 100) / 100 : 0;

  const signals: OvertrainingSignal[] = [];

  // ── 1. TSB deeply negative ────────────────────────────────────────────────
  if (tsb <= -30) {
    signals.push({
      id: "tsb",
      label: "Forma muito negativa",
      detail: `Sua forma (TSB) está em ${tsb.toFixed(0)} — sinal de fadiga acumulada.`,
      severity: "high",
    });
  } else if (tsb <= -20) {
    signals.push({
      id: "tsb",
      label: "Fadiga elevada",
      detail: `TSB em ${tsb.toFixed(0)}. Acompanhe os sinais de recuperação.`,
      severity: "caution",
    });
  }

  // ── 2. ACWR in injury-risk zone (sweet spot 0.8–1.3) ──────────────────────
  if (acwr >= 1.5) {
    signals.push({
      id: "acwr",
      label: "Carga aguda muito alta",
      detail: `Sua carga recente é ${acwr.toFixed(2)}× a crônica (ideal: 0,8–1,3). Risco de lesão aumentado.`,
      severity: "high",
    });
  } else if (acwr >= 1.3) {
    signals.push({
      id: "acwr",
      label: "Carga subindo rápido",
      detail: `Razão aguda:crônica em ${acwr.toFixed(2)}. Evite aumentar mais o volume esta semana.`,
      severity: "caution",
    });
  }

  // ── 3. Run streak without rest ────────────────────────────────────────────
  const streak = computeRunStreak(runs);
  if (streak >= 14) {
    signals.push({
      id: "streak",
      label: "Muitos dias sem descanso",
      detail: `${streak} dias seguidos correndo. Um dia de descanso ajuda a consolidar os ganhos.`,
      severity: "high",
    });
  } else if (streak >= 10) {
    signals.push({
      id: "streak",
      label: "Sequência longa",
      detail: `${streak} dias seguidos. Considere um dia leve ou de descanso em breve.`,
      severity: "caution",
    });
  }

  // ── 4. Week-over-week volume jump (~10% rule) ─────────────────────────────
  const vol = weeklyVolumeProgress(runs, 0);
  if (vol.lastWeek > 5) {
    const jump = (vol.thisWeek - vol.lastWeek) / vol.lastWeek;
    if (jump >= 0.5) {
      signals.push({
        id: "volume",
        label: "Salto grande de volume",
        detail: `Volume subiu ${Math.round(jump * 100)}% vs. semana passada (${vol.lastWeek}→${vol.thisWeek} km). Recomenda-se ≤10%.`,
        severity: "high",
      });
    } else if (jump >= 0.3) {
      signals.push({
        id: "volume",
        label: "Volume subindo rápido",
        detail: `+${Math.round(jump * 100)}% vs. semana passada. Aumente de forma mais gradual.`,
        severity: "caution",
      });
    }
  }

  // ── Aggregate level ───────────────────────────────────────────────────────
  const hasHigh = signals.some(s => s.severity === "high");
  const level: OvertrainingLevel = hasHigh ? "high" : signals.length > 0 ? "caution" : "ok";

  const recommendation =
    level === "high"
      ? "Priorize recuperação: 1–2 dias de descanso ou treino regenerativo, sono e hidratação."
      : level === "caution"
      ? "Monitore a recuperação. Mantenha treinos leves e evite aumentar a carga agora."
      : "Carga sob controle — siga o plano normalmente.";

  return { level, tsb, acwr, signals, recommendation };
}
