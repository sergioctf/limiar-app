/**
 * Per-user wellness ingest token (for the iOS Shortcut).
 *   GET  /api/health/wellness-token        → current token (creates if missing)
 *   POST /api/health/wellness-token {regenerate:true} → rotate it
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";

function newToken(): string {
  return "wlt_" + randomBytes(24).toString("hex");
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("wellness_token").eq("id", user.id).maybeSingle();

  let token = profile?.wellness_token as string | null | undefined;
  if (!token) {
    token = newToken();
    await supabase.from("profiles").update({ wellness_token: token }).eq("id", user.id);
  }
  return NextResponse.json({ token });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (!body?.regenerate) return NextResponse.json({ error: "Nada a fazer" }, { status: 400 });

  const token = newToken();
  const { error } = await supabase.from("profiles").update({ wellness_token: token }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Falha ao gerar token" }, { status: 500 });
  return NextResponse.json({ token });
}
