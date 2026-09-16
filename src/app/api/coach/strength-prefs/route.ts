/**
 * GET /api/coach/strength-prefs → the athlete's strength configuration
 * PUT /api/coach/strength-prefs → update it
 *
 * Degrades to defaults when the column doesn't exist yet, so the screen works
 * before the migration lands.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeStrengthPrefs, reviewStrengthPrefs } from "@/lib/strength-prefs";
import { normalizePrefs } from "@/lib/workout-builder";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let stored: unknown = null;
  let columnMissing = false;
  try {
    const { data, error } = await supabase
      .from("profiles").select("strength_prefs").eq("id", user.id).single();
    if (error) columnMissing = true;
    else stored = data?.strength_prefs ?? null;
  } catch {
    columnMissing = true;
  }

  const prefs = normalizeStrengthPrefs(stored);
  return NextResponse.json({
    prefs,
    warnings: reviewStrengthPrefs(prefs),
    configured: stored != null,
    storageReady: !columnMissing,
  });
}

export async function PUT(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const prefs = normalizeStrengthPrefs(body);

  if (prefs.days.length === 0) {
    return NextResponse.json(
      { error: "Escolha ao menos um dia com grupos musculares." },
      { status: 400 },
    );
  }

  // Keep the day chips in the training-preferences card in step: the two
  // screens describe one week, and they used to be able to disagree.
  const update: Record<string, unknown> = { strength_prefs: prefs };
  try {
    const { data } = await supabase
      .from("profiles").select("training_prefs").eq("id", user.id).single();
    const training = normalizePrefs(data?.training_prefs);
    const days = prefs.days.map(d => d.day);
    const same = training.strengthDays.length === days.length
      && training.strengthDays.every(d => days.includes(d));
    if (!same) update.training_prefs = { ...training, strengthDays: days };
  } catch { /* column may not exist yet — strength prefs still save */ }

  const { error } = await supabase
    .from("profiles").update(update).eq("id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar. A coluna strength_prefs já existe no banco?" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, prefs, warnings: reviewStrengthPrefs(prefs) });
}
