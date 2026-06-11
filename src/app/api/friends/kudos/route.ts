/**
 * POST /api/friends/kudos {runId} → toggle a 🔥 on a friend's run.
 * Verifies the run belongs to an accepted friend (or yourself) before writing.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Friendship } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const runId = body?.runId as string | undefined;
  if (!runId) return NextResponse.json({ error: "Missing runId" }, { status: 400 });

  const admin = createAdminClient();

  // Whose run is it?
  const { data: run } = await admin
    .from("runs")
    .select("id, user_id")
    .eq("id", runId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "Corrida não encontrada" }, { status: 404 });

  // Must be mine or an accepted friend's
  if (run.user_id !== user.id) {
    const { data: rows } = await supabase
      .from("friendships")
      .select("*")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    const friendIds = ((rows ?? []) as Friendship[])
      .map(f => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
    if (!friendIds.includes(run.user_id)) {
      return NextResponse.json({ error: "Apenas corridas de amigos" }, { status: 403 });
    }
  }

  // Toggle
  const { data: existing } = await admin
    .from("kudos")
    .select("id")
    .eq("run_id", runId)
    .eq("sender_id", user.id)
    .maybeSingle();

  if (existing) {
    await admin.from("kudos").delete().eq("id", existing.id);
    return NextResponse.json({ ok: true, kudoed: false });
  }

  const { error } = await admin
    .from("kudos")
    .insert({ run_id: runId, sender_id: user.id });
  if (error) return NextResponse.json({ error: "Falha ao reagir" }, { status: 500 });

  return NextResponse.json({ ok: true, kudoed: true });
}
