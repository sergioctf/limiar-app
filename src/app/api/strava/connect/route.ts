import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  stravaAuthUrl.searchParams.set("scope", "read,activity:read_all");

  return NextResponse.redirect(stravaAuthUrl);
}
