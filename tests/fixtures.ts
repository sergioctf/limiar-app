/**
 * Shared fixtures.
 *
 * A single calibrated athlete, so every test speaks about the same person and a
 * failure reads as "this went wrong for a 43 VDOT runner" rather than "some
 * numbers changed".
 */
import { computeMetrics } from "@/lib/performance";
import { normalizePrefs } from "@/lib/workout-builder";
import { normalizeStrengthPrefs } from "@/lib/strength-prefs";
import type { WeekContext } from "@/lib/workout-builder";
import type { WeeklyPlanDay } from "@/types";

/** 3 km in 13:00 with 178 bpm average — VDOT ≈ 43.7, LTHR = 165. */
export const METRICS = computeMetrics(3000, 780, 178);

/** The same test without heart rate: paces yes, HR windows no. */
export const METRICS_NO_HR = computeMetrics(3000, 780);

export function weekContext(over: Partial<WeekContext> = {}): WeekContext {
  return {
    weekStart: "2026-08-03",
    weeklyKm: 40,
    recentAverageKm: 38,
    paces: METRICS.paces,
    lthr: METRICS.lthr,
    phase: "base",
    targetRaceKm: null,
    ...over,
  };
}

/** Sérgio's own layout: easy → quality → long on Mon/Wed/Sat. */
export const PREFS_3_DAYS = normalizePrefs({
  runDays: ["Mon", "Wed", "Sat"],
  strengthDays: ["Tue", "Thu", "Fri"],
  qualityPerWeek: 1,
});

export const PREFS_5_DAYS = normalizePrefs({
  runDays: ["Mon", "Tue", "Wed", "Fri", "Sat"],
  strengthDays: ["Thu"],
  qualityPerWeek: 2,
});

export const PREFS_2_DAYS = normalizePrefs({
  runDays: ["Tue", "Sat"],
  strengthDays: ["Mon", "Thu"],
  qualityPerWeek: 1,
});

/** Legs on Friday — right before the Saturday long run. */
export const STRENGTH_PREFS = normalizeStrengthPrefs({
  goal: "hipertrofia",
  experience: "intermediario",
  equipment: ["academia"],
  sessionMinutes: 60,
  style: "misto",
  days: [
    { day: "Tue", muscles: ["peito", "triceps"] },
    { day: "Thu", muscles: ["costas", "biceps"] },
    { day: "Fri", muscles: ["quadriceps", "posterior", "gluteo"] },
  ],
});

/** Total running kilometres actually prescribed in a week. */
export function totalKm(days: WeeklyPlanDay[]): number {
  return days.reduce((s, d) => s + (d.distance_km ?? 0), 0);
}

export function dayOf(days: WeeklyPlanDay[], key: WeeklyPlanDay["day"]): WeeklyPlanDay {
  const found = days.find(d => d.day === key);
  if (!found) throw new Error(`no day ${key} in plan`);
  return found;
}

export const RUN_TYPES = new Set(["easy", "tempo", "intervals", "long_run", "recovery"]);
