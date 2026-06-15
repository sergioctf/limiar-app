import type { Run } from "@/types";
import { metersToKm, mpsToSecPerKm } from "@/lib/utils";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

export interface StravaToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname: string; lastname: string };
}

/** Error with the HTTP status attached so callers can react (401 vs 429 vs 5xx). */
export class StravaApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "StravaApiError";
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * fetch with retry/backoff for transient Strava failures.
 * Retries network errors, 429 (respecting Retry-After) and 5xx — up to 3 attempts.
 * 4xx other than 429 fail immediately (retrying won't help).
 */
async function stravaFetch(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;

      // Client errors (expired token, bad request): no point retrying
      if (res.status !== 429 && res.status < 500) {
        throw new StravaApiError(`Strava respondeu ${res.status}`, res.status);
      }

      lastError = new StravaApiError(`Strava respondeu ${res.status}`, res.status);
      if (attempt === attempts) break;

      const retryAfter = Number(res.headers.get("Retry-After")) || 0;
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 500 * Math.pow(2, attempt - 1));
    } catch (err) {
      if (err instanceof StravaApiError && err.status !== 429 && err.status < 500) throw err;
      lastError = err;
      if (attempt === attempts) break;
      await sleep(500 * Math.pow(2, attempt - 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new StravaApiError("Falha de rede ao falar com o Strava", 0);
}

export async function refreshStravaToken(
  refreshToken: string
): Promise<StravaToken> {
  const res = await stravaFetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID?.trim(),
      client_secret: process.env.STRAVA_CLIENT_SECRET?.trim(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  return res.json();
}

export async function getStravaActivities(
  accessToken: string,
  page = 1,
  perPage = 50,
  after?: number
): Promise<unknown[]> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    ...(after ? { after: String(after) } : {}),
  });
  const res = await stravaFetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export async function getStravaActivity(
  accessToken: string,
  activityId: number
): Promise<unknown> {
  const res = await stravaFetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export interface StravaStreams {
  time?:           number[];   // seconds since start
  distance?:       number[];   // meters, cumulative
  heartrate?:      number[];   // bpm
  altitude?:       number[];   // meters
  velocity_smooth?: number[];  // m/s
  latlng?:         Array<[number, number]>;
  cadence?:        number[];
}

/**
 * Fetch activity streams. One request per activity — call on-demand and cache.
 * Returns the requested stream keys as parallel arrays.
 */
export async function getStravaStreams(
  accessToken: string,
  activityId: number,
): Promise<StravaStreams> {
  const keys = "time,distance,heartrate,altitude,velocity_smooth,latlng,cadence";
  const res = await stravaFetch(
    `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=${keys}&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  // key_by_type=true → { distance: { data: [...] }, heartrate: { data: [...] }, ... }
  const raw = await res.json() as Record<string, { data: unknown[] }>;
  const out: StravaStreams = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v?.data) (out as Record<string, unknown[]>)[k] = v.data;
  }
  return out;
}

/** Convert a raw Strava activity JSON to our internal Run type */
export function stravaActivityToRun(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activity: any,
  userId: string
): Partial<Run> {
  const distKm = metersToKm(activity.distance ?? 0);
  const movingTime = activity.moving_time ?? 0;
  const avgSpeed = activity.average_speed ?? 0;
  const avgPace = avgSpeed > 0 ? mpsToSecPerKm(avgSpeed) : null;

  return {
    user_id: userId,
    strava_activity_id: activity.id,
    source: "strava",
    name: activity.name ?? "Corrida",
    date: activity.start_date_local
      ? activity.start_date_local.split("T")[0]
      : new Date().toISOString().split("T")[0],
    type: detectRunType(activity),
    distance_km: distKm,
    duration_seconds: activity.elapsed_time ?? movingTime,
    moving_time_seconds: movingTime,
    elapsed_time_seconds: activity.elapsed_time ?? null,
    avg_pace_seconds_per_km: avgPace ? Math.round(avgPace) : null,
    avg_speed_mps: avgSpeed || null,
    max_speed_mps: activity.max_speed ?? null,
    avg_hr: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
    max_hr: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
    elevation_gain_m: activity.total_elevation_gain ?? null,
    avg_cadence: activity.average_cadence
      ? Math.round(activity.average_cadence * 2)
      : null,
    calories: activity.calories ?? null,
    suffer_score: activity.suffer_score ?? null,
    map_polyline:
      activity.map?.summary_polyline ?? activity.map?.polyline ?? null,
    device_name: activity.device_name ?? null,
    strava_raw_json: activity,
  };
}

function detectRunType(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activity: any
): Run["type"] {
  const name: string = (activity.name ?? "").toLowerCase();
  const dist = metersToKm(activity.distance ?? 0);

  if (name.includes("prova") || name.includes("race") || name.includes("corrida de rua"))
    return "race";
  if (name.includes("regenerat") || name.includes("recup") || name.includes("recovery"))
    return "recovery";
  if (name.includes("tiro") || name.includes("interval") || name.includes("repetição"))
    return "intervals";
  if (name.includes("tempo") || name.includes("ritmo") || name.includes("limiar"))
    return "tempo";
  if (name.includes("longão") || name.includes("longo") || dist >= 14)
    return "long_run";
  if (name.includes("leve") || name.includes("easy")) return "easy";
  if (dist >= 14) return "long_run";
  return "easy";
}
