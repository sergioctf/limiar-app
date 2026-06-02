import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth", request.url));

  const { searchParams } = new URL(request.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/settings?strava_error=access_denied", request.url));
  }

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
    const admin = createAdminClient();

    // Upsert connection (admin bypasses RLS for insert on behalf of user)
    await admin.from("strava_connections").upsert({
      user_id:       user.id,
      athlete_id:    tokenData.athlete?.id,
      access_token:  tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at:    tokenData.expires_at,
      scope:         tokenData.scope ?? "read,activity:read_all",
      updated_at:    new Date().toISOString(),
    }, { onConflict: "user_id" });

    return NextResponse.redirect(new URL("/settings?strava_connected=1", `${request.nextUrl.origin}/`));
  } catch (err) {
    console.error("Strava callback error:", err);
    return NextResponse.redirect(new URL("/settings?strava_error=connection_failed", request.url));
  }
}
