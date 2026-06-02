/**
 * GET  /api/performance-tests  — list all tests for the current user
 * POST /api/performance-tests  — create a new test
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { computeMetrics } from "@/lib/performance";

export async function GET(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  try {
    const { data, error } = await admin
      .from("performance_tests")
      .select("*")
      .eq("user_id", user.id)
      .order("test_date", { ascending: false });

    if (error) {
      // Table doesn't exist yet
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json(
          { error: "Table not ready", migration_needed: true },
          { status: 503 }
        );
      }
      throw error;
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[performance-tests GET]", err);
    return NextResponse.json(
      { error: "Table not ready", migration_needed: true },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { test_date, distance_km = 3.0, time_seconds, avg_hr, max_hr, notes } = body;

  // Validation
  if (!test_date) {
    return NextResponse.json({ error: "test_date is required" }, { status: 400 });
  }
  if (!time_seconds || time_seconds <= 0) {
    return NextResponse.json({ error: "time_seconds must be > 0" }, { status: 400 });
  }

  // Compute VDOT & VO2max
  const distanceM = distance_km * 1000;
  const metrics = computeMetrics(distanceM, time_seconds, avg_hr ?? undefined);

  const admin = createAdminClient();

  try {
    const { data, error } = await admin
      .from("performance_tests")
      .insert({
        user_id:          user.id,
        test_date,
        distance_km,
        time_seconds,
        avg_hr:           avg_hr ?? null,
        max_hr:           max_hr ?? null,
        notes:            notes ?? null,
        vo2max_estimate:  metrics.vo2max,
        vdot:             metrics.vdot,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json(
          { error: "Table not ready", migration_needed: true },
          { status: 503 }
        );
      }
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[performance-tests POST]", err);
    return NextResponse.json(
      { error: "Table not ready", migration_needed: true },
      { status: 503 }
    );
  }
}
