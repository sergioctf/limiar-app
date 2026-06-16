/**
 * Wellness ingestion (from the native Health Connect / Apple Health bridge).
 *   GET  /api/health/wellness          → last 30 days
 *   POST /api/health/wellness {…|days[]} → upsert one day or a batch
 *
 * The native app reads Garmin-sourced sleep/HRV/RHR/stress/body-battery from
 * Health Connect (Android) / HealthKit (iOS) and posts them here.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { WellnessData } from "@/types";

const SOURCES = new Set(["healthconnect", "healthkit", "garmin", "manual_import"]);

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

function normalize(raw: Record<string, unknown>, userId: string, source: string) {
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
    ? raw.date : new Date().toISOString().slice(0, 10);
  return {
    user_id:       userId,
    date,
    sleep_seconds: int(raw.sleep_seconds, 0, 86400),
    sleep_score:   int(raw.sleep_score, 0, 100),
    hrv_ms:        flt(raw.hrv_ms, 1, 400),
    hrv_status:    typeof raw.hrv_status === "string" ? raw.hrv_status.slice(0, 20) : null,
    resting_hr:    int(raw.resting_hr, 25, 120),
    stress_avg:    int(raw.stress_avg, 0, 100),
    body_battery:  int(raw.body_battery, 0, 100),
    source,
    raw:           raw.raw ?? null,
  };
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data } = await supabase
    .from("wellness_data")
    .select("*")
    .eq("user_id", user.id)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: false });

  return NextResponse.json({ wellness: (data ?? []) as WellnessData[] });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const source = SOURCES.has(body.source) ? body.source : "manual_import";
  const daysInput: Record<string, unknown>[] = Array.isArray(body.days) ? body.days : [body];
  const rows = daysInput.slice(0, 60).map(d => normalize(d, user.id, source));

  const { data, error } = await supabase
    .from("wellness_data")
    .upsert(rows, { onConflict: "user_id,date" })
    .select();

  if (error) {
    console.error("[health/wellness] upsert error:", error);
    return NextResponse.json({ error: "Falha ao salvar wellness" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: data?.length ?? 0 });
}
