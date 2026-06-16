/**
 * Readiness-driven plan suggestions. Deterministic, opt-in: when readiness is
 * low and today is a hard/long session, propose a lighter day. The app shows
 * this as a suggestion the athlete approves or declines — never automatic.
 */
import type { WeeklyPlanDay } from "@/types";

const HARD_TYPES = new Set(["tempo", "intervals", "test", "long_run"]);

/** Should we propose easing today, given the planned day and readiness score? */
export function shouldSuggestEasing(planned: WeeklyPlanDay | null, readinessScore: number): boolean {
  if (!planned) return false;
  if (readinessScore >= 45) return false;            // only when readiness is low
  return HARD_TYPES.has(planned.type);               // only for quality/long days
}

export interface ReadinessSuggestion {
  reason: string;
  message: string;
  suggestedDay: WeeklyPlanDay;
}

export function buildReadinessSuggestion(
  planned: WeeklyPlanDay,
  readinessScore: number,
  easyPace?: string | null,
): ReadinessSuggestion {
  const suggestedDay: WeeklyPlanDay = {
    ...planned,
    type: "easy",
    label: "Rodagem leve",
    distance_km: planned.distance_km != null ? Math.max(4, Math.round(planned.distance_km * 0.5)) : 5,
    duration_min: planned.distance_km == null && planned.duration_min != null
      ? Math.round(planned.duration_min * 0.6)
      : undefined,
    pace: easyPace ?? undefined,
    description: "Versão reduzida por baixa prontidão: mantenha o esforço leve (Z1–Z2), foco em recuperar. O treino-chave volta quando o corpo estiver pronto.",
    structure: undefined,
  };

  const original = planned.distance_km != null
    ? `${planned.label} (${planned.distance_km} km)`
    : planned.label;

  return {
    reason: `Prontidão ${readinessScore}/100`,
    message: `Sua prontidão hoje está baixa (${readinessScore}/100). Que tal trocar "${original}" por uma rodagem leve de ${suggestedDay.distance_km} km? Você decide.`,
    suggestedDay,
  };
}
