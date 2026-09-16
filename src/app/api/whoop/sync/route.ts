/**
 * GET  /api/whoop/sync → connection status
 * POST /api/whoop/sync → pull recent recovery and sleep into wellness_data
 *
 * Pull rather than webhook, for now. Whoop's webhooks would be less work per
 * day but need a publicly reachable receiver registered per application, and a
 * pull that runs when the athlete opens the page is enough for data that only
 * changes once a night.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  refreshWhoopToken, tokenNeedsRefresh, expiryFrom, whoopGet,
  nightOf, toWellnessRow, isEmptyRow, whoopConfigured,
  type WhoopRecovery, type WhoopSleep,
} from "@/lib/whoop";
import { athleteDateStr } from "@/lib/week";

/** How far back to pull. Enough to build an HRV baseline in one go. */
const DAYS = 30;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/** A usable access token, refreshing and persisting it when it is close to expiry. */
async function freshToken(admin: Admin, userId: string): Promise<string | null> {
  const { data: conn } = await admin
    .from("whoop_connections").select("*").eq("user_id", userId).maybeSingle();
  if (!conn) return null;

  if (!tokenNeedsRefresh(conn.expires_at)) return conn.access_token;

  const token = await refreshWhoopToken(conn.refresh_token);
  await admin.from("whoop_connections").update({
    access_token:  token.access_token,
    // Whoop rotates the refresh token; keeping the old one would break the
    // next refresh instead of this one, which is far harder to diagnose.
    refresh_token: token.refresh_token ?? conn.refresh_token,
    expires_at:    expiryFrom(token.expires_in),
    updated_at:    new Date().toISOString(),
  }).eq("user_id", userId);

  return token.access_token;
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!whoopConfigured()) return NextResponse.json({ configured: false, connected: false });

  try {
    const { data: conn } = await createAdminClient()
      .from("whoop_connections").select("updated_at").eq("user_id", user.id).maybeSingle();
    return NextResponse.json({
      configured: true,
      connected: Boolean(conn),
      lastSync: conn?.updated_at ?? null,
    });
  } catch {
    return NextResponse.json({ configured: true, connected: false });
  }
}

export async function POST(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!whoopConfigured()) {
    return NextResponse.json({ error: "Whoop não configurado no servidor." }, { status: 503 });
  }

  const admin = createAdminClient();

  let accessToken: string | null;
  try {
    accessToken = await freshToken(admin, user.id);
  } catch (err) {
    console.error("[whoop] refresh falhou:", err);
    // A refresh token Whoop no longer accepts means the athlete revoked access
    // or it simply aged out. Say so plainly — the fix is reconnecting.
    return NextResponse.json({ error: "Conexão expirou. Conecte a Whoop de novo." }, { status: 401 });
  }
  if (!accessToken) return NextResponse.json({ error: "Whoop não conectada." }, { status: 404 });

  const start = new Date(Date.now() - DAYS * 86_400_000).toISOString();

  try {
    const [recoveries, sleeps] = await Promise.all([
      whoopGet<{ records?: WhoopRecovery[] }>("/recovery", accessToken, { start, limit: "25" }),
      whoopGet<{ records?: WhoopSleep[] }>("/activity/sleep", accessToken, { start, limit: "25" }),
    ]);

    // Group both streams by the calendar date they belong to, then build one
    // row per date from whichever halves arrived.
    const sleepByDate = new Map<string, WhoopSleep[]>();
    for (const s of sleeps.records ?? []) {
      const date = nightOf(s);
      if (!date) continue;
      sleepByDate.set(date, [...(sleepByDate.get(date) ?? []), s]);
    }

    const recoveryByDate = new Map<string, WhoopRecovery>();
    for (const r of recoveries.records ?? []) {
      if (!r.created_at) continue;
      const date = new Date(new Date(r.created_at).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
      // Whoop can publish more than one; the last one wins, which is the scored one.
      recoveryByDate.set(date, r);
    }

    const today = athleteDateStr();
    // Array.from around each iterator: the build targets an ES level where
    // spreading a Map iterator needs downlevelIteration.
    const dates = new Set([
      ...Array.from(sleepByDate.keys()),
      ...Array.from(recoveryByDate.keys()),
    ]);

    const rows = Array.from(dates)
      .filter(date => date <= today)
      .map(date => toWellnessRow(date, recoveryByDate.get(date) ?? null, sleepByDate.get(date) ?? []))
      .filter(row => !isEmptyRow(row))
      .map(row => ({ ...row, user_id: user.id, source: "whoop" }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, saved: 0, message: "Nada novo na Whoop." });
    }

    const { error } = await admin
      .from("wellness_data").upsert(rows, { onConflict: "user_id,date" });

    if (error) {
      console.error("[whoop] upsert wellness falhou:", error);
      return NextResponse.json({ error: "Falha ao salvar os dados." }, { status: 500 });
    }

    await admin.from("whoop_connections")
      .update({ updated_at: new Date().toISOString() }).eq("user_id", user.id);

    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (err) {
    console.error("[whoop] sync falhou:", err);
    return NextResponse.json({ error: "Não foi possível ler da Whoop." }, { status: 502 });
  }
}

export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The wellness rows already pulled stay: they are the athlete's history, and
  // deleting them would silently rewrite past readiness scores.
  const { error } = await createAdminClient()
    .from("whoop_connections").delete().eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Falha ao desconectar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
