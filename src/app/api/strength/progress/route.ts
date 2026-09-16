/**
 * GET /api/strength/progress
 * Load progression per exercise and weekly volume per muscle.
 *
 * This is the payoff for logging: without it, recording sets is bookkeeping.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exerciseById, MUSCLE_LABEL, type MuscleGroup } from "@/lib/exercises";

interface Row {
  date: string; exercise_id: string; weight_kg: number | null; reps: number | null;
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date();
  since.setDate(since.getDate() - 84);   // 12 weeks

  let rows: Row[] = [];
  try {
    const { data } = await supabase
      .from("strength_logs")
      .select("date, exercise_id, weight_kg, reps")
      .eq("user_id", user.id)
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: true });
    rows = (data ?? []) as Row[];
  } catch {
    return NextResponse.json({ exercises: [], muscles: [], storageReady: false });
  }

  if (rows.length === 0) {
    return NextResponse.json({ exercises: [], muscles: [], storageReady: true });
  }

  // ── Load per exercise over time ───────────────────────────────────────────
  const byExercise = new Map<string, Map<string, number>>();   // id → date → top weight
  for (const r of rows) {
    if (r.weight_kg == null || r.weight_kg <= 0) continue;
    const dates = byExercise.get(r.exercise_id) ?? new Map<string, number>();
    dates.set(r.date, Math.max(dates.get(r.date) ?? 0, r.weight_kg));
    byExercise.set(r.exercise_id, dates);
  }

  const exercises = Array.from(byExercise.entries())
    .map(([id, dates]) => {
      const points = Array.from(dates.entries())
        .map(([date, weight]) => ({ date, weight }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const first = points[0]?.weight ?? 0;
      const last  = points[points.length - 1]?.weight ?? 0;
      return {
        exerciseId: id,
        name: exerciseById(id)?.name ?? id,
        points: points.slice(-10),
        sessions: points.length,
        first,
        last,
        deltaKg: Math.round((last - first) * 10) / 10,
        deltaPct: first > 0 ? Math.round(((last - first) / first) * 100) : 0,
      };
    })
    // Most sessions first — those are the lifts the athlete actually tracks.
    .filter(e => e.sessions >= 2)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 8);

  // ── Weekly sets per muscle (last 4 weeks) ─────────────────────────────────
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const cutoff = fourWeeksAgo.toISOString().slice(0, 10);

  const setsPerMuscle = new Map<MuscleGroup, number>();
  for (const r of rows) {
    if (r.date < cutoff) continue;
    const ex = exerciseById(r.exercise_id);
    if (!ex) continue;
    for (const m of ex.primary) setsPerMuscle.set(m, (setsPerMuscle.get(m) ?? 0) + 1);
    for (const m of ex.secondary) setsPerMuscle.set(m, (setsPerMuscle.get(m) ?? 0) + 0.5);
  }

  const muscles: Array<{ muscle: string; label: string; perWeek: number }> = [];
  setsPerMuscle.forEach((total, m) => {
    muscles.push({ muscle: m, label: MUSCLE_LABEL[m], perWeek: Math.round((total / 4) * 10) / 10 });
  });
  muscles.sort((a, b) => b.perWeek - a.perWeek);

  return NextResponse.json({ exercises, muscles, storageReady: true });
}
