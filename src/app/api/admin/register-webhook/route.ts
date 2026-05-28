/**
 * Endpoint temporário para gerir o webhook do Strava.
 * Protegido por ADMIN_SECRET env var.
 *
 * GET /api/admin/register-webhook?secret=...&action=list    → lista subscrições activas
 * GET /api/admin/register-webhook?secret=...&action=register → regista nova subscrição (default)
 * GET /api/admin/register-webhook?secret=...&action=delete&id=123 → remove subscrição
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const action = request.nextUrl.searchParams.get("action") ?? "register";

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (action === "list") {
    const params = new URLSearchParams({
      client_id:     process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
    });
    const res = await fetch(
      `https://www.strava.com/api/v3/push_subscriptions?${params.toString()}`,
      { method: "GET" }
    );
    const data = await res.json();
    return NextResponse.json({ status: res.status, data });
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (action === "delete") {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id param" }, { status: 400 });
    const params = new URLSearchParams({
      client_id:     process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
    });
    const res = await fetch(
      `https://www.strava.com/api/v3/push_subscriptions/${id}?${params.toString()}`,
      { method: "DELETE" }
    );
    const text = await res.text();
    return NextResponse.json({ status: res.status, data: text || "deleted" });
  }

  // ── REGISTER (default) ────────────────────────────────────────────────────
  const form = new URLSearchParams({
    client_id:     process.env.STRAVA_CLIENT_ID!,
    client_secret: process.env.STRAVA_CLIENT_SECRET!,
    callback_url:  "https://limiar-app.vercel.app/api/strava/webhook",
    verify_token:  process.env.STRAVA_VERIFY_TOKEN!,
  });

  const res = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const data = await res.json();
  return NextResponse.json({ status: res.status, data });
}
