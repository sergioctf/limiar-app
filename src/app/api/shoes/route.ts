/**
 * GET  /api/shoes  → the athlete's shoes, each with its accumulated mileage
 * POST /api/shoes  → register a shoe
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeShoeInput, wearOf, type Shoe } from "@/lib/shoes";
import { localDateStr } from "@/lib/week";

/**
 * Every shoe plus the run distances tagged to it — one round trip each.
 *
 * Not exported: a Next route file may only export HTTP handlers, and exporting
 * a helper from one fails the build with a type error about `never`.
 */
async function loadShoes(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ shoes: Shoe[]; runs: Array<{ shoe_id: string | null; distance_km: number | null }> }> {
  const [shoesRes, runsRes] = await Promise.all([
    supabase.from("shoes").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    supabase.from("runs").select("shoe_id, distance_km").eq("user_id", userId).not("shoe_id", "is", null),
  ]);

  return {
    shoes: (shoesRes.data ?? []) as Shoe[],
    runs: runsRes.data ?? [],
  };
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { shoes, runs } = await loadShoes(supabase, user.id);
    return NextResponse.json({
      shoes: shoes.map(s => ({ ...s, wear: wearOf(s, runs) })),
      // Sent alongside because the plate rule needs it: a hard session two weeks
      // out is a rehearsal, the same session in March is just training. Making
      // the client fetch races separately to answer one boolean is a round trip
      // for nothing.
      daysToRace: await daysToNextRace(supabase, user.id),
    });
  } catch {
    // The table may not exist yet — an empty list is a better answer than a
    // crashed Treinador page.
    return NextResponse.json({ shoes: [], daysToRace: null });
  }
}

/**
 * Days until the athlete's next future race, or null when there isn't one.
 *
 * Compared as calendar dates in São Paulo rather than as instants: a race on
 * Sunday is "in 2 days" all Friday long, and subtracting timestamps makes that
 * flip at whatever hour the row happened to be written.
 */
async function daysToNextRace(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number | null> {
  const today = localDateStr(new Date());
  try {
    const { data } = await supabase
      .from("races").select("race_date")
      .eq("user_id", userId)
      .gte("race_date", today)
      .order("race_date", { ascending: true })
      .limit(1);

    const next = data?.[0]?.race_date as string | undefined;
    if (!next) return null;

    const ms = Date.parse(`${next}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`);
    return Math.round(ms / 86_400_000);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clean = normalizeShoeInput(await request.json().catch(() => null));
  if (!clean) {
    return NextResponse.json({ error: "Dê um nome ao tênis." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("shoes").insert({ ...clean, user_id: user.id }).select().single();

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar. A tabela shoes existe?" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, shoe: data });
}
