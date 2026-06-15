/**
 * Daily health check-in.
 *   GET  /api/health/checkin            → last 30 days (most recent first)
 *   POST /api/health/checkin {…fields}  → upsert today's (or given date's) check-in
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { HealthCheckin } from "@/types";

function clampInt(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data } = await supabase
    .from("health_checkins")
    .select("*")
    .eq("user_id", user.id)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: false });

  return NextResponse.json({ checkins: (data ?? []) as HealthCheckin[] });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10);

  const sleepHours = body.sleep_hours != null && Number.isFinite(Number(body.sleep_hours))
    ? Math.max(0, Math.min(24, Math.round(Number(body.sleep_hours) * 2) / 2))
    : null;

  const areas = Array.isArray(body.soreness_areas)
    ? body.soreness_areas.filter((a: unknown) => typeof a === "string").slice(0, 20)
    : null;

  const row = {
    user_id:        user.id,
    date,
    sleep_hours:    sleepHours,
    sleep_quality:  clampInt(body.sleep_quality, 1, 5),
    energy:         clampInt(body.energy, 1, 5),
    soreness:       clampInt(body.soreness, 1, 5),
    soreness_areas: areas,
    rpe:            clampInt(body.rpe, 1, 10),
    notes:          typeof body.notes === "string" ? body.notes.slice(0, 500) : null,
  };

  const { data, error } = await supabase
    .from("health_checkins")
    .upsert(row, { onConflict: "user_id,date" })
    .select()
    .single();

  if (error) {
    console.error("[health/checkin] upsert error:", error);
    return NextResponse.json({ error: "Falha ao salvar check-in" }, { status: 500 });
  }

  return NextResponse.json({ checkin: data });
}
