/**
 * GET    /api/friends/mute            → ids of friends whose workouts you muted
 * POST   /api/friends/mute {friendId} → stop being notified about them
 * DELETE /api/friends/mute?friendId=  → start again
 *
 * Muting is one-directional and private: it changes what *you* receive, the
 * other person is never told, and it does not touch the friendship. Only the
 * exceptions are stored, so the default stays "notify" without a row per pair.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data } = await supabase
      .from("friend_mutes").select("friend_id").eq("user_id", user.id);
    return NextResponse.json({ muted: (data ?? []).map(m => m.friend_id) });
  } catch {
    // Table not created yet — nobody is muted.
    return NextResponse.json({ muted: [] });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const friendId = (await request.json().catch(() => null))?.friendId;
  if (typeof friendId !== "string" || !friendId) {
    return NextResponse.json({ error: "friendId ausente" }, { status: 400 });
  }

  const { error } = await supabase
    .from("friend_mutes")
    .upsert({ user_id: user.id, friend_id: friendId }, { onConflict: "user_id,friend_id" });

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível silenciar. A tabela friend_mutes existe?" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, muted: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const friendId = request.nextUrl.searchParams.get("friendId");
  if (!friendId) return NextResponse.json({ error: "friendId ausente" }, { status: 400 });

  const { error } = await supabase
    .from("friend_mutes").delete()
    .eq("user_id", user.id).eq("friend_id", friendId);

  if (error) return NextResponse.json({ error: "Falha ao reativar" }, { status: 500 });
  return NextResponse.json({ ok: true, muted: false });
}
