/**
 * POST /api/health/nutrition-profile { height_cm, sex, birth_date, calorie_goal }
 * Saves the fields needed for BMR/TDEE onto the user's profile.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const update: Record<string, unknown> = {};

  if (body?.height_cm != null) {
    const h = Number(body.height_cm);
    if (!Number.isFinite(h) || h < 100 || h > 250) return NextResponse.json({ error: "Altura inválida" }, { status: 400 });
    update.height_cm = Math.round(h * 10) / 10;
  }
  if (body?.sex === "M" || body?.sex === "F") update.sex = body.sex;
  if (typeof body?.birth_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.birth_date)) update.birth_date = body.birth_date;
  if (["maintain", "cut", "gain"].includes(body?.calorie_goal)) update.calorie_goal = body.calorie_goal;

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nada para salvar" }, { status: 400 });

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) {
    console.error("[nutrition-profile] update error:", error);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
