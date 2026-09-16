/**
 * POST /api/strength/log  { date, sets: [{ exerciseId, setIndex, weightKg, reps, rir }] }
 *   Records what was actually lifted. Idempotent per (date, exercise, set).
 *
 * GET /api/strength/log?exercises=id1,id2
 *   Recent history plus the load suggestion for each exercise.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nextTarget, summarizeSessions, type LoggedSet } from "@/lib/strength-progression";
import { exerciseById } from "@/lib/exercises";
import { normalizeStrengthPrefs } from "@/lib/strength-prefs";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date : new Date().toISOString().slice(0, 10);

  const rawSets = Array.isArray(body?.sets) ? body.sets : [];
  if (rawSets.length === 0) {
    return NextResponse.json({ error: "Nenhuma série para registrar." }, { status: 400 });
  }

  const rows = rawSets
    .filter((s: Record<string, unknown>) => typeof s?.exerciseId === "string")
    .slice(0, 100)
    .map((s: Record<string, unknown>, i: number) => {
      const num = (v: unknown, min: number, max: number) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= min && n <= max ? n : null;
      };
      return {
        user_id:     user.id,
        date,
        exercise_id: s.exerciseId as string,
        set_index:   num(s.setIndex, 1, 50) ?? i + 1,
        weight_kg:   num(s.weightKg, 0, 1000),
        reps:        num(s.reps, 0, 200),
        rir:         num(s.rir, 0, 10),
      };
    })
    // A set with neither reps nor load carries no information.
    .filter((r: { reps: number | null; weight_kg: number | null }) => r.reps != null || r.weight_kg != null);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Preencha ao menos repetições ou carga." }, { status: 400 });
  }

  const { error } = await supabase
    .from("strength_logs")
    .upsert(rows, { onConflict: "user_id,date,exercise_id,set_index" });

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar. A tabela strength_logs já existe?" },
      { status: 500 },
    );
  }

  // ── Carry the session forward ─────────────────────────────────────────────
  //
  // The athlete edited what they actually did — swapped a machine that was
  // taken, dropped a movement, added another. Storing that as the day's roster
  // is what stops the plan from re-proposing the same substitution every single
  // week. `keep: false` covers the genuinely one-off session.
  let rosterUpdated = false;
  const dayKey = body?.dayKey as string | undefined;
  const roster = Array.isArray(body?.exercises)
    ? (body.exercises as unknown[]).filter((v): v is string => typeof v === "string")
    : null;

  if (body?.keep !== false && dayKey && roster && roster.length > 0) {
    try {
      const { data } = await supabase
        .from("profiles").select("strength_prefs").eq("id", user.id).single();

      if (data?.strength_prefs) {
        const prefs = normalizeStrengthPrefs(data.strength_prefs);
        const target = prefs.days.find(d => d.day === dayKey);
        const same = target?.exercises
          && target.exercises.length === roster.length
          && target.exercises.every((id, i) => id === roster[i]);

        if (target && !same) {
          target.exercises = roster;
          const { error: saveError } = await supabase
            .from("profiles")
            .update({ strength_prefs: normalizeStrengthPrefs(prefs) })
            .eq("id", user.id);
          rosterUpdated = !saveError;
        }
      }
    } catch {
      // The log is the important part; carrying it forward is a bonus.
    }
  }

  return NextResponse.json({ ok: true, saved: rows.length, rosterUpdated });
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ids = (request.nextUrl.searchParams.get("exercises") ?? "")
    .split(",").map(s => s.trim()).filter(Boolean).slice(0, 30);

  if (ids.length === 0) return NextResponse.json({ history: {} });

  const since = new Date();
  since.setDate(since.getDate() - 120);

  let rows: LoggedSet[] = [];
  try {
    const { data } = await supabase
      .from("strength_logs")
      .select("date, exercise_id, set_index, weight_kg, reps, rir")
      .eq("user_id", user.id)
      .in("exercise_id", ids)
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: false });

    rows = ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      date:       r.date as string,
      exerciseId: r.exercise_id as string,
      setIndex:   r.set_index as number,
      weightKg:   r.weight_kg as number | null,
      reps:       r.reps as number | null,
      rir:        r.rir as number | null,
    }));
  } catch {
    return NextResponse.json({ history: {}, storageReady: false });
  }

  const history: Record<string, unknown> = {};
  for (const id of ids) {
    const sets = rows.filter(r => r.exerciseId === id);
    const ex = exerciseById(id);
    history[id] = {
      sessions: summarizeSessions(sets, ex?.reps).slice(0, 5),
      advice: nextTarget(sets, {
        reps: ex?.reps ?? [8, 12],
        rir: 2,
        exerciseId: id,
      }),
    };
  }

  return NextResponse.json({ history, storageReady: true });
}
