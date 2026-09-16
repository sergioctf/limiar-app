/**
 * GET /api/whoop/callback → exchange the code and store the connection.
 *
 * Always redirects back to /health with a query flag rather than rendering
 * anything: the athlete came from a button there and should land back there,
 * with the card able to say what happened.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { exchangeCode, expiryFrom, whoopGet } from "@/lib/whoop";

const back = (flag: string) =>
  NextResponse.redirect(
    new URL(`/health?whoop=${flag}`, process.env.NEXT_PUBLIC_APP_URL ?? "https://limiar-app.vercel.app"));

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return back("sem-sessao");

  const url = request.nextUrl;
  if (url.searchParams.get("error")) return back("recusado");

  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.cookies.get("whoop_state")?.value;

  // The state has to match the cookie this browser was given. A missing or
  // different value means the callback did not originate from our authorize
  // route, and attaching a Whoop account on the strength of it would be the
  // classic OAuth account-linking hole.
  if (!code || !state || !expected || state !== expected) return back("estado-invalido");

  try {
    const token = await exchangeCode(code);

    // Whoop's own user id, so a future webhook can be routed to this athlete.
    let whoopUserId: string | null = null;
    try {
      const profile = await whoopGet<{ user_id?: number }>("/user/profile/basic", token.access_token);
      whoopUserId = profile.user_id != null ? String(profile.user_id) : null;
    } catch { /* the connection works without it */ }

    const admin = createAdminClient();
    const { error } = await admin.from("whoop_connections").upsert({
      user_id:       user.id,
      whoop_user_id: whoopUserId,
      access_token:  token.access_token,
      refresh_token: token.refresh_token,
      expires_at:    expiryFrom(token.expires_in),
      scope:         token.scope ?? null,
      updated_at:    new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (error) {
      console.error("[whoop] upsert falhou:", error);
      return back("erro-ao-salvar");
    }

    const res = back("conectado");
    res.cookies.delete("whoop_state");
    return res;
  } catch (err) {
    console.error("[whoop] troca de código falhou:", err);
    return back("falha-na-troca");
  }
}
