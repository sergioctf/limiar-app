/**
 * GET  /api/coach/memory           → lista notas ativas do atleta
 * POST /api/coach/memory           → cria nova nota
 * DELETE /api/coach/memory?id=xxx  → desativa uma nota
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { AthleteNoteCategory } from "@/types";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  try {
    const { data, error } = await admin
      .from("athlete_notes")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ notes: data ?? [] });
  } catch {
    return NextResponse.json({ notes: [] });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.category || !body?.content) {
    return NextResponse.json({ error: "Missing category or content" }, { status: 400 });
  }

  const validCategories: AthleteNoteCategory[] = ["injury","preference","availability","goal","observation"];
  if (!validCategories.includes(body.category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const { data, error } = await admin
      .from("athlete_notes")
      .insert({
        user_id:  user.id,
        category: body.category as AthleteNoteCategory,
        content:  (body.content as string).trim(),
        source:   (body.source as string | undefined) ?? "manual",
        active:   true,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ note: data });
  } catch (err) {
    console.error("[memory] insert error:", err);
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();
  try {
    await admin
      .from("athlete_notes")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[memory] delete error:", err);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
