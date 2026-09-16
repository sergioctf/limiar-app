/**
 * Long-term macro plan (periodization toward a target race).
 *   GET    → active plan (or null)
 *   POST   {raceType, raceLabel?, targetMonth} → generate & save (replaces active)
 *   PATCH  {} → adapt remaining weeks to real execution (AI)
 *   PATCH  {targetMonth} → race month changed: regenerate from scratch
 *   DELETE → cancel active plan
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  loadActiveMacroPlan, buildWeekStarts, adaptMacroPlanForUser,
} from "@/lib/macro-plan";
import { buildMacroWeeks, macroRationale, phasesSummary, assessMacroPlan } from "@/lib/macro-builder";
import { provenCapacity, planWeeklyVolume } from "@/lib/workout-builder";
import type { MacroRaceType } from "@/types";

export const maxDuration = 90;

const RACE_LABELS: Record<MacroRaceType, string> = {
  "5k": "5K", "10k": "10K", "half": "Meia-maratona", "marathon": "Maratona",
  "ultra": "Ultramaratona", "triathlon": "Triathlon", "other": "Prova-alvo",
};

const RACE_KM: Record<MacroRaceType, number> = {
  "5k": 5, "10k": 10, "half": 21.0975, "marathon": 42.195,
  "ultra": 50, "triathlon": 21.0975, "other": 10,
};

/**
 * Race day for the target month: the athlete's registered race when there is
 * one, otherwise the middle of the month as a neutral anchor.
 */
async function resolveRaceDate(
  admin: ReturnType<typeof createAdminClient>, userId: string, targetMonth: string,
): Promise<string> {
  try {
    const { data } = await admin
      .from("races").select("race_date")
      .eq("user_id", userId)
      .gte("race_date", `${targetMonth}-01`)
      .lte("race_date", `${targetMonth}-31`)
      .order("race_date", { ascending: true }).limit(1);
    if (data?.[0]?.race_date) return data[0].race_date as string;
  } catch { /* races table optional */ }
  return `${targetMonth}-15`;
}

async function getUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const plan = await loadActiveMacroPlan(createAdminClient(), user.id);
  return NextResponse.json({ plan });
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const raceType = body?.raceType as MacroRaceType | undefined;
  const targetMonth = body?.targetMonth as string | undefined;
  const raceLabel = ((body?.raceLabel as string | undefined)?.trim() || (raceType ? RACE_LABELS[raceType] : "")).slice(0, 80);

  if (!raceType || !RACE_LABELS[raceType]) {
    return NextResponse.json({ error: "Tipo de prova inválido" }, { status: 400 });
  }
  if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
    return NextResponse.json({ error: "Mês-alvo inválido (use AAAA-MM)" }, { status: 400 });
  }

  const weekStarts = buildWeekStarts(targetMonth);
  if (weekStarts.length < 4) {
    return NextResponse.json({ error: "Prova muito próxima — escolha um mês com pelo menos 4 semanas de preparo" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Starting volume, computed exactly the way the weekly plan computes it.
  //
  // These were two different estimates of the same thing — the macro plan
  // averaged the last 28 days while the week used its own figure — so the
  // long-term plan and the weekly plan disagreed from day one. Same inputs,
  // same function, one answer.
  const yearAgo = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
  const { data: runs } = await admin
    .from("runs")
    .select("date, distance_km")
    .eq("user_id", user.id)
    .gte("date", yearAgo)
    .is("deleted_at", null);

  const history = (runs ?? []) as Array<{ date: string; distance_km: number }>;
  const proven = provenCapacity(history);

  const fourWeeksAgo = new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10);
  const recentTotal = history
    .filter(r => r.date >= fourWeeksAgo)
    .reduce((s, r) => s + r.distance_km, 0);
  const recentAvg = recentTotal / 4;

  const currentWeeklyKm = planWeeklyVolume(
    [recentAvg, recentAvg, recentAvg, recentAvg],
    { provenWeeklyKm: proven.weeklyKm },
  );

  const raceDate = await resolveRaceDate(admin, user.id, targetMonth);
  const raceKm = RACE_KM[raceType];

  // Deterministic periodization — see TRAINING_SCIENCE.md for the rules.
  const input = {
    weekStarts, raceDate, raceKm, currentWeeklyKm,
    // Already computed above for the volume floor; the long run needs it too,
    // or the macro advertises a shorter long run than the week it describes.
    provenLongRunKm: proven.longestRunKm,
  };
  const weeks = buildMacroWeeks(input);

  // Whether the race is actually reachable from here. Saying so matters more
  // than producing a tidy plan: a half marathon built from 10 km/week in 13
  // weeks cannot work, and hiding that just guarantees a bad race day.
  const assessment = assessMacroPlan(input);

  const planData = {
    weeks,
    phases_summary: phasesSummary(weeks),
    rationale: macroRationale(weeks, raceLabel, raceType),
    adaptation_note: assessment.verdict === "suficiente" ? undefined : assessment.message,
    assessment,
  };

  // Replace any previous active plan
  await admin.from("training_macro_plans")
    .update({ status: "cancelled" })
    .eq("user_id", user.id)
    .eq("status", "active");

  const { data: saved, error } = await admin
    .from("training_macro_plans")
    .insert({
      user_id: user.id,
      race_type: raceType,
      race_label: raceLabel,
      target_month: targetMonth,
      status: "active",
      plan_json: planData,
    })
    .select()
    .single();

  if (error) {
    console.error("[macro-plan] insert error:", error);
    return NextResponse.json({ error: "Falha ao salvar o plano" }, { status: 500 });
  }

  return NextResponse.json({ plan: saved });
}

export async function PATCH(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));
  const newMonth = body?.targetMonth as string | undefined;

  const existing = await loadActiveMacroPlan(admin, user.id);
  if (!existing) return NextResponse.json({ error: "Nenhum plano ativo" }, { status: 404 });

  // Month change → regenerate via POST logic (client calls POST again);
  // here we only support adaptation, and month-change via regenerate flag
  if (newMonth && /^\d{4}-\d{2}$/.test(newMonth) && newMonth !== existing.target_month) {
    return NextResponse.json({ regenerate: true });
  }

  const note = await adaptMacroPlanForUser(admin, user.id);
  if (!note) {
    return NextResponse.json({ adapted: false, message: "Nada a adaptar ainda — o plano segue válido." });
  }
  return NextResponse.json({ adapted: true, message: note });
}

export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  await admin.from("training_macro_plans")
    .update({ status: "cancelled" })
    .eq("user_id", user.id)
    .eq("status", "active");

  return NextResponse.json({ ok: true });
}
