/**
 * Macro plan helpers — shared by the API route and the weekly cron so the
 * long-term plan adapts automatically to what the athlete actually did.
 */
import { localDateStr } from "@/lib/week";
import { buildMacroWeeks } from "@/lib/macro-builder";
import type { MacroPlan, MacroPlanData } from "@/types";

// Minimal supabase-like client shape (admin client)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export function nextMondayStr(from = new Date()): string {
  const d = new Date(from);
  const dow = (d.getDay() + 6) % 7;          // 0 = Monday
  d.setDate(d.getDate() + (7 - dow));        // always the NEXT Monday
  return localDateStr(d);
}

/** Mondays from next week through the 21st of the target month (race buffer). */
export function buildWeekStarts(targetMonth: string): string[] {
  const weeks: string[] = [];
  const cursor = new Date(`${nextMondayStr()}T12:00:00`);
  const end = new Date(`${targetMonth}-21T12:00:00`);
  while (cursor <= end && weeks.length < 44) {
    weeks.push(localDateStr(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

export async function loadActiveMacroPlan(db: Db, userId: string): Promise<MacroPlan | null> {
  const { data } = await db
    .from("training_macro_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] ?? null) as MacroPlan | null;
}

/** "planejado Xkm → feito Ykm" for the plan weeks that already happened (last 4). */
export function buildExecutionSummary(
  plan: MacroPlanData,
  runs: Array<{ date: string; distance_km: number }>,
): string {
  const today = localDateStr();
  const pastWeeks = plan.weeks.filter(w => w.week_start < today).slice(-4);
  if (pastWeeks.length === 0) return "Plano recém-criado — sem semanas executadas ainda.";

  return pastWeeks.map(w => {
    const weekEnd = new Date(`${w.week_start}T12:00:00`);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = localDateStr(weekEnd);
    const actual = runs
      .filter(r => r.date >= w.week_start && r.date < weekEndStr)
      .reduce((s, r) => s + r.distance_km, 0);
    const pct = w.target_km > 0 ? Math.round((actual / w.target_km) * 100) : 100;
    return `Semana ${w.week_start} [${w.phase}]: planejado ${w.target_km}km → feito ${actual.toFixed(1)}km (${pct}%)`;
  }).join("\n");
}

/**
 * Re-anchor the macro plan to what the athlete is actually running.
 *
 * Past weeks are never touched. Future weeks are rebuilt from the real recent
 * volume, so a plan that drifted (illness, travel, or a bigger jump than
 * planned) ramps from reality instead of from an assumption made months ago.
 */
export async function adaptMacroPlanForUser(db: Db, userId: string): Promise<string | null> {
  const plan = await loadActiveMacroPlan(db, userId);
  if (!plan) return null;

  const today = localDateStr();
  const past   = plan.plan_json.weeks.filter(w => w.week_start <  today);
  const future = plan.plan_json.weeks.filter(w => w.week_start >= today);
  if (past.length === 0 || future.length === 0) return null; // nothing to adapt

  const since = new Date();
  since.setDate(since.getDate() - 28);
  const { data: runs } = await db
    .from("runs")
    .select("date, distance_km")
    .eq("user_id", userId)
    .gte("date", localDateStr(since))
    .is("deleted_at", null);

  const actualWeeklyKm =
    (runs ?? []).reduce((s: number, r: { distance_km: number }) => s + r.distance_km, 0) / 4;

  // Long-run durability, over a year rather than the four weeks above. Someone
  // who covered 21 km in June has not lost that in a quiet month, and the macro
  // must not go back to promising a 3 km "longão" every time it re-anchors.
  const yearAgo = new Date();
  yearAgo.setDate(yearAgo.getDate() - 365);
  const { data: longest } = await db
    .from("runs")
    .select("distance_km")
    .eq("user_id", userId)
    .gte("date", localDateStr(yearAgo))
    .is("deleted_at", null)
    .order("distance_km", { ascending: false })
    .limit(1);
  const provenLongRunKm = (longest ?? [])[0]?.distance_km ?? 0;

  const plannedNow = past[past.length - 1]?.target_km ?? actualWeeklyKm;
  const drift = plannedNow > 0 ? Math.round(((actualWeeklyKm - plannedNow) / plannedNow) * 100) : 0;

  // Within ±15% the plan is on track — rewriting it would add churn, not value.
  if (Math.abs(drift) < 15) return null;

  const raceDate = plan.plan_json.weeks[plan.plan_json.weeks.length - 1].week_start;
  const raceKm   = estimateRaceKm(plan.race_type);

  const rebuilt = buildMacroWeeks({
    weekStarts: future.map(w => w.week_start),
    raceDate,
    raceKm,
    currentWeeklyKm: actualWeeklyKm,
    provenLongRunKm,
  });

  const note = drift < 0
    ? `Volume real ${Math.abs(drift)}% abaixo do planejado — a rampa foi refeita a partir de ${Math.round(actualWeeklyKm)} km/semana para não forçar a progressão.`
    : `Volume real ${drift}% acima do planejado — a progressão foi recalculada a partir de ${Math.round(actualWeeklyKm)} km/semana.`;

  const newData: MacroPlanData = {
    ...plan.plan_json,
    weeks: [...past, ...rebuilt],
    adaptation_note: note,
    adapted_at: new Date().toISOString(),
  };

  await db
    .from("training_macro_plans")
    .update({ plan_json: newData })
    .eq("id", plan.id);

  return note;
}

function estimateRaceKm(raceType: string): number {
  switch (raceType) {
    case "5k": return 5;
    case "10k": return 10;
    case "half": case "triathlon": return 21.0975;
    case "marathon": return 42.195;
    case "ultra": return 50;
    default: return 10;
  }
}
