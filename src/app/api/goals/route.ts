/**
 * POST /api/goals    → create a new goal (e.g. from a smart-goal suggestion)
 * DELETE /api/goals?id=xxx → remove a goal
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.race_name || !body?.distance_km) {
    return NextResponse.json({ error: "Missing race_name or distance_km" }, { status: 400 });
  }

  const distanceKm = Number(body.distance_km);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return NextResponse.json({ error: "Invalid distance_km" }, { status: 400 });
  }

  const insert = {
    user_id:                     user.id,
    race_name:                   String(body.race_name).slice(0, 120),
    distance_km:                 distanceKm,
    race_date:                   body.race_date ?? null,
    target_time_seconds:         body.target_time_seconds ?? null,
    target_pace_seconds_per_km:  body.target_pace_seconds_per_km ?? null,
    conservative_time_seconds:   body.conservative_time_seconds ?? null,
    likely_time_seconds:         body.likely_time_seconds ?? null,
    optimistic_time_seconds:     body.optimistic_time_seconds ?? null,
    status:                      (body.status as string) ?? "active",
    strategy:                    body.strategy ?? null,
    notes:                       body.notes ?? null,
  };

  const { data, error } = await supabase
    .from("goals")
    .insert(insert)
    .select()
    .single();

  if (error) {
    console.error("[goals] insert error:", error);
    return NextResponse.json({ error: "Failed to create goal" }, { status: 500 });
  }

  return NextResponse.json({ goal: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[goals] delete error:", error);
    return NextResponse.json({ error: "Failed to delete goal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
