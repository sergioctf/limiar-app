/**
 * GET /api/coach/training-prefs  → the athlete's weekly layout
 * PUT /api/coach/training-prefs  → update it
 *
 * Which days they run, which days they lift, which run is the long one, and how
 * many quality sessions they want. The plan generator follows this — there is no
 * fixed template.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePrefs, reviewPrefs } from "@/lib/workout-builder";
import { normalizeStrengthPrefs, syncStrengthDays } from "@/lib/strength-prefs";
import type { DayKey } from "@/types";

const DAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function cleanDays(input: unknown): DayKey[] {
  if (!Array.isArray(input)) return [];
  const valid = input.filter((d): d is DayKey => DAYS.includes(d as DayKey));
  return Array.from(new Set(valid)).sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let stored: unknown = null;
  try {
    const { data } = await supabase
      .from("profiles").select("training_prefs").eq("id", user.id).single();
    stored = data?.training_prefs ?? null;
  } catch { /* column may not exist yet — fall back to defaults */ }

  const prefs = normalizePrefs(stored);
  return NextResponse.json({ prefs, warnings: reviewPrefs(prefs) });
}

export async function PUT(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);

  // Merge over what is stored rather than replacing it.
  //
  // More than one card edits this object now — the weekly layout writes days,
  // the sport selector writes `otherDays` — and each holds its own copy of the
  // prefs from whenever it loaded. A straight replace meant whichever saved
  // last erased the other's field with a stale value. Reading first costs one
  // query and makes the order of the taps irrelevant.
  let stored: Record<string, unknown> = {};
  try {
    const { data } = await supabase
      .from("profiles").select("training_prefs").eq("id", user.id).single();
    if (data?.training_prefs && typeof data.training_prefs === "object") {
      stored = data.training_prefs as Record<string, unknown>;
    }
  } catch { /* column may not exist yet */ }

  const merged = { ...stored, ...(body ?? {}) };

  /*
    Recusar semana sem dia de corrida — mas só para quem está mexendo neles.

    A regra existia para o card de preferências, onde desmarcar os sete dias é
    pedir um plano impossível. Aplicada a qualquer PUT, ela passou a barrar
    quem salva **outra** coisa sem ter dias ainda: no primeiro acesso, pular
    "que dias você corre" e responder "km ou minutos" devolvia 400, e a tela
    simplesmente não avançava, sem dizer por quê (15/10).

    Quem não manda `runDays` não está mexendo neles — `normalizePrefs` usa o
    padrão, como sempre fez.
  */
  if (body?.runDays !== undefined && cleanDays(body.runDays).length === 0) {
    return NextResponse.json({ error: "Escolha ao menos um dia de corrida." }, { status: 400 });
  }

  const prefs = normalizePrefs({
    ...merged,
    // Confirmation is sticky: once the athlete has chosen their running days,
    // later edits to (say) strength days must not silently revoke it.
    runDaysConfirmed: body?.runDaysConfirmed === true || stored.runDaysConfirmed === true,
  });

  // The day chips and the detailed muscle config must describe the same week.
  // Ticking a day here creates a real strength day; unticking removes it.
  const update: Record<string, unknown> = { training_prefs: prefs };
  try {
    const { data } = await supabase
      .from("profiles").select("strength_prefs").eq("id", user.id).single();
    if (data?.strength_prefs) {
      const current = normalizeStrengthPrefs(data.strength_prefs);
      const synced = syncStrengthDays(current, prefs.strengthDays);
      if (synced !== current) update.strength_prefs = synced;
    }
  } catch { /* column may not exist yet — training prefs still save */ }

  const { error } = await supabase
    .from("profiles").update(update).eq("id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar. A coluna training_prefs existe?" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, prefs, warnings: reviewPrefs(prefs) });
}
