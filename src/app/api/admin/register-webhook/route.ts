// env fix deploy: 2026-05-29 18:32:02
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

  // Trim env vars defensively — they can arrive with leading/trailing spaces
  const CLIENT_ID     = (process.env.STRAVA_CLIENT_ID     ?? "").trim();
  const CLIENT_SECRET = (process.env.STRAVA_CLIENT_SECRET ?? "").trim();
  const VERIFY_TOKEN  = (process.env.STRAVA_VERIFY_TOKEN  ?? "").trim();

  const action = request.nextUrl.searchParams.get("action") ?? "register";

  // ── DEBUG ─────────────────────────────────────────────────────────────────
  if (action === "debug") {
    return NextResponse.json({
      client_id:      CLIENT_ID,
      client_id_len:  CLIENT_ID.length,
      secret_prefix:  CLIENT_SECRET.slice(0, 8) + "...",
      secret_len:     CLIENT_SECRET.length,
      verify_token:   VERIFY_TOKEN,
    });
  }

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (action === "list") {
    const params = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
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
    const params = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
    const res = await fetch(
      `https://www.strava.com/api/v3/push_subscriptions/${id}?${params.toString()}`,
      { method: "DELETE" }
    );
    const text = await res.text();
    return NextResponse.json({ status: res.status, data: text || "deleted" });
  }

  // ── REGISTER (default) ────────────────────────────────────────────────────
  const form = new URLSearchParams({
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    callback_url:  "https://limiar-app.vercel.app/api/strava/webhook",
    verify_token:  VERIFY_TOKEN,
  });

  const res = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const data = await res.json();
  return NextResponse.json({ status: res.status, data });
}
