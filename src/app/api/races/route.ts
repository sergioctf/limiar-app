import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { computeMetrics } from "@/lib/performance";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("races")
    .select("*")
    .eq("user_id", user.id)
    .order("race_date", { ascending: false });

  if (error) {
    // Graceful fallback if table doesn't exist yet
    if (error.message.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json([], { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    name, race_date, distance_km, time_seconds,
    avg_hr, notes, location, is_target_race,
    bib_number, weather, save_as_test,
  } = body;

  if (!name || !race_date || !distance_km) {
    return NextResponse.json(
      { error: "name, race_date e distance_km são obrigatórios" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: race, error } = await admin
    .from("races")
    .insert({
      user_id:        user.id,
      name:           name.trim(),
      race_date,
      distance_km:    Number(distance_km),
      time_seconds:   time_seconds ? Number(time_seconds) : null,
      avg_hr:         avg_hr       ? Math.round(Number(avg_hr)) : null,
      notes:          notes?.trim()    || null,
      location:       location?.trim() || null,
      is_target_race: is_target_race   ?? false,
      bib_number:     bib_number?.trim() || null,
      weather:        weather?.trim()  || null,
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json(
        { error: "Tabela races não encontrada. Execute o SQL em /api/admin/create-races-table.", migration_needed: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Optionally save as a performance test (updates VDOT/zones in coach page)
  if (save_as_test && time_seconds && distance_km) {
    try {
      const metrics = computeMetrics(
        Number(distance_km) * 1000,
        Number(time_seconds),
        avg_hr ? Number(avg_hr) : undefined
      );
      await admin.from("performance_tests").insert({
        user_id:         user.id,
        test_date:       race_date,
        distance_km:     Number(distance_km),
        time_seconds:    Number(time_seconds),
        avg_hr:          avg_hr ? Math.round(Number(avg_hr)) : null,
        notes:           `Prova: ${name}`,
        vo2max_estimate: metrics.vo2max,
        vdot:            metrics.vdot,
      });
    } catch {
      // Non-fatal — race was saved, performance_test save failed silently
    }
  }

  return NextResponse.json(race, { status: 201 });
}
