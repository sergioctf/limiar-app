/**
 * Endpoint temporário para registar o webhook do Strava.
 * Chamar uma vez: GET /api/admin/register-webhook
 * Protegido por ADMIN_SECRET env var.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = new URLSearchParams({
    client_id:     process.env.STRAVA_CLIENT_ID!,
    client_secret: process.env.STRAVA_CLIENT_SECRET!,
    callback_url:  `${process.env.NEXT_PUBLIC_APP_URL}/api/strava/webhook`,
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
