/**
 * Supplements.
 *   GET    /api/health/supplements        → active supplements
 *   POST   /api/health/supplements {…}     → add (or update if id given)
 *   DELETE /api/health/supplements?id=xxx  → remove
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Supplement } from "@/types";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("supplements")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at");

  return NextResponse.json({ supplements: (data ?? []) as Supplement[] });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = (body?.name as string | undefined)?.trim();
  if (!name) return NextResponse.json({ error: "Informe o nome" }, { status: 400 });

  const row = {
    user_id: user.id,
    name:    name.slice(0, 80),
    dosage:  typeof body.dosage === "string" ? body.dosage.slice(0, 40) || null : null,
    timing:  typeof body.timing === "string" ? body.timing.slice(0, 40) || null : null,
    notes:   typeof body.notes === "string" ? body.notes.slice(0, 200) || null : null,
    active:  true,
  };

  const q = body?.id
    ? supabase.from("supplements").update(row).eq("id", body.id).eq("user_id", user.id).select().single()
    : supabase.from("supplements").insert(row).select().single();

  const { data, error } = await q;
  if (error) {
    console.error("[supplements] save error:", error);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
  return NextResponse.json({ supplement: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Soft-delete (keep history)
  await supabase.from("supplements").update({ active: false }).eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
