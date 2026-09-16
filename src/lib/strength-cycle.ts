/**
 * Strength periodization — 4-week blocks that ride on top of the running plan.
 *
 * Two things are happening at once and they have to agree:
 *   • Within a block, effort ramps (RIR 3 → 2 → 1) and then a deload week lets
 *     the adaptation consolidate. Lifting hard every week indefinitely stops
 *     producing anything.
 *   • Across the season, the running phase decides what strength is FOR: build
 *     volume in base, get heavy in build (that's where running economy
 *     improves), maintain in peak, and only activate during taper.
 *
 * See TRAINING_SCIENCE.md §8.5.
 */
import type { Phase } from "@/lib/strength-builder";

/** Monday used as the origin for block counting — arbitrary but fixed. */
const EPOCH_MONDAY = Date.UTC(2026, 0, 5);   // 2026-01-05

export interface StrengthBlock {
  /** 1–4 within the current block. */
  week:      number;
  /** True on the consolidation week. */
  deload:    boolean;
  /** Reps-in-reserve target for the week. */
  rir:       number;
  /** Multiplier applied to set counts. */
  volume:    number;
  /** Shifts the rep range: negative = heavier/lower reps. */
  repShift:  number;
  /** One line explaining the week, shown to the athlete. */
  intent:    string;
}

/** Which week of the 4-week block a given Monday falls on. */
export function blockWeekFor(weekStart: string): number {
  const monday = new Date(`${weekStart}T12:00:00Z`).getTime();
  const weeks = Math.floor((monday - EPOCH_MONDAY) / (7 * 86400_000));
  return ((weeks % 4) + 4) % 4 + 1;   // 1..4, safe for dates before the epoch
}

/**
 * The week's strength prescription modifiers.
 *
 * During taper and race week the block is irrelevant — the running plan owns
 * the athlete's freshness and lifting simply gets out of the way.
 */
export function strengthBlockFor(weekStart: string, phase: Phase): StrengthBlock {
  if (phase === "taper" || phase === "race") {
    return {
      week: blockWeekFor(weekStart),
      deload: true,
      rir: 4,
      volume: 0.5,
      repShift: 0,
      intent: "Semana de prova: só ativação. Manter o movimento sem gerar fadiga.",
    };
  }

  const week = blockWeekFor(weekStart);

  if (week === 4) {
    return {
      week, deload: true, rir: 4, volume: 0.6, repShift: 0,
      intent: "Semana de consolidação: volume reduzido para o corpo absorver o bloco.",
    };
  }

  // Effort climbs across the first three weeks of the block.
  const rir = week === 1 ? 3 : week === 2 ? 2 : 1;

  // The running phase decides the character of the block.
  const byPhase: Record<Phase, { repShift: number; volume: number; intent: string }> = {
    base:  { repShift:  0, volume: 1.0,  intent: "Fase de base: volume e qualidade de movimento; a carga sobe aos poucos." },
    build: { repShift: -2, volume: 0.9,  intent: "Fase de construção: mais pesado e menos repetições — é aqui que a economia de corrida melhora." },
    peak:  { repShift: -1, volume: 0.7,  intent: "Fase de pico: manutenção. Mantém a carga, corta volume para poupar as pernas." },
    taper: { repShift:  0, volume: 0.5,  intent: "Polimento." },
    race:  { repShift:  0, volume: 0.5,  intent: "Semana de prova." },
  };

  const mod = byPhase[phase] ?? byPhase.base;

  return {
    week,
    deload: false,
    rir,
    volume: mod.volume,
    repShift: mod.repShift,
    intent: `${mod.intent} Semana ${week} de 4 — alvo RIR ${rir}.`,
  };
}

/**
 * How much strength volume should yield to a heavy running week.
 *
 * When running volume jumps above the athlete's recent norm, the legs are
 * already carrying the load; adding lifting volume on top is how people get
 * hurt in the middle of a build.
 */
export function runningLoadFactor(plannedKm: number, recentAverageKm: number): number {
  if (recentAverageKm <= 0) return 1;
  const ratio = plannedKm / recentAverageKm;
  if (ratio >= 1.25) return 0.7;   // big jump — back off noticeably
  if (ratio >= 1.10) return 0.85;
  return 1;
}
