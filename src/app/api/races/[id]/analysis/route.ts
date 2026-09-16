/**
 * POST /api/races/[id]/analysis → generate the post-race debrief
 * GET  /api/races/[id]/analysis → fetch the stored debrief, if any
 *
 * Compares predicted vs actual, reads the pacing pattern, and turns it into
 * the focus for the next training block. Saved as a coach report.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { analyzeRace } from "@/lib/race-analysis";
import type { Race } from "@/types";

export const maxDuration = 60;

async function loadRace(userId: string, raceId: string): Promise<Race | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("races").select("*").eq("id", raceId).eq("user_id", userId).maybeSingle();
  return (data as Race | null) ?? null;
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const race = await loadRace(user.id, params.id);
  if (!race) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });

  const result = await analyzeRace(createAdminClient(), user.id, race);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Falha ao analisar." }, { status: 422 });
  }

  return NextResponse.json({ ok: true, numbers: result.numbers, reportId: result.reportId });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const race = await loadRace(user.id, params.id);
  if (!race) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("coach_reports")
    .select("id, summary, strengths, weaknesses, recommendations, full_report, updated_at")
    .eq("user_id", user.id).eq("period_type", "run").eq("period_start", race.race_date)
    .ilike("title", "Análise da prova%")
    .limit(1);

  return NextResponse.json({ analysis: data?.[0] ?? null });
}
