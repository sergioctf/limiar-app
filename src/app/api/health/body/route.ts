/**
 * Body composition measurements.
 *   GET    /api/health/body          → last 180 days (most recent first)
 *   POST   /api/health/body {…}       → upsert by date (weight required)
 *   DELETE /api/health/body?date=…    → remove a day's measurement
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BodyMeasurement } from "@/types";

function num(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date();
  since.setDate(since.getDate() - 180);

  const { data } = await supabase
    .from("body_measurements")
    .select("*")
    .eq("user_id", user.id)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: false });

  return NextResponse.json({ measurements: (data ?? []) as BodyMeasurement[] });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const weight = num(body?.weight_kg, 20, 400);
  if (weight === null) {
    return NextResponse.json({ error: "Informe um peso válido" }, { status: 400 });
  }

  const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10);

  const row = {
    user_id:        user.id,
    date,
    weight_kg:      weight,
    body_fat_pct:   num(body?.body_fat_pct, 1, 70),
    muscle_mass_kg: num(body?.muscle_mass_kg, 5, 150),
    water_pct:      num(body?.water_pct, 20, 80),
    visceral_fat:   num(body?.visceral_fat, 1, 60),
    bone_mass_kg:   num(body?.bone_mass_kg, 0.5, 10),
    bmi:            num(body?.bmi, 8, 70),
    basal_kcal:     body?.basal_kcal != null ? Math.round(Number(body.basal_kcal)) || null : null,
    notes:          typeof body?.notes === "string" ? body.notes.slice(0, 300) : null,
  };

  const { data, error } = await supabase
    .from("body_measurements")
    .upsert(row, { onConflict: "user_id,date" })
    .select()
    .single();

  if (error) {
    console.error("[health/body] upsert error:", error);
    return NextResponse.json({ error: "Falha ao salvar medição" }, { status: 500 });
  }
  return NextResponse.json({ measurement: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = request.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

  await supabase.from("body_measurements").delete().eq("user_id", user.id).eq("date", date);
  return NextResponse.json({ ok: true });
}
