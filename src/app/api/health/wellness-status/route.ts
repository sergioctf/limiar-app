/**
 * GET /api/health/wellness-status
 * Reports whether wellness data is actually arriving — closes the loop after
 * setting up the iOS Shortcut, instead of guessing.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { WellnessData } from "@/types";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - 30);

  // `*` rather than a column list: the energy columns only exist once migration
  // 026 has run, and naming them before then would fail the whole status check.
  const { data } = await admin
    .from("wellness_data")
    .select("*")
    .eq("user_id", user.id)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: false });

  const rows = (data ?? []) as WellnessData[];
  const latest = rows[0] ?? null;
  const energy = rows.find(r => r.active_kcal != null || r.resting_kcal != null) ?? null;

  return NextResponse.json({
    connected: rows.length > 0,
    daysLast30: rows.length,
    latest: latest && {
      date:          latest.date,
      source:        latest.source,
      sleepHours:    latest.sleep_seconds ? Math.round((latest.sleep_seconds / 3600) * 10) / 10 : null,
      hrvMs:         latest.hrv_ms,
      restingHr:     latest.resting_hr,
      bodyBattery:   latest.body_battery,
      receivedAt:    latest.created_at,
    },
    energy: energy && {
      date:        energy.date,
      activeKcal:  energy.active_kcal ?? null,
      restingKcal: energy.resting_kcal ?? null,
      updatedAt:   energy.updated_at ?? null,
    },
  });
}
