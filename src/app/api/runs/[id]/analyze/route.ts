/**
 * POST /api/runs/[id]/analyze
 * Gera análise IA para uma corrida específica e salva em coach_feedback.
 * Requer autenticação.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AiUnavailable, analyzeRun } from "@/lib/ai";
import { notifyFriendsOfWorkout, workoutOf } from "@/lib/friend-notify";
import { sendPushToUser } from "@/lib/push";

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

  /*
   * A run logged by hand announces itself here.
   *
   * The form writes to `runs` straight from the browser and then asks for this
   * analysis, so this is the only server-side moment that knows a manual run
   * exists. The announcement goes before the AI call on purpose: a Groq outage
   * must not be what decides whether a friend hears about the session. Runs
   * that arrived from Strava were already announced on import, and the
   * one-per-day throttle inside is what keeps the second attempt quiet — as it
   * does for a re-analysis pressed on the run's own page.
   */
  await notifyFriendsOfWorkout(admin, user.id, workoutOf("Run", {
    name:        run.name,
    distanceKm:  run.distance_km ?? null,
    durationMin: run.duration_seconds != null ? run.duration_seconds / 60 : null,
    date:        run.date ?? "",
  }), (id, payload) => sendPushToUser(admin, id, payload));

  // Fetch ALL runs for full context — Groq has 128k token window
  const { data: allRuns } = await admin
    .from("runs")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("date", { ascending: false });

  /*
    O erro precisa dizer o que houve.

    Qualquer falha virava "AI analysis failed or API key not set", com 500 —
    inclusive a mais comum de todas, que é o teto de tokens por minuto da Groq.
    Sérgio leu isso como "a IA parou de funcionar"; era "espere vinte segundos"
    (13/10). `AiUnavailable` carrega a diferença até aqui.
  */
  let feedback: string | null;
  try {
    feedback = await analyzeRun(run, allRuns ?? []);
  } catch (err) {
    if (err instanceof AiUnavailable) {
      return NextResponse.json(
        { error: err.mensagem, retryAfterSec: err.retryAfterSec ?? null },
        { status: err.status },
      );
    }
    throw err;
  }
  if (!feedback) {
    return NextResponse.json({ error: "A IA não respondeu agora. Tente de novo em instantes." }, { status: 503 });
  }

  // Save feedback
  await admin
    .from("runs")
    .update({ coach_feedback: feedback, source: run.source === "strava" ? "strava+ai" : run.source })
    .eq("id", params.id);

  return NextResponse.json({ feedback });
}
