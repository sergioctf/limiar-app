/**
 * PATCH  /api/shoes/:id  → edit a shoe (rename, recategorise, retire)
 * DELETE /api/shoes/:id  → remove it; runs tagged to it keep their history
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeShoeInput } from "@/lib/shoes";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);

  // Retiring is the one edit that arrives on its own, from a single tap. It
  // should not have to resend the name to be accepted.
  if (body && Object.keys(body).length === 1 && typeof body.retired === "boolean") {
    const { error } = await supabase
      .from("shoes").update({ retired: body.retired })
      .eq("id", params.id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const clean = normalizeShoeInput(body);
  if (!clean) return NextResponse.json({ error: "Dê um nome ao tênis." }, { status: 400 });

  // `eq(user_id)` is the guard, not a filter: RLS already scopes the table, and
  // this makes the intent explicit for anyone reading the route.
  const { error } = await supabase
    .from("shoes").update(clean).eq("id", params.id).eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("shoes").delete().eq("id", params.id).eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Falha ao remover" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
