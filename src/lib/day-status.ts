/**
 * What a day holds, session by session — one answer for every screen.
 *
 * "Treino feito" used to mean three things. The Hoje card counted the day done
 * when any running happened, so a lifting-only day never finished and a run +
 * lifting day finished before the lifting; the day's recovery knew about the
 * gym; weekly adherence had its own list of gym words. The same Tuesday could
 * be done on one card and pending on the next.
 *
 * Now a day is its planned sessions — the run, the lifting, a ride — each done
 * when something registered that day counts for it, plus everything that was
 * registered, planned or not. Every sport is a session like any other.
 */
import { SPORTS, activityCalories, toSportKey, type SportKey } from "@/lib/sports";
import { looksLikeForgottenWatch, movingSeconds } from "@/lib/run-time";
import type { WeeklyPlanDay } from "@/types";

export interface DayRun {
  id?: string;
  date: string;
  distance_km: number;
  duration_seconds?: number;
  moving_time_seconds?: number | null;
  elapsed_time_seconds?: number | null;
  calories?: number | null;
  name?: string | null;
}

export interface DayActivity {
  id?: string;
  date: string;
  sport_type: string;
  duration_seconds: number | null;
  distance_m?: number | null;
  calories?: number | null;
  name?: string | null;
}

export interface PlannedSession {
  sport: SportKey;
  /**
   * O tipo da sessão do plano — "easy", "intervals", "long_run", "strength"…
   *
   * Existe para a tela poder pintar a sessão na cor do tipo, que é como o
   * Treinador já fala (rodagem verde, tiro vermelho, longão roxo) e como o
   * Sérgio lê o treino antes de ler o nome. Ver `session-colors.ts`.
   */
  type: string;
  label: string;
  /** "7 km", "40 min" — a glanceable line, never a paragraph. */
  detail: string | null;
  done: boolean;
}

export interface DoneItem {
  kind: "run" | "activity";
  id?: string;
  sport: SportKey | null;
  label: string;
  minutes: number;
  km: number | null;
  kcal: number | null;
  /** It is what the plan asked for, rather than something extra. */
  planned: boolean;
}

export interface DayStatus {
  date: string;
  sessions: PlannedSession[];
  done: DoneItem[];
  /** Every planned session has something registered that counts for it. */
  allDone: boolean;
  anyDone: boolean;
}

const km = (n: number) => `${Number(n.toFixed(1)).toString().replace(".", ",")} km`;

/** The sessions a plan day asks for: the run owns the day, lifting rides along. */
export function plannedSessionsOf(day: WeeklyPlanDay | null | undefined): Array<Omit<PlannedSession, "done">> {
  if (!day) return [];
  const out: Array<Omit<PlannedSession, "done">> = [];
  const sport = day.sport as SportKey | undefined;
  const isStrengthDay = day.type === "strength" || day.type === "hiit";

  if (day.type !== "rest" && !isStrengthDay) {
    const key: SportKey = sport && SPORTS[sport] ? sport : "corrida";
    out.push({
      sport: key,
      type: day.type,
      label: day.label,
      detail: day.distance_km ? km(day.distance_km) : day.duration_min ? `${day.duration_min} min` : null,
    });
  }
  if (isStrengthDay || day.strength) {
    const minutes = day.strength?.estimatedMinutes ?? (isStrengthDay ? day.duration_min : null);
    out.push({ sport: "musculacao", type: "strength", label: "Musculação", detail: minutes ? `${minutes} min` : null });
  }
  return out;
}

export function dayStatus(input: {
  date: string;
  planned: WeeklyPlanDay | null | undefined;
  runs: DayRun[];
  activities: DayActivity[];
  weightKg?: number | null;
}): DayStatus {
  const done: DoneItem[] = [
    ...input.runs
      .map(r => ({ ...r, duration_seconds: r.duration_seconds ?? 0 }))
      .filter(r => r.date === input.date && r.distance_km > 0 && !looksLikeForgottenWatch(r))
      .map(r => ({
        kind: "run" as const, id: r.id, sport: "corrida" as SportKey, label: r.name || "Corrida",
        minutes: Math.round(movingSeconds(r) / 60), km: Math.round(r.distance_km * 100) / 100,
        kcal: r.calories && r.calories > 0 ? Math.round(r.calories) : null, planned: false,
      })),
    ...input.activities
      .filter(a => a.date === input.date)
      .map(a => {
        const sport = toSportKey(a.sport_type);
        return {
          kind: "activity" as const, id: a.id, sport,
          label: sport ? SPORTS[sport].label : (a.name || a.sport_type),
          minutes: Math.round((a.duration_seconds ?? 0) / 60),
          km: a.distance_m && a.distance_m > 0 ? Math.round(a.distance_m / 10) / 100 : null,
          kcal: Math.round(activityCalories(a, input.weightKg)) || null,
          planned: false,
        };
      }),
  ];

  const sessions: PlannedSession[] = plannedSessionsOf(input.planned).map(s => {
    const match = done.find(d => !d.planned && d.sport === s.sport);
    if (match) match.planned = true;
    return { ...s, done: !!match };
  });

  return {
    date: input.date,
    sessions,
    done,
    allDone: sessions.length > 0 && sessions.every(s => s.done),
    anyDone: done.length > 0,
  };
}

/** The session that decides the day — the run when there is one — is done. */
export function mainSessionDone(status: DayStatus): boolean {
  return status.sessions[0]?.done ?? false;
}
