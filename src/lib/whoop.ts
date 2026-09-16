/**
 * Whoop — recovery, sleep and resting physiology.
 *
 * What Strava never had: the athlete's state *before* the session. Whoop
 * measures overnight and hands back a recovery percentage, HRV, resting heart
 * rate and sleep stages, which is exactly the input the readiness engine has
 * been missing since it was written.
 *
 * Registration is self-service at developer.whoop.com — unlike Garmin, there is
 * no approval gate — so this is the shortest path from "readiness runs on
 * training load alone" to a number with a body behind it.
 *
 * The pure parts live here and are tested: token expiry arithmetic and the
 * mapping from Whoop's payloads onto our `wellness_data` row. The network calls
 * are thin wrappers over `fetch`.
 *
 * API shapes were current as of early 2026 and Whoop has revised them before
 * (v1 → v2). `WHOOP_API_BASE` and the paths are in one place so a revision is
 * an edit, not a rewrite.
 */

export const WHOOP_AUTH_URL  = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API_BASE  = "https://api.prod.whoop.com/developer/v2";

/**
 * `offline` is not optional despite the name: without it Whoop returns no
 * refresh token, the connection dies in an hour, and the athlete has to
 * reauthorise every time they open the app.
 */
export const WHOOP_SCOPES = [
  "read:recovery",
  "read:sleep",
  "read:cycles",
  "read:profile",
  "offline",
] as const;

export interface WhoopToken {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;   // seconds
  scope?:        string;
}

export interface WhoopConnection {
  access_token:  string;
  refresh_token: string;
  expires_at:    string;   // ISO
}

// ─── Configuration ───────────────────────────────────────────────────────────

export function whoopConfigured(): boolean {
  return Boolean(process.env.WHOOP_CLIENT_ID?.trim() && process.env.WHOOP_CLIENT_SECRET?.trim());
}

/**
 * Where Whoop sends the athlete back.
 *
 * Must match the redirect URI registered in the Whoop dashboard exactly —
 * including the scheme and any trailing slash — or the exchange fails with an
 * error that does not say which part was wrong.
 */
export function whoopRedirectUri(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://limiar-app.vercel.app").replace(/\/+$/, "");
  return `${base}/api/whoop/callback`;
}

export function whoopAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.WHOOP_CLIENT_ID?.trim() ?? "",
    redirect_uri:  whoopRedirectUri(),
    response_type: "code",
    scope:         WHOOP_SCOPES.join(" "),
    // Whoop rejects a state shorter than 8 characters, which is a good rule and
    // an obscure failure when you trip it.
    state,
  });
  return `${WHOOP_AUTH_URL}?${params}`;
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

/**
 * True when the token should be refreshed before use.
 *
 * The 2-minute cushion matters: a token valid for another 20 seconds passes a
 * naive check and then expires mid-request, and the sync fails for a reason
 * nobody can reproduce.
 */
export function tokenNeedsRefresh(expiresAt: string | Date, now: Date = new Date()): boolean {
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return true;
  return expiry.getTime() - now.getTime() < 2 * 60 * 1000;
}

