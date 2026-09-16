/**
 * POST /api/auth/invite { code }
 * Checks a signup invite without ever sending the valid codes to the browser.
 *
 * Rate limited per IP: guessing codes should be expensive.
 */
import { NextRequest, NextResponse } from "next/server";
import { validateInvite, redeemInvite, INVITE_MESSAGES } from "@/lib/invites";
import { checkRateLimit, getClientIP } from "@/lib/admin-rate-limit";

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);
  const { allowed, resetAt } = checkRateLimit(`invite:${clientIP}`, 10, 15 * 60 * 1000);

  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Muitas tentativas. Tente de novo mais tarde.", resetAt: new Date(resetAt).toISOString() },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";

  const result = await validateInvite(code);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: INVITE_MESSAGES[result.reason] }, { status: 400 });
  }

  // The invite id is opaque and only useful paired with a completed signup.
  return NextResponse.json({ ok: true, inviteId: result.inviteId });
}

/**
 * PUT /api/auth/invite { inviteId, email }
 * Marks an invite as used once the account was actually created.
 */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const inviteId = typeof body?.inviteId === "string" ? body.inviteId : null;
  const email    = typeof body?.email === "string" ? body.email.slice(0, 200) : null;

  await redeemInvite(inviteId, email);
  return NextResponse.json({ ok: true });
}
