/**
 * Email link landing point — confirmation and password recovery both come here.
 *
 * `next` decides where the user ends up (the recovery email points at
 * /auth/reset). Failures redirect back to /auth with a code the login screen
 * translates, instead of dropping the user on a blank form.
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/** Only in-app paths — never bounce an auth session to an external URL. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const isRecovery = next.startsWith("/auth/reset");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  const failure = isRecovery ? "recovery_failed" : "auth_callback_failed";
  return NextResponse.redirect(`${origin}/auth?error=${failure}`);
}
