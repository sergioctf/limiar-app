/**
 * GET    /api/integrations/intervals → connection status (never the key)
 * POST   /api/integrations/intervals { apiKey, athleteId? } → verify, store, first sync
 * DELETE /api/integrations/intervals → forget the key, keep the history
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { normalizeAthleteId, looksLikeApiKey, fetchIcuAthlete, IcuError } from "@/lib/intervals";
import { syncIntervals, FIRST_SYNC_DAYS } from "@/lib/intervals-sync";

export const maxDuration = 30;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const [connRes, countRes] = await Promise.all([
    admin.from("intervals_connections")
      .select("athlete_name, last_sync_at, last_error")
      .eq("user_id", user.id).maybeSingle(),
    admin.from("wellness_data").select("date", { count: "exact", head: true })
      .eq("user_id", user.id).eq("source", "intervals"),
  ]);

  // The table does not exist until migration 026 runs. Say so rather than
  // offering a connect button that can only fail.
  if (connRes.error) return NextResponse.json({ available: false, connected: false });

  const conn = connRes.data;
  return NextResponse.json({
    available: true,
    connected: Boolean(conn),
    athleteName: conn?.athlete_name ?? null,
    lastSyncAt:  conn?.last_sync_at ?? null,
    lastError:   conn?.last_error ?? null,
    daysReceived: countRes.count ?? 0,
  });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as { apiKey?: string; athleteId?: string } | null;
  const apiKey = body?.apiKey?.trim() ?? "";
  const athleteId = normalizeAthleteId(body?.athleteId);

  if (!looksLikeApiKey(apiKey)) {
    return NextResponse.json({ error: "Isso não parece uma API key do intervals.icu. Copie de Settings → Developer Settings." }, { status: 400 });
  }
  if (!athleteId) {
    return NextResponse.json({ error: "Athlete ID inválido. Ele aparece como i123456 em Settings." }, { status: 400 });
  }

  // Prove the key works before storing it — a saved key that intervals.icu
  // refuses would only surface tomorrow, as a readiness score with no data.
  let athlete: { id: string; name: string | null };
  try {
    athlete = await fetchIcuAthlete(athleteId, apiKey);
  } catch (err) {
    if (err instanceof IcuError && err.unauthorized) {
      return NextResponse.json({ error: "O intervals.icu recusou essa chave. Confira se copiou inteira." }, { status: 400 });
    }
    if (err instanceof IcuError && err.status === 404) {
      return NextResponse.json({ error: "Atleta não encontrado. Preencha o Athlete ID (i123456) que aparece em Settings." }, { status: 400 });
    }
    console.error("[intervals] verificação falhou:", err);
    return NextResponse.json({ error: "Não consegui falar com o intervals.icu agora. Tente em instantes." }, { status: 502 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("intervals_connections").upsert({
    user_id:      user.id,
    // The resolved id, not "0": the stored connection must not depend on how
    // intervals.icu happens to interpret a placeholder later.
    athlete_id:   athlete.id,
    api_key:      apiKey,
    athlete_name: athlete.name,
    last_error:   null,
  }, { onConflict: "user_id" });

  if (error) {
    console.error("[intervals] salvar conexão falhou:", error);
    return NextResponse.json({ error: "Falha ao salvar a conexão." }, { status: 500 });
  }

  // Connecting a watch is the athlete saying "use it" — the readiness screen
  // should not then ask them to flip a second switch to see the result.
  await admin.from("profiles").update({ health_connected: true }).eq("id", user.id);

  // A year at once, so the HRV baseline and the trend charts exist from the
  // first day rather than after weeks of waiting.
  const sync = await syncIntervals(admin, user.id, FIRST_SYNC_DAYS);

  return NextResponse.json({
    ok: true,
    athleteName: athlete.name,
    saved: sync.saved,
    latest: sync.latest,
    syncError: sync.ok ? null : sync.error,
  });
}

export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The nights already pulled stay: they are the athlete's history, and deleting
  // them would silently rewrite past readiness scores.
  const { error } = await createAdminClient()
    .from("intervals_connections").delete().eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Falha ao desconectar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
