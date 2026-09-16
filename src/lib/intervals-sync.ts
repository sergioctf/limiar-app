/**
 * Pull an athlete's recent wellness from intervals.icu into `wellness_data`.
 *
 * Shared by the three ways a sync starts — connecting, opening the app, and the
 * morning cron — so that all three store the same thing and fail the same way.
 */
import {
  fetchIcuWellness, toWellnessRow, isEmptyIcuRow, wellnessWindow, IcuError,
} from "@/lib/intervals";
import { upsertWellness } from "@/lib/wellness-upsert";
import { athleteDateStr } from "@/lib/week";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export interface IntervalsSyncResult {
  ok: boolean;
  saved: number;
  /**
   * Days whose readings actually differ from what was stored.
   *
   * Every pass rewrites the whole window, so `saved` is never zero and cannot
   * tell a screen whether to redraw. This can.
   */
  changed?: number;
  /** Most recent date that carried a signal, if any arrived. */
  latest: string | null;
  error?: string;
  /** The key was refused: the athlete has to reconnect, retrying will not help. */
  unauthorized?: boolean;
}

/**
 * How far back a sync reads.
 *
 * A month on every pass, not a week: the Saúde screen charts thirty days, and
 * Garmin delivers history late — a year's backfill requested in intervals.icu
 * trickles in over hours, long after the first sync found nothing. Thirty
 * records is still a single small request.
 *
 * Until the athlete has real history stored, each pass reads the whole year, so
 * that backfill lands in full the first time it appears rather than a month at
 * a time.
 */
export const FIRST_SYNC_DAYS = 365;
export const ROUTINE_SYNC_DAYS = 30;
const HISTORY_ROWS = 20;

export interface StoredReading {
  date: string;
  sleep_seconds: number | null;
  sleep_score: number | null;
  hrv_ms: number | null;
  resting_hr: number | null;
  raw: Record<string, unknown> | null;
}

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null)
  || (a != null && b != null && Number(a) === Number(b));

/** How many incoming days differ from what is stored — new days included. */
export function countChanged(incoming: StoredReading[], stored: StoredReading[]): number {
  const byDate = new Map(stored.map(s => [s.date, s]));
  return incoming.filter(r => {
    const s = byDate.get(r.date);
    if (!s) return true;
    return !same(r.sleep_seconds, s.sleep_seconds) || !same(r.sleep_score, s.sleep_score)
      || !same(r.hrv_ms, s.hrv_ms) || !same(r.resting_hr, s.resting_hr)
      // raw is merged only when present, so a missing incoming raw is not a change.
      || (r.raw != null && JSON.stringify(r.raw) !== JSON.stringify(s.raw ?? null));
  }).length;
}

async function windowFor(admin: Admin, userId: string, requested?: number): Promise<number> {
  if (requested) return requested;
  const { count } = await admin.from("wellness_data")
    .select("date", { count: "exact", head: true })
    .eq("user_id", userId).eq("source", "intervals");
  return (count ?? 0) < HISTORY_ROWS ? FIRST_SYNC_DAYS : ROUTINE_SYNC_DAYS;
}

export async function syncIntervals(
  admin: Admin, userId: string, days?: number,
): Promise<IntervalsSyncResult> {
  const { data: conn } = await admin
    .from("intervals_connections").select("athlete_id, api_key")
    .eq("user_id", userId).maybeSingle();
  if (!conn) return { ok: false, saved: 0, latest: null, error: "intervals.icu não conectado." };

  const { oldest, newest } = wellnessWindow(athleteDateStr(), await windowFor(admin, userId, days));

  try {
    const records = await fetchIcuWellness(conn.athlete_id, conn.api_key, oldest, newest);
    const rows = records
      .map(toWellnessRow)
      .filter((r): r is NonNullable<typeof r> => r != null && !isEmptyIcuRow(r))
      .map(r => ({ ...r, user_id: userId, source: "intervals" }));

    const { data: before } = await admin.from("wellness_data")
      .select("date, sleep_seconds, sleep_score, hrv_ms, resting_hr, raw")
      .eq("user_id", userId).gte("date", oldest).lte("date", newest);
    const changed = countChanged(rows, (before ?? []) as StoredReading[]);

    const { saved, error } = await upsertWellness(admin, rows);
    if (error) throw new Error(error);

    await admin.from("intervals_connections")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("user_id", userId);

    const latest = rows.map(r => r.date).sort().pop() ?? null;
    return { ok: true, saved, changed, latest };
  } catch (err) {
    const unauthorized = err instanceof IcuError && err.unauthorized;
    const message = unauthorized
      ? "O intervals.icu recusou a chave. Gere uma nova em Settings → Developer Settings e conecte de novo."
      : "Não foi possível ler do intervals.icu agora.";
    console.error("[intervals] sync falhou:", err);

    await admin.from("intervals_connections")
      .update({ last_error: message })
      .eq("user_id", userId);

    return { ok: false, saved: 0, latest: null, error: message, unauthorized };
  }
}
