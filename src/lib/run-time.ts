/**
 * Which clock a run should be measured by.
 *
 * A run has two honest durations and they answer different questions:
 *
 *   • **moving time** — the clock the athlete was actually running against.
 *     Strava derives it by discarding samples where the athlete was stopped,
 *     which covers both the auto-pause and the red light you stood at.
 *   • **elapsed time** — wall clock from start to finish, pauses included.
 *     It is the honest answer to "how long were you out?" and the only one
 *     that makes sense for a race, where the clock does not stop for you.
 *
 * The app had been mixing them inside a single row. `stravaActivityToRun` wrote
 * `duration_seconds = elapsed_time`, while `avg_pace_seconds_per_km` comes from
 * Strava's `average_speed`, which is computed over *moving* time. So a real row
 * from 18/08/2026 claimed 7:02/km by distance ÷ duration and 5:23/km by its own
 * pace field — a 1:39/km contradiction with itself. Two other ingest paths
 * (the cron and the webhook) wrote `moving_time ?? elapsed_time` into the same
 * column, so the column's meaning also depended on which route happened to save
 * the row.
 *
 * Rather than rewrite history, the columns stay as they are and every consumer
 * asks for the clock it means by name. Across 400 of Sérgio's runs, 74% carried
 * more than 5 seconds of stopped time, averaging just over 7 minutes — so this
 * is not a rounding argument.
 */
import type { Run } from "@/types";

/** The subset any of these helpers needs — keeps them usable on `select`ed rows. */
export interface RunTimes {
  duration_seconds:     number;
  moving_time_seconds?: number | null;
  elapsed_time_seconds?: number | null;
}

/**
 * Seconds the athlete was actually moving.
 *
 * Use for anything that judges *effort or execution*: was the prescribed
 * workout run, how hard was it, is this a personal best. A red light is not a
 * training decision and should not read as one.
 *
 * Falls back to `duration_seconds` for rows that predate the split columns or
 * came from a source that never reported moving time (manual entries, Health
 * imports). That fallback is the old behaviour, so nothing gets worse.
 */
export function movingSeconds(run: RunTimes): number {
  const mv = run.moving_time_seconds;
  if (typeof mv === "number" && mv > 0) return mv;
  return run.duration_seconds;
}

/**
 * Seconds from start to finish, pauses included.
 *
 * Use for anything that describes *the outing*: how long you were gone, time
 * of day arithmetic, and races — where the official clock never pauses.
 */
export function elapsedSeconds(run: RunTimes): number {
  const el = run.elapsed_time_seconds;
  if (typeof el === "number" && el > 0) return el;
  return run.duration_seconds;
}

/** Seconds spent stopped. Zero when we cannot tell the two clocks apart. */
export function pausedSeconds(run: RunTimes): number {
  return Math.max(0, elapsedSeconds(run) - movingSeconds(run));
}

/**
 * Whether the pause is worth showing the athlete.
 *
 * Half a minute is under the noise floor of GPS drift at a standstill; below
 * that, surfacing "you were stopped for 4 seconds" is clutter, not insight.
 */
export function hasMeaningfulPause(run: RunTimes): boolean {
  return pausedSeconds(run) >= 30;
}

/** Pace over moving time — the pace the athlete actually held. */
export function movingPaceSecPerKm(
  run: RunTimes & { distance_km: number; avg_pace_seconds_per_km?: number | null },
): number | null {
  // Strava's own average_speed is already moving-based and more precise than
  // our division, so prefer it when it is there.
  const stored = run.avg_pace_seconds_per_km;
  if (typeof stored === "number" && stored > 0) return stored;
  if (!run.distance_km || run.distance_km <= 0) return null;
  const sec = movingSeconds(run);
  return sec > 0 ? Math.round(sec / run.distance_km) : null;
}

/** Sum of moving time across runs. */
export function totalMovingSeconds(runs: RunTimes[]): number {
  return runs.reduce((acc, r) => acc + movingSeconds(r), 0);
}

/** Sum of elapsed time across runs. */
export function totalElapsedSeconds(runs: RunTimes[]): number {
  return runs.reduce((acc, r) => acc + elapsedSeconds(r), 0);
}

/**
 * A run whose stopped time dwarfs its moving time is almost always a watch left
 * running, not a workout. One real row: 0.24 km, 102 s moving, 4107 s elapsed —
 * which the app was rendering as a 285:13/km "run".
 *
 * Only a guard for display and records; it never deletes anything.
 */
export function looksLikeForgottenWatch(run: RunTimes): boolean {
  const mv = movingSeconds(run), el = elapsedSeconds(run);
  return mv > 0 && el > mv * 4 && el - mv > 20 * 60;
}

/**
 * Quanto tempo o treino durou — o relógio que se pode somar sem medo.
 *
 * É o `elapsed`, que é a resposta honesta para "quanto tempo você ficou fora",
 * **exceto** quando o relógio ficou ligado depois do treino. Um atleta novo
 * trouxe do Strava sete corridas assim, e elas não eram sutis: 10,01 km com
 * 95 h 56 min de duração, 5,1 km com 719 h. Somar isso num total mensal, numa
 * estimativa de calorias ou num recorde não produz um número impreciso —
 * produz um número absurdo, e um número absurdo na tela destrói a confiança em
 * todos os outros.
 *
 * Nesses casos vale o tempo em movimento, que é o que o próprio Strava mostra
 * como a duração da atividade. Não é um palpite: é a única evidência que
 * sobrou de quanto tempo a pessoa de fato treinou.
 */
export function trainingSeconds(run: RunTimes): number {
  return looksLikeForgottenWatch(run) ? movingSeconds(run) : elapsedSeconds(run);
}

export type { Run };
