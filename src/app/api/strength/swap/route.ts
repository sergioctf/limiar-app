/**
 * POST /api/strength/swap
 * body: { weekStart, day, fromId, toId }
 *
 * Swap one exercise for another in a lifting session, at the rack.
 *
 * Two writes, and both matter. The stored plan is rewritten so the change is
 * still there tonight — a swap that vanishes on reload is worse than no swap.
 * The day's roster in `strength_prefs` is rewritten so the generator stops
 * proposing the machine that was occupied every single week.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeeklyPlan } from "@/lib/weekly-plan";
import { normalizeStrengthPrefs } from "@/lib/strength-prefs";
import { exerciseById } from "@/lib/exercises";
import type { WeeklyPlanData } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const weekStart = typeof body?.weekStart === "string" ? body.weekStart : null;
  const day       = typeof body?.day === "string" ? body.day : null;
  const fromId    = typeof body?.fromId === "string" ? body.fromId : null;
  const toId      = typeof body?.toId === "string" ? body.toId : null;

  if (!weekStart || !day || !fromId || !toId) {
    return NextResponse.json({ error: "Requisição incompleta." }, { status: 400 });
  }

  const replacement = exerciseById(toId);
  if (!replacement) {
    return NextResponse.json({ error: "Exercício desconhecido." }, { status: 400 });
  }

  // ── 1. The plan the athlete is looking at right now ───────────────────────
  const { plan, reportId } = await loadWeeklyPlan(supabase, user.id, weekStart);
  if (!plan || !reportId) {
    return NextResponse.json({ error: "Plano da semana não encontrado." }, { status: 404 });
  }

  const target = plan.days.find(d => d.day === day);
  const prescribed = target?.strength?.exercises.find(e => e.exerciseId === fromId);
  if (!target?.strength || !prescribed) {
    return NextResponse.json({ error: "Exercício não está nesta sessão." }, { status: 404 });
  }

  // Sets, reps, RIR and rest stay exactly as prescribed. The engine sized them
  // for the day's role in the week, and that role has not changed — only the
  // movement performing it has.
  prescribed.exerciseId = replacement.id;
  prescribed.name       = replacement.name;
  prescribed.cue        = replacement.cue || prescribed.cue;
  prescribed.unilateral = replacement.unilateral;

  const updated: WeeklyPlanData = { ...plan, days: plan.days };

  const { error: planError } = await supabase
    .from("coach_reports")
    .update({ full_report: JSON.stringify(updated) })
    .eq("id", reportId).eq("user_id", user.id);

  if (planError) {
    return NextResponse.json({ error: "Não foi possível salvar a troca." }, { status: 500 });
  }

  // ── 2. Carry it forward ───────────────────────────────────────────────────
  //
  // Best-effort on purpose: the swap the athlete just made is already saved, and
  // failing the whole request because a preference did not persist would undo a
  // change they can see on screen.
  let carriedForward = false;
  try {
    const { data } = await supabase
      .from("profiles").select("strength_prefs").eq("id", user.id).single();

    if (data?.strength_prefs) {
      const prefs = normalizeStrengthPrefs(data.strength_prefs);
      const dayPlan = prefs.days.find(d => d.day === day);
      if (dayPlan) {
        // Seed the roster from the session when the day never had one: it was
        // being chosen automatically, and the athlete has now made a choice.
        const roster = dayPlan.exercises?.length
          ? dayPlan.exercises
          : target.strength.exercises.map(e => e.exerciseId);

        dayPlan.exercises = roster.map(id => (id === fromId ? toId : id));

        const { error } = await supabase
          .from("profiles")
          .update({ strength_prefs: normalizeStrengthPrefs(prefs) })
          .eq("id", user.id);
        carriedForward = !error;
      }
    }
  } catch { /* the swap itself is saved */ }

  return NextResponse.json({
    ok: true,
    carriedForward,
    exercise: {
      exerciseId: replacement.id,
      name:       replacement.name,
      cue:        prescribed.cue,
      unilateral: replacement.unilateral,
    },
  });
}
