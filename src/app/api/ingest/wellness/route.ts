/**
 * POST /api/ingest/wellness
 * Token-authenticated wellness ingestion for the iOS Shortcut (reads Apple
 * Health, which Garmin Connect feeds). No login session needed.
 *
 * Auth: a per-user `token` in the body or `Authorization: Bearer <token>`.
 *
 * Two body formats are accepted, because building JSON inside the Shortcuts app
 * is error-prone:
 *   • JSON — { token?, source?, days: [ {...} ] } or a single flat day object
 *   • form (application/x-www-form-urlencoded) — flat fields:
 *     token, date, sleep_seconds, sleep_score, hrv_ms, hrv_status,
 *     resting_hr, stress_avg, body_battery, active_kcal, resting_kcal
 *
 * Sleep may also be sent as `sleep_hours` or `sleep_minutes` — the Shortcuts
 * health actions return durations in those units far more naturally.
 *
 * Fields left out are left alone. A shortcut that sends only the day's calories
 * must not erase the night that intervals.icu delivered that morning.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { upsertWellness } from "@/lib/wellness-upsert";
import { athleteDateStr } from "@/lib/week";
import { hashWellnessToken } from "@/lib/wellness-token";

const SOURCES = new Set(["healthconnect", "healthkit", "garmin", "ios_shortcut", "manual_import"]);

/*
 * An absent field is null, not zero.
 *
 * `Number("")` and `Number(null)` are both 0, which sits inside most of these
 * ranges — so a shortcut that left a field empty used to record a sleep score
 * of 0 and, now that merges keep every non-null value, would record 0 kcal over
 * a real measurement.
 */
function num(v: unknown): number {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim().replace(",", ".");
  return s === "" ? NaN : Number(s);
}
function int(v: unknown, min: number, max: number): number | null {
  const n = num(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n);
}
function flt(v: unknown, min: number, max: number): number | null {
  const n = num(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 10) / 10;
}

/** Sleep can arrive as seconds, minutes or hours — normalize to seconds. */
function sleepSeconds(d: Record<string, unknown>): number | null {
  const direct = int(d.sleep_seconds, 0, 86400);
  if (direct !== null) return direct;
  const mins = Number(d.sleep_minutes);
  if (Number.isFinite(mins) && mins > 0 && mins <= 1440) return Math.round(mins * 60);
  const hours = Number(d.sleep_hours);
  if (Number.isFinite(hours) && hours > 0 && hours <= 24) return Math.round(hours * 3600);
  return null;
}

/** Read the request body as JSON or as a URL-encoded form. */
async function parseBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const obj: Record<string, unknown> = {};
      form.forEach((v, k) => { obj[k] = typeof v === "string" ? v : String(v); });
      return obj;
    } catch { return null; }
  }

  // Default to JSON; fall back to parsing a raw form-encoded string.
  const raw = await request.text().catch(() => "");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    try {
      const params = new URLSearchParams(raw);
      const obj: Record<string, unknown> = {};
      params.forEach((v, k) => { obj[k] = v; });
      return Object.keys(obj).length > 0 ? obj : null;
    } catch { return null; }
  }
}

export async function POST(request: NextRequest) {
  const body = await parseBody(request);
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = (body.token as string | undefined) || bearer;
  if (!token || token.length < 16) return NextResponse.json({ error: "Token ausente" }, { status: 401 });

  /*
    O banco guarda a impressão digital do token, não ele — ver
    `src/lib/wellness-token.ts`. Então o que chega é hasheado aqui e comparado
    com o que está lá. Quem consegue ler a coluna lê um SHA-256, que não
    autentica coisa nenhuma.
  */
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("wellness_token", hashWellnessToken(token))
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  const source = SOURCES.has(body.source as string) ? (body.source as string) : "ios_shortcut";
  const daysInput: Record<string, unknown>[] = Array.isArray(body.days)
    ? (body.days as Record<string, unknown>[])
    : [body];

  const rows = daysInput.slice(0, 60).map(d => {
    // Shortcuts often sends an ISO timestamp — keep just the calendar date.
    const rawDate = typeof d.date === "string" ? d.date.slice(0, 10) : "";
    // No date means today on the athlete's calendar. The UTC date is tomorrow
    // from 21:00 in Brazil, which is exactly when an end-of-day calorie shortcut
    // runs — every evening's energy would have been filed under the next day.
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : athleteDateStr();
    return {
      user_id:       profile.id,
      date,
      sleep_seconds: sleepSeconds(d),
      sleep_score:   int(d.sleep_score, 0, 100),
      hrv_ms:        flt(d.hrv_ms, 1, 400),
      hrv_status:    typeof d.hrv_status === "string" ? d.hrv_status.slice(0, 20) : null,
      resting_hr:    int(d.resting_hr, 25, 120),
      stress_avg:    int(d.stress_avg, 0, 100),
      body_battery:  int(d.body_battery, 0, 100),
      // Apple Health energy arrives with decimals and, from some Shortcuts
      // locales, with a comma. The ceilings are generous on purpose: an
      // ultramarathon day really can burn 8000 active kcal.
      active_kcal:   int(d.active_kcal, 0, 15000),
      resting_kcal:  int(d.resting_kcal, 0, 5000),
      source,
    };
  });

  const { saved, error } = await upsertWellness(admin, rows);

  if (error) {
    console.error("[ingest/wellness] upsert error:", error);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved });
}
