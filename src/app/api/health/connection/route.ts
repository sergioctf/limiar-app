/**
 * POST /api/health/connection { connected: boolean }
 * Toggles whether the user has connected a wearable / Apple Health source.
 * Gates the wellness features on the /health page.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const connected = !!body?.connected;

  const { error } = await supabase
    .from("profiles")
    .update({ health_connected: connected })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: "Falha ao atualizar" }, { status: 500 });
  return NextResponse.json({ ok: true, connected });
}