/** Absolute expiry from Whoop's relative `expires_in`. */
export function expiryFrom(expiresIn: number, now: Date = new Date()): string {
  const seconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

async function tokenRequest(body: Record<string, string>): Promise<WhoopToken> {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.WHOOP_CLIENT_ID?.trim() ?? "",
      client_secret: process.env.WHOOP_CLIENT_SECRET?.trim() ?? "",
      ...body,
    }),
  });

  if (!res.ok) {
    throw new Error(`Whoop token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json() as Promise<WhoopToken>;
}

export function exchangeCode(code: string): Promise<WhoopToken> {
  return tokenRequest({
    grant_type:   "authorization_code",
    code,
    redirect_uri: whoopRedirectUri(),
  });
}

export function refreshWhoopToken(refreshToken: string): Promise<WhoopToken> {
  return tokenRequest({
    grant_type:    "refresh_token",
    refresh_token: refreshToken,
    // Whoop wants the scope repeated on refresh; omitting it has been known to
    // return a token without `offline`, quietly ending the connection.
    scope: WHOOP_SCOPES.join(" "),
  });
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export async function whoopGet<T>(
  path: string, accessToken: string, params: Record<string, string> = {},
): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${WHOOP_API_BASE}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Whoop ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Mapping onto wellness_data ──────────────────────────────────────────────

/** The slice of Whoop's recovery record this app reads. */
export interface WhoopRecovery {
  cycle_id?: number;
  created_at?: string;
  score_state?: string;
  score?: {
    recovery_score?: number;        // 0–100
    hrv_rmssd_milli?: number;       // ms
    resting_heart_rate?: number;    // bpm
  } | null;
}

/** The slice of Whoop's sleep record this app reads. */
export interface WhoopSleep {
  start?: string;
  end?: string;
  nap?: boolean;
  score_state?: string;
  score?: {
    sleep_performance_percentage?: number;   // 0–100
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
    } | null;
  } | null;
}

export interface WellnessRow {
  date:           string;
  sleep_seconds:  number | null;
  sleep_score:    number | null;
  hrv_ms:         number | null;
  resting_hr:     number | null;
  recovery_score: number | null;
}

const clampInt = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) return null;
  return Math.round(n);
};

/**
 * The calendar date a night belongs to.
 *
 * Sleep that starts at 23:40 on Monday and ends at 07:10 on Tuesday is
 * Tuesday's night: it is the sleep the athlete trains on Tuesday, and the
 * readiness score for Tuesday has to find it under that date. Keying on the
 * start would file half the year one day early.
 */
export function nightOf(sleep: WhoopSleep): string | null {
  const end = sleep.end ?? sleep.start;
  if (!end) return null;
  const d = new Date(end);
  if (Number.isNaN(d.getTime())) return null;
  // Whoop timestamps are UTC; São Paulo is the athlete's calendar.
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Build the wellness row for one date from whatever Whoop returned.
 *
 * Naps are dropped: a 25-minute afternoon sleep is not the night, and letting
 * it overwrite an eight-hour record would make the sleep score worse the better
 * the athlete rested.
 *
 * `score_state` guards the rest — Whoop publishes records before scoring them,
 * and an unscored recovery has the fields present and meaningless.
 */
export function toWellnessRow(
  date: string,
  recovery: WhoopRecovery | null,
  sleeps: WhoopSleep[],
): WellnessRow {
  const night = sleeps
    .filter(s => !s.nap && s.score_state === "SCORED")
    .sort((a, b) => (b.score?.stage_summary?.total_in_bed_time_milli ?? 0)
                  - (a.score?.stage_summary?.total_in_bed_time_milli ?? 0))[0] ?? null;

  const inBed = night?.score?.stage_summary?.total_in_bed_time_milli ?? null;
  const awake = night?.score?.stage_summary?.total_awake_time_milli ?? 0;
  // Time asleep, not time in bed — an hour spent staring at the ceiling is not
  // recovery, and the readiness engine scores hours of actual sleep.
  const asleepSec = inBed != null ? Math.round((inBed - awake) / 1000) : null;

  const rec = recovery?.score_state === "SCORED" ? recovery.score ?? null : null;

  return {
    date,
    sleep_seconds:  asleepSec != null && asleepSec > 0 ? Math.min(asleepSec, 86_400) : null,
    sleep_score:    clampInt(night?.score?.sleep_performance_percentage, 0, 100),
    // RMSSD in milliseconds. Note this is a different metric from Apple
    // Health's SDNN — which is fine, because readiness compares an athlete
    // against their own baseline and nobody has both sources at once.
    hrv_ms:         (() => {
      const n = Number(rec?.hrv_rmssd_milli);
      return Number.isFinite(n) && n > 0 && n < 400 ? Math.round(n * 10) / 10 : null;
    })(),
    resting_hr:     clampInt(rec?.resting_heart_rate, 25, 120),
    recovery_score: clampInt(rec?.recovery_score, 0, 100),
  };
}

/** True when a row carries nothing worth storing. */
export function isEmptyRow(row: WellnessRow): boolean {
  return row.sleep_seconds == null && row.sleep_score == null
    && row.hrv_ms == null && row.resting_hr == null && row.recovery_score == null;
}
