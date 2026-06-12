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
import { generateMacroPlan } from "@/lib/ai";
import { computeMetrics } from "@/lib/performance";
import {
  loadActiveMacroPlan, buildWeekStarts, adaptMacroPlanForUser,
} from "@/lib/macro-plan";
import type { MacroRaceType } from "@/types";

export const maxDuration = 90;

const RACE_LABELS: Record<MacroRaceType, string> = {
  "5k": "5K", "10k": "10K", "half": "Meia-maratona", "marathon": "Maratona",
  "ultra": "Ultramaratona", "triathlon": "Triathlon", "other": "Prova-alvo",
};

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

  // Current weekly volume (avg of last 4 weeks) + VDOT + history summary
  const since = new Date();
  since.setDate(since.getDate() - 28);
  const [{ data: runs }, { data: tests }] = await Promise.all([
    admin.from("runs")
      .select("date, distance_km, avg_pace_seconds_per_km, type")
      .eq("user_id", user.id)
      .gte("date", since.toISOString().slice(0, 10))
      .is("deleted_at", null),
    admin.from("performance_tests")
      .select("distance_km, time_seconds, avg_hr")
      .eq("user_id", user.id)
      .order("test_date", { ascending: false })
      .limit(1),
  ]);

  const totalKm = (runs ?? []).reduce((s: number, r: { distance_km: number }) => s + r.distance_km, 0);
  const currentWeeklyKm = totalKm / 4;

  let vdot: number | null = null;
  const test = tests?.[0];
  if (test) {
    try { vdot = computeMetrics(test.distance_km * 1000, test.time_seconds, test.avg_hr ?? undefined).vdot; }
    catch { vdot = null; }
  }

  const recentSummary = (runs ?? []).length > 0
    ? `${(runs ?? []).length} corridas nos últimos 28 dias, ${totalKm.toFixed(0)}km no total.`
    : "Sem corridas recentes registradas.";

  const planData = await generateMacroPlan(
    raceType, raceLabel, targetMonth, weekStarts, currentWeeklyKm, vdot, recentSummary,
  );
  if (!planData) {
    return NextResponse.json({ error: "IA indisponível — tente novamente em instantes" }, { status: 502 });
  }

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
