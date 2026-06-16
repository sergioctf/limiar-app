/**
 * Overtraining detection — combines multiple load signals into a single
 * actionable risk assessment:
 *   1. TSB (Training Stress Balance / "Forma") deeply negative
 *   2. ACWR (Acute:Chronic Workload Ratio = ATL/CTL) in the injury-risk zone
 *   3. Long run streak without a rest day
 *   4. Sharp week-over-week volume jump (violates the ~10% rule)
 */
import type { Run, WellnessData } from "@/types";
import { computeTrainingLoad, computeRunStreak, weeklyVolumeProgress } from "./training-load";

/** Average a numeric field over wellness rows whose date is within [fromDaysAgo, toDaysAgo). */
function avgWindow(rows: WellnessData[], field: "hrv_ms" | "resting_hr" | "sleep_seconds", fromDaysAgo: number, toDaysAgo: number): number | null {
  const now = Date.now();
  const vals: number[] = [];
  for (const r of rows) {
    const ageDays = (now - new Date(`${r.date}T12:00:00`).getTime()) / 86400000;
    if (ageDays >= toDaysAgo && ageDays < fromDaysAgo) {
      const v = r[field];
      if (typeof v === "number") vals.push(v);
    }
  }
  return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

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
  wellness?: WellnessData[] | null,
): OvertrainingAssessment {
  const empty: OvertrainingAssessment = {
    level: "ok", tsb: 0, acwr: 0, signals: [], recommendation: "Carga sob controle.",
  };
  // With wellness data we can assess even with few runs; otherwise need ≥5 runs
  const hasWellness = !!wellness && wellness.length >= 4;
  if ((!runs || runs.length < 5) && !hasWellness) return empty;

  const load = (runs && runs.length >= 5) ? computeTrainingLoad(runs, lthr, thresholdPaceSecKm, 90) : [];
  const latest = load.length > 0 ? load[load.length - 1] : null;
  const tsb = latest ? latest.tsb : 0;
  const acwr = latest && latest.ctl > 0 ? Math.round((latest.atl / latest.ctl) * 100) / 100 : 0;

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

  // ── 5. Wellness signals (HRV / resting HR / sleep) ────────────────────────
  if (hasWellness && wellness) {
    // HRV suppression vs personal baseline (recent 3d vs prior 4-21d)
    const hrvRecent = avgWindow(wellness, "hrv_ms", 3, 0);
    const hrvBase   = avgWindow(wellness, "hrv_ms", 21, 4);
    if (hrvRecent != null && hrvBase != null && hrvBase > 0) {
      const drop = (hrvBase - hrvRecent) / hrvBase;
      if (drop >= 0.15) {
        signals.push({ id: "hrv", label: "HRV suprimida", severity: "high",
          detail: `Sua variabilidade cardíaca caiu ${Math.round(drop * 100)}% vs. sua linha de base — forte sinal de fadiga ou início de doença.` });
      } else if (drop >= 0.08) {
        signals.push({ id: "hrv", label: "HRV abaixo do normal", severity: "caution",
          detail: `HRV ${Math.round(drop * 100)}% abaixo da base. Monitore a recuperação.` });
      }
    }

    // Elevated resting HR vs baseline
    const rhrRecent = avgWindow(wellness, "resting_hr", 3, 0);
    const rhrBase   = avgWindow(wellness, "resting_hr", 21, 4);
    if (rhrRecent != null && rhrBase != null) {
      const delta = rhrRecent - rhrBase;
      if (delta >= 7) {
        signals.push({ id: "rhr", label: "FC de repouso elevada", severity: "high",
          detail: `Sua FC de repouso está +${delta.toFixed(0)} bpm acima da base — pode indicar fadiga acumulada, estresse ou infecção.` });
      } else if (delta >= 4) {
        signals.push({ id: "rhr", label: "FC de repouso subindo", severity: "caution",
          detail: `FC de repouso +${delta.toFixed(0)} bpm vs. base. Vale pegar mais leve e dormir bem.` });
      }
    }

    // Sleep debt (last 3 nights)
    const sleepRecent = avgWindow(wellness, "sleep_seconds", 3, 0);
    if (sleepRecent != null) {
      const h = sleepRecent / 3600;
      if (h < 5.5) {
        signals.push({ id: "sleep", label: "Privação de sono", severity: "high",
          detail: `Média de ${h.toFixed(1)}h de sono nas últimas noites — recuperação comprometida.` });
      } else if (h < 6.5) {
        signals.push({ id: "sleep", label: "Sono insuficiente", severity: "caution",
          detail: `Média de ${h.toFixed(1)}h nas últimas noites. Priorize dormir mais.` });
      }
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
