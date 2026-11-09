import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STRAVA_OAUTH_COOKIE } from "@/lib/strava-oauth";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth", request.url));

  const clientId    = (process.env.STRAVA_CLIENT_ID ?? "").trim();
  const redirectUri = `${request.nextUrl.origin}/api/strava/callback`;

  const stravaAuthUrl = new URL("https://www.strava.com/oauth/authorize");
  stravaAuthUrl.searchParams.set("client_id", clientId);
  stravaAuthUrl.searchParams.set("redirect_uri", redirectUri);
  stravaAuthUrl.searchParams.set("response_type", "code");
  stravaAuthUrl.searchParams.set("approval_prompt", "force");
  // Read-only, deliberately. Limiar pulls what the athlete's watch already
  // recorded; it never publishes back. Asking for write permission the app does
  // not use is a consent screen nobody should have to weigh.
  stravaAuthUrl.searchParams.set("scope", "read,activity:read_all");

  const state = crypto.randomUUID();
  const from = request.nextUrl.searchParams.get("from");
  stravaAuthUrl.searchParams.set("state", state);
  const response = NextResponse.redirect(stravaAuthUrl);
  response.cookies.set(STRAVA_OAUTH_COOKIE, JSON.stringify({ state, userId: user.id, from }), {
    httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 600,
  });
  return response;
}
