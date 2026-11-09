import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { STRAVA_OAUTH_COOKIE, readStravaAttempt } from "@/lib/strava-oauth";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth", request.url));

  const { searchParams } = new URL(request.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  const attempt = readStravaAttempt(request.cookies.get(STRAVA_OAUTH_COOKIE)?.value, user.id);
  function back(flag: string, value: string) {
    const url = new URL(attempt?.from ?? "/settings", request.url);
    url.searchParams.set(flag, value);
    const response = NextResponse.redirect(url);
    response.cookies.delete(STRAVA_OAUTH_COOKIE);
    return response;
  }

  if (!attempt || attempt.state !== searchParams.get("state")) {
    return back("strava_error", "invalid_state");
  }
  if (error || !code) return back("strava_error", "access_denied");

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id:     (process.env.STRAVA_CLIENT_ID     ?? "").trim(),
        client_secret: (process.env.STRAVA_CLIENT_SECRET ?? "").trim(),
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) throw new Error("Token exchange failed");

    const tokenData = await tokenRes.json();
    if (!tokenData.athlete?.id || !tokenData.access_token || !tokenData.refresh_token) {
      throw new Error("Incomplete Strava connection");
    }
    const admin = createAdminClient();

    // Upsert connection (admin bypasses RLS for insert on behalf of user)
    const { error: writeError } = await admin.from("strava_connections").upsert({
      user_id:       user.id,
      athlete_id:    tokenData.athlete?.id,
      access_token:  tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at:    tokenData.expires_at,
      scope:         tokenData.scope ?? "read,activity:read_all",
      updated_at:    new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (writeError) throw new Error("Could not persist Strava connection");
    return back("strava_connected", "1");
  } catch (err) {
    console.error("Strava callback error:", err);
    return back("strava_error", "connection_failed");
  }
}
