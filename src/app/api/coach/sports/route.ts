/**
 * GET  /api/coach/sports          → { sports: SportKey[] }
 * PUT  /api/coach/sports { sports } → updates the athlete's practiced sports
 *
 * Practiced sports drive the weekly training plan (which workouts it may include).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePracticedSports, isPrimarySport } from "@/lib/sports";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("sports").eq("id", user.id).single();

  return NextResponse.json({ sports: normalizePracticedSports(profile?.sports) });
}

export async function PUT(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const raw = Array.isArray(body?.sports) ? body.sports : [];

  // Tier 2 is accepted here too, but it cannot stand alone: the coach still has
  // to have something to periodise. Rejecting outright is friendlier than
  // silently re-adding corrida under someone who just unticked it.
  if (!raw.some(isPrimarySport)) {
    return NextResponse.json(
      { error: "Escolha ao menos um esporte principal: corrida, natação, ciclismo ou musculação." },
      { status: 400 },
    );
  }

  const sports = normalizePracticedSports(raw);
  const { error } = await supabase
    .from("profiles").update({ sports }).eq("id", user.id);

  if (error) return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  return NextResponse.json({ ok: true, sports });
}
