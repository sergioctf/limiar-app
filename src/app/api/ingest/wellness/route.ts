/**
 * POST /api/ingest/wellness
 * Token-authenticated wellness ingestion for the iOS Shortcut (reads Apple
 * Health, which Garmin Connect feeds). No login session needed.
 *
 * Auth: a per-user `token` in the JSON body or `Authorization: Bearer <token>`.
 * Body: { token?, source?, days: [ { date, sleep_seconds, sleep_score, hrv_ms,
 *         hrv_status, resting_hr, stress_avg, body_battery } ] }  (or a single day)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const SOURCES = new Set(["healthconnect", "healthkit", "garmin", "ios_shortcut", "manual_import"]);

function int(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n);
}
function flt(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 10) / 10;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = (body.token as string | undefined) || bearer;
  if (!token || token.length < 16) return NextResponse.json({ error: "Token ausente" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("wellness_token", token)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  const source = SOURCES.has(body.source) ? body.source : "ios_shortcut";
  const daysInput: Record<string, unknown>[] = Array.isArray(body.days) ? body.days : [body];

  const rows = daysInput.slice(0, 60).map(d => {
    const date = typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date)
      ? d.date : new Date().toISOString().slice(0, 10);
    return {
      user_id:       profile.id,
      date,
      sleep_seconds: int(d.sleep_seconds, 0, 86400),
      sleep_score:   int(d.sleep_score, 0, 100),
      hrv_ms:        flt(d.hrv_ms, 1, 400),
      hrv_status:    typeof d.hrv_status === "string" ? d.hrv_status.slice(0, 20) : null,
      resting_hr:    int(d.resting_hr, 25, 120),
      stress_avg:    int(d.stress_avg, 0, 100),
      body_battery:  int(d.body_battery, 0, 100),
      source,
    };
  });

  const { data, error } = await admin
    .from("wellness_data")
    .upsert(rows, { onConflict: "user_id,date" })
    .select("date");

  if (error) {
    console.error("[ingest/wellness] upsert error:", error);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: data?.length ?? 0 });
}
