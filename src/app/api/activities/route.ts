/**
 * GET  /api/activities?year=YYYY&month=M  → all activities for a month (runs + activities)
 * POST /api/activities                    → create a manual activity (gym session)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end   = new Date(year, month, 0).toISOString().slice(0, 10); // last day of month

  // Fetch runs
  const { data: runs } = await supabase
    .from("runs")
    .select("id, date, name, type, distance_km, duration_seconds, calories, avg_hr, avg_pace_seconds_per_km, source")
    .eq("user_id", user.id)
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null)
    .order("date", { ascending: true });

  // Fetch non-run activities (table may not exist yet — handle gracefully)
  const { data: activities } = await supabase
    .from("activities")
    .select("id, date, name, sport_type, duration_seconds, distance_m, calories, avg_hr, source, exercises, notes")
    .eq("user_id", user.id)
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null)
    .order("date", { ascending: true });

  // Merge into CalendarEntry[]
  const runEntries = (runs ?? []).map((r) => ({
    id:                       r.id,
    date:                     r.date,
    name:                     r.name,
    sport_type:               "Run",
    duration_seconds:         r.duration_seconds,
    distance_km:              r.distance_km,
    calories:                 r.calories,
    avg_hr:                   r.avg_hr,
    source:                   r.source,
    avg_pace_seconds_per_km:  r.avg_pace_seconds_per_km,
    type:                     r.type,
    exercises:                null,
  }));

  const activityEntries = (activities ?? []).map((a) => ({
    id:               a.id,
    date:             a.date,
    name:             a.name,
    sport_type:       a.sport_type,
    duration_seconds: a.duration_seconds,
    distance_km:      a.distance_m ? Math.round(a.distance_m / 10) / 100 : null,
    calories:         a.calories,
    avg_hr:           a.avg_hr,
    source:           a.source,
    exercises:        a.exercises,
    notes:            a.notes,
  }));

  const all = [...runEntries, ...activityEntries]
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json(all);
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    name, sport_type, date, duration_seconds,
    calories, avg_hr, notes, exercises,
  } = body;

  if (!name || !sport_type || !date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("activities").insert({
    user_id:          user.id,
    name:             name.trim(),
    sport_type,
    date,
    duration_seconds: duration_seconds ?? null,
    calories:         calories ?? null,
    avg_hr:           avg_hr ?? null,
    notes:            notes?.trim() || null,
    exercises:        exercises?.length ? exercises : null,
    source:           "manual",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
