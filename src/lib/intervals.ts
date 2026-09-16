/**
 * intervals.icu — the door to Garmin's health data that is still open.
 *
 * Garmin paused new applications to its developer program in 2026, with no date
 * to reopen and no waiting list. Existing partners kept their access, and
 * intervals.icu is one of them: an athlete who connects Garmin there gets their
 * overnight HRV, resting heart rate and sleep delivered from any Garmin device,
 * including the screenless CIRQA band, which has no other way out.
 *
 * intervals.icu then hands that back through a personal API key the athlete
 * generates in their own settings — no approval, no OAuth client to register.
 * Its guidance is that apps used by many people should move to OAuth; with a
 * handful of athletes each pasting their own key, a key is the honest first
 * step, and the stored shape does not change when that day comes.
 *
 * The pure parts live here and are tested: validating what the athlete pasted,
 * and mapping intervals.icu's wellness record onto our `wellness_data` row.
 * The network calls are thin wrappers over `fetch`.
 */

export const ICU_API_BASE = "https://intervals.icu/api/v1";

/** A request that intervals.icu answered with something other than success. */
export class IcuError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "IcuError";
  }
  /** The key was refused — only a new key fixes it, retrying never will. */
  get unauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

// ─── What the athlete pastes ─────────────────────────────────────────────────

/**
 * The athlete id, from whatever the athlete copied.
 *
 * The settings page shows it as `i123456`, the address bar carries it inside a
 * URL, and older accounts use bare digits. All three are the same athlete. An
 * empty field becomes "0", which intervals.icu resolves to the owner of the key.
 */
export function normalizeAthleteId(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (s === "") return "0";
  const inUrl = s.match(/athlete\/(i?\d+)/i);
  const candidate = (inUrl ? inUrl[1] : s).toLowerCase();
  return /^i?\d{1,12}$/.test(candidate) ? candidate : null;
}

/**
 * Whether a pasted string could be an API key.
 *
 * Only a shape check — the real test is asking intervals.icu, which the connect
 * route does before storing anything. This exists to catch the athlete pasting
 * their athlete id, or their password, into the wrong field.
 */
export function looksLikeApiKey(input: string | null | undefined): boolean {
  const s = (input ?? "").trim();
  return s.length >= 16 && s.length <= 128 && /^[A-Za-z0-9_-]+$/.test(s);
}

export function icuAuthHeader(apiKey: string): string {
  // Basic auth with the literal username "API_KEY", as intervals.icu documents.
  return `Basic ${Buffer.from(`API_KEY:${apiKey.trim()}`).toString("base64")}`;
}

// ─── Mapping onto wellness_data ──────────────────────────────────────────────

/** The slice of an intervals.icu wellness record this app reads. */
export interface IcuWellness {
  /** The local calendar day, YYYY-MM-DD. */
  id: string;
  sleepSecs?:     number | null;
  sleepScore?:    number | null;
  sleepQuality?:  number | null;
  avgSleepingHR?: number | null;
  hrv?:           number | null;   // rMSSD, ms
  hrvSDNN?:       number | null;
  restingHR?:     number | null;
  readiness?:     number | null;
  stress?:        number | null;
  spO2?:          number | null;
  respiration?:   number | null;
  steps?:         number | null;
  weight?:        number | null;
  bodyFat?:       number | null;
  vo2max?:        number | null;
  kcalConsumed?:  number | null;
}

export interface IcuWellnessRow {
  date:          string;
  sleep_seconds: number | null;
  sleep_score:   number | null;
  hrv_ms:        number | null;
  resting_hr:    number | null;
  raw:           Record<string, number> | null;
}

const inRange = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/**
 * Fields kept for later but not yet read by any engine.
 *
 * `readiness` is the tempting one — for a Garmin athlete it should be Training
 * Readiness, the watch's own composite — but nothing in intervals.icu's
 * specification says which vendor's number lands there. Feeding an unverified
 * 0–100 into the readiness score at the weight of a recovery estimate would be
 * guessing with the athlete's training day. It is stored, and wired once real
 * values have been checked against the Garmin Connect app.
 */
const KEPT = [
  "readiness", "sleepQuality", "avgSleepingHR", "hrvSDNN", "stress",
  "spO2", "respiration", "steps", "weight", "bodyFat", "vo2max", "kcalConsumed",
] as const;

/**
 * One intervals.icu wellness record as our row.
 *
 * A zero is intervals.icu saying "nothing recorded", not a measurement — no one
 * slept zero seconds or has a resting heart rate of zero — so zeros are treated
 * as absent rather than scored as the worst possible night.
 */
export function toWellnessRow(rec: IcuWellness): IcuWellnessRow | null {
  if (!rec || typeof rec.id !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rec.id)) return null;

  const sleep = inRange(rec.sleepSecs, 1, 86_400);
  const score = inRange(rec.sleepScore, 1, 100);
  const hrv   = inRange(rec.hrv, 1, 400);
  const rhr   = inRange(rec.restingHR, 25, 120);

  const raw: Record<string, number> = {};
  for (const k of KEPT) {
    const n = Number(rec[k]);
    if (rec[k] != null && Number.isFinite(n) && n !== 0) raw[k] = n;
  }

  return {
    date:          rec.id,
    sleep_seconds: sleep != null ? Math.round(sleep) : null,
    sleep_score:   score != null ? Math.round(score) : null,
    hrv_ms:        hrv != null ? Math.round(hrv * 10) / 10 : null,
    resting_hr:    rhr != null ? Math.round(rhr) : null,
    raw:           Object.keys(raw).length > 0 ? raw : null,
  };
}

/** True when a row carries no signal the readiness engine can use. */
export function isEmptyIcuRow(row: IcuWellnessRow): boolean {
  return row.sleep_seconds == null && row.sleep_score == null
    && row.hrv_ms == null && row.resting_hr == null;
}

/** The inclusive date window ending `today`, `days` long. */
export function wellnessWindow(today: string, days: number): { oldest: string; newest: string } {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - Math.max(0, days - 1));
  return { oldest: d.toISOString().slice(0, 10), newest: today };
}

// ─── Reading ─────────────────────────────────────────────────────────────────

async function icuGet<T>(path: string, apiKey: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${ICU_API_BASE}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: icuAuthHeader(apiKey), Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new IcuError(res.status, `intervals.icu ${path} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  return res.json() as Promise<T>;
}

/** The athlete behind a key — also the cheapest way to prove the key works. */
export async function fetchIcuAthlete(
  athleteId: string, apiKey: string,
): Promise<{ id: string; name: string | null }> {
  const a = await icuGet<{ id?: string | number; name?: string | null; firstname?: string | null }>(
    `/athlete/${encodeURIComponent(athleteId)}`, apiKey,
  );
  return {
    id: String(a.id ?? athleteId),
    name: a.name?.trim() || a.firstname?.trim() || null,
  };
}

export async function fetchIcuWellness(
  athleteId: string, apiKey: string, oldest: string, newest: string,
): Promise<IcuWellness[]> {
  const data = await icuGet<IcuWellness[] | null>(
    `/athlete/${encodeURIComponent(athleteId)}/wellness`, apiKey, { oldest, newest },
  );
  return Array.isArray(data) ? data : [];
}
