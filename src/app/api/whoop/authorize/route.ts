/**
 * GET /api/whoop/authorize → send the athlete to Whoop to grant access.
 *
 * The `state` is a random value stored in a short-lived cookie and checked on
 * the way back: without it, anyone could hand the athlete a crafted callback
 * URL and attach their own Whoop account to this profile.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoopAuthorizeUrl, whoopConfigured } from "@/lib/whoop";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth", process.env.NEXT_PUBLIC_APP_URL));

  if (!whoopConfigured()) {
    return NextResponse.json(
      { error: "Whoop não configurado. Faltam WHOOP_CLIENT_ID e WHOOP_CLIENT_SECRET." },
      { status: 503 },
    );
  }

  const state = crypto.randomUUID().replace(/-/g, "");
  const res = NextResponse.redirect(whoopAuthorizeUrl(state));

  res.cookies.set("whoop_state", state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",   // must survive the redirect back from Whoop
    maxAge:   600,
    path:     "/",
  });

  return res;
}
