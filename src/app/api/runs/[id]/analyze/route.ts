/**
 * POST /api/runs/[id]/analyze
 * Gera análise IA para uma corrida específica e salva em coach_feedback.
 * Requer autenticação.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { analyzeRun } from "@/lib/ai";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Fetch the run (must belong to the user)
  const { data: run } = await admin
    .from("runs")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  // Fetch ALL runs for full context — Groq has 128k token window
  const { data: allRuns } = await admin
    .from("runs")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("date", { ascending: false });

  const feedback = await analyzeRun(run, allRuns ?? []);
  if (!feedback) {
    return NextResponse.json({ error: "AI analysis failed or API key not set" }, { status: 500 });
  }

  // Save feedback
  await admin
    .from("runs")
    .update({ coach_feedback: feedback, source: run.source === "strava" ? "strava+ai" : run.source })
    .eq("id", params.id);

  return NextResponse.json({ feedback });
}
