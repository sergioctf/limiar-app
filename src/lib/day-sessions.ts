/**
 * What a training day actually contains, as a list rather than a single label.
 *
 * A plan day carries a run *and* a lifting session in the same record, but every
 * surface rendered only `label` — so Wednesday with an interval session and a
 * chest workout announced itself as "Tiro 3×400 m" and nothing else. The second
 * session existed further down the screen, which is not where anyone looks to
 * find out what their day is.
 */
import type { WeeklyPlanDay } from "@/types";

export interface DaySession {
  kind:  "corrida" | "musculacao" | "cardio" | "descanso";
  label: string;
  /** "6 km", "45 min" — whatever the session is measured in. */
  detail?: string;
}

function runDetail(day: Pick<WeeklyPlanDay, "distance_km" | "duration_min">): string | undefined {
  if (day.distance_km != null) return `${day.distance_km} km`;
  if (day.duration_min != null) return `${day.duration_min} min`;
  return undefined;
}

/**
 * Every session on a day, in the order it should be performed.
 *
 * The running session comes first because that is the ordering rule the plan
 * already prescribes on shared days: run first, lift after.
 */
export function daySessions(day: WeeklyPlanDay | null | undefined): DaySession[] {
  if (!day) return [];

  const sessions: DaySession[] = [];

  // A day whose sport *is* lifting has no separate run to announce — otherwise
  // it would read "Musculação + Musculação".
  const isStrengthOnly = day.sport === "musculacao";

  if (day.type !== "rest" && !isStrengthOnly) {
    sessions.push({
      kind:   day.sport === "corrida" || !day.sport ? "corrida" : "cardio",
      label:  day.label,
      detail: runDetail(day),
    });
  }

  if (day.strength && day.strength.exercises.length > 0) {
    sessions.push({
      kind:   "musculacao",
      label:  isStrengthOnly ? day.label : "Musculação",
      detail: `${day.strength.exercises.length} exercícios · ~${day.strength.estimatedMinutes} min`,
    });
  }

  // Rest is a session too: a day with nothing planned must say so rather than
  // render as an empty row.
  if (sessions.length === 0) {
    sessions.push({ kind: "descanso", label: day.type === "rest" ? "Descanso" : day.label });
  }

  return sessions;
}

/**
 * One line naming everything on the day — "Rodagem leve + Musculação".
 *
 * This is the string that goes in titles and tooltips, and it is the whole
 * point of the change: the athlete should learn their day from its heading.
 */
export function dayTitle(day: WeeklyPlanDay | null | undefined): string {
  const sessions = daySessions(day);
  return sessions.map(s => s.label).join(" + ");
}

/** True when the day holds more than one session. */
export function isDoubleDay(day: WeeklyPlanDay | null | undefined): boolean {
  return daySessions(day).length > 1;
}
