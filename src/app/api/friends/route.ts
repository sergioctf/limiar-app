/**
 * Friends management.
 *   GET    /api/friends            → accepted friends + pending (incoming/outgoing)
 *   POST   /api/friends {username} → send a friend request by username
 *   PATCH  /api/friends {id}       → accept an incoming request
 *   DELETE /api/friends?id=xxx     → remove friend / decline / cancel request
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Friendship, FriendSummary } from "@/types";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: rows, error } = await supabase
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (error) {
    return NextResponse.json({ friends: [], incoming: [], outgoing: [] });
  }

  const friendships = (rows ?? []) as Friendship[];

  // Collect the "other" user ids to resolve profiles
  const otherIds = Array.from(new Set(
    friendships.map(f => (f.requester_id === user.id ? f.addressee_id : f.requester_id))
  ));

  const profileMap = new Map<string, { name: string | null; username: string | null }>();
  if (otherIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, username")
      .in("id", otherIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { name: p.name, username: p.username });
    }
  }

  const toSummary = (f: Friendship, direction?: "incoming" | "outgoing"): FriendSummary => {
    const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
    const prof = profileMap.get(otherId);
    return {
      friendshipId: f.id,
      userId: otherId,
      name: prof?.name ?? null,
      username: prof?.username ?? null,
      direction,
    };
  };

  const friends  = friendships.filter(f => f.status === "accepted").map(f => toSummary(f));
  const incoming = friendships.filter(f => f.status === "pending" && f.addressee_id === user.id).map(f => toSummary(f, "incoming"));
  const outgoing = friendships.filter(f => f.status === "pending" && f.requester_id === user.id).map(f => toSummary(f, "outgoing"));

  return NextResponse.json({ friends, incoming, outgoing });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const username = (body?.username as string | undefined)?.trim().toLowerCase().replace(/^@/, "");
  if (!username) return NextResponse.json({ error: "Informe um username" }, { status: 400 });

  // Look up the target profile by username (case-insensitive)
  const { data: target } = await supabase
    .from("profiles")
    .select("id, name, username")
    .ilike("username", username)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  if (target.id === user.id) return NextResponse.json({ error: "Você não pode adicionar a si mesmo" }, { status: 400 });

  // Existing relationship in either direction?
  const { data: existing } = await supabase
    .from("friendships")
    .select("id, status, requester_id, addressee_id")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),` +
      `and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`
    )
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") return NextResponse.json({ error: "Vocês já são amigos" }, { status: 409 });
    // If the other person already requested you, accept it instead of creating a duplicate
    if (existing.addressee_id === user.id) {
      await supabase.from("friendships").update({ status: "accepted" }).eq("id", existing.id);
      return NextResponse.json({ ok: true, accepted: true });
    }
    return NextResponse.json({ error: "Pedido já enviado" }, { status: 409 });
  }

  const { error } = await supabase.from("friendships").insert({
    requester_id: user.id,
    addressee_id: target.id,
    status: "pending",
  });

  if (error) {
    console.error("[friends] insert error:", error);
    return NextResponse.json({ error: "Falha ao enviar pedido" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: true, to: { name: target.name, username: target.username } });
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = body?.id as string | undefined;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // RLS ensures only the addressee can update
  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", id)
    .eq("addressee_id", user.id)
    .eq("status", "pending");

  if (error) return NextResponse.json({ error: "Falha ao aceitar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // RLS ensures only involved users can delete
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", id)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (error) return NextResponse.json({ error: "Falha ao remover" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
