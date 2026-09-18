/**
 * "Sua semana" — every registered activity, every sport, Monday to Sunday.
 *
 * Decided with Sérgio, 18/09, for the new Home:
 *   · only registered activities (no steps or everyday walking);
 *   · time is the common measure; distance stays per sport — 30 km of bike and
 *     5 km of running are both worth showing, "35 km this week" explains
 *     nothing;
 *   · activities outside the plan count: they are part of the athlete's life;
 *   · planned sessions still to come show as a quiet mark, never as a debt —
 *     the week is a record, not a productivity report;
 *   · calories stay on the Home: the watch's active energy when it arrived for
 *     that day (Garmin), otherwise what the workouts recorded (Strava), and the
 *     line says which.
 */
import { SPORTS, type SportKey } from "@/lib/sports";
import { dayStatus, type DayActivity, type DayRun, type DoneItem, type PlannedSession } from "@/lib/day-status";
import type { WeeklyPlanData } from "@/types";

const KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export interface MovementDay {
  date: string;
  key: (typeof KEYS)[number];
  short: string;
  isToday: boolean;
  isFuture: boolean;
  done: DoneItem[];
  /** Planned sessions not done yet, today or later — a quiet mark, not a debt. */
  upcoming: PlannedSession[];
}

export interface SportLine {
  sport: SportKey | null;
  label: string;
  emoji: string;
  sessions: number;
  minutes: number;
  /** Only for sports measured in distance. */
  km: number | null;
}

export interface WeekMovement {
  days: MovementDay[];
  sessions: number;
  minutes: number;
  bySport: SportLine[];
  calories: { kcal: number; source: "relogio" | "treinos" | "misto" } | null;
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekMovement(input: {
  weekStart: string;
  today: string;
  plan: WeeklyPlanData | null;
  runs: DayRun[];
  activities: DayActivity[];
  /** The watch's active energy per day, when it arrives (Garmin via Apple Health or intervals). */
  wellness?: Array<{ date: string; active_kcal?: number | null }>;
  weightKg?: number | null;
}): WeekMovement {
  const days: MovementDay[] = KEYS.map((key, i) => {
    const date = addDays(input.weekStart, i);
    const planned = input.plan?.days.find(d => d.day === key) ?? null;
    const status = dayStatus({ date, planned, runs: input.runs, activities: input.activities, weightKg: input.weightKg });
    return {
      date, key, short: SHORT[i],
      isToday: date === input.today,
      isFuture: date > input.today,
      done: status.done,
      upcoming: date >= input.today ? status.sessions.filter(s => !s.done) : [],
    };
  });

  const all = days.flatMap(d => d.done);
  const bySportMap = new Map<string, SportLine>();
  for (const item of all) {
    const k = item.sport ?? item.label;
    const meta = item.sport ? SPORTS[item.sport] : null;
    const line = bySportMap.get(k) ?? {
      sport: item.sport, label: meta?.label ?? item.label, emoji: meta?.emoji ?? "•",
      sessions: 0, minutes: 0, km: meta?.unit === "distance" ? 0 : null,
    };
    line.sessions++;
    line.minutes += item.minutes;
    if (line.km != null && item.km != null) line.km = Math.round((line.km + item.km) * 10) / 10;
    bySportMap.set(k, line);
  }
  // Running first — the plan is built around it — then by time spent.
  const bySport = Array.from(bySportMap.values())
    .sort((a, b) => (a.sport === "corrida" ? -1 : b.sport === "corrida" ? 1 : b.minutes - a.minutes));

  // Calories: the watch's day when it has one, else the day's workouts.
  const watch = new Map((input.wellness ?? [])
    .filter(w => w.active_kcal != null && w.active_kcal > 0)
    .map(w => [w.date, Number(w.active_kcal)]));
  let kcal = 0, fromWatch = 0, fromWorkouts = 0;
  for (const d of days) {
    if (d.isFuture) continue;
    const w = watch.get(d.date);
    if (w != null) { kcal += w; fromWatch++; continue; }
    const k = d.done.reduce((s, x) => s + (x.kcal ?? 0), 0);
    if (k > 0) { kcal += k; fromWorkouts++; }
  }
  const calories = kcal > 0
    ? { kcal: Math.round(kcal), source: (fromWatch && fromWorkouts ? "misto" : fromWatch ? "relogio" : "treinos") as "relogio" | "treinos" | "misto" }
    : null;

  return {
    days,
    sessions: all.length,
    minutes: all.reduce((s, x) => s + x.minutes, 0),
    bySport,
    calories,
  };
}

/** "4h20" / "45 min" */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
