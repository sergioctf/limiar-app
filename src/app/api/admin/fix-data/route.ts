/**
 * GET /api/admin/fix-data?secret=limiar_admin_2026
 * Correcções pontuais de dados via admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const fixes: Record<string, unknown> = {};

  // Fix: Meia Maratona do Rio — 2024 → 2026-06-07
  const { data: goals, error: goalsErr } = await admin
    .from("goals")
    .update({ race_date: "2026-06-07" })
    .ilike("race_name", "%rio%")
    .select("id, race_name, race_date");

  fixes.goals = goalsErr ? `error: ${goalsErr.message}` : goals;

  // Fix: corridas seed com datas em 2024 → 2026 (shift +2 anos)
  const { data: oldRuns } = await admin
    .from("runs")
    .select("id, date")
    .lt("date", "2025-01-01");

  let runsFixed = 0;
  for (const run of (oldRuns ?? [])) {
    const d = new Date(run.date);
    d.setFullYear(d.getFullYear() + 2);
    await admin.from("runs").update({ date: d.toISOString().slice(0, 10) }).eq("id", run.id);
    runsFixed++;
  }
  fixes.runs_dates_fixed = runsFixed;

  return NextResponse.json(fixes);
}
