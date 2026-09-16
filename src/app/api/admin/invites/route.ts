/**
 * Invite management — admin only.
 *
 *   GET    /api/admin/invites            → list invites with usage
 *   POST   /api/admin/invites { label, maxUses, expiresInDays } → create one
 *   PATCH  /api/admin/invites { id, active } → activate / revoke
 *
 * Gated by the signed-in user's e-mail (see lib/admin), not by a secret in the
 * URL: this is a normal screen inside the app, used from a logged-in session.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

/** Human-friendly code: readable over the phone, no ambiguous characters. */
function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no I/O/0/1
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (i === 3) out += "-";
  }
  return out;
}

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  try {
    const { data } = await admin
      .from("invite_codes")
      .select("id, code, label, max_uses, used_count, expires_at, active, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    return NextResponse.json({ invites: data ?? [] });
  } catch {
    return NextResponse.json({ invites: [], storageReady: false });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim().slice(0, 120) : "";
  const maxUsesRaw = Number(body?.maxUses);
  const maxUses = Number.isFinite(maxUsesRaw) && maxUsesRaw >= 0 && maxUsesRaw <= 999
    ? Math.round(maxUsesRaw) : 1;

  const daysRaw = Number(body?.expiresInDays);
  const expiresAt = Number.isFinite(daysRaw) && daysRaw > 0
    ? new Date(Date.now() + daysRaw * 86400_000).toISOString()
    : null;

  if (!label) {
    return NextResponse.json({ error: "Dê um nome ao convite (para quem é)." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Retry on the (very unlikely) code collision rather than failing the request.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data, error } = await admin
      .from("invite_codes")
      .insert({ code, label, max_uses: maxUses, expires_at: expiresAt, active: true })
      .select()
      .single();

    if (!error) return NextResponse.json({ ok: true, invite: data });
    if (!/duplicate|unique/i.test(error.message ?? "")) {
      return NextResponse.json(
        { error: "Não foi possível criar o convite. A tabela invite_codes existe?" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: "Falha ao gerar um código único." }, { status: 500 });
}

export async function PATCH(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "Convite não informado." }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("invite_codes").update({ active: body?.active === true }).eq("id", id);

  if (error) return NextResponse.json({ error: "Falha ao atualizar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
