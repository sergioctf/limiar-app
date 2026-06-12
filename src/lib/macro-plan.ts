/**
 * Macro plan helpers — shared by the API route and the weekly cron so the
 * long-term plan adapts automatically to what the athlete actually did.
 */
import { adaptMacroPlan } from "@/lib/ai";
import type { MacroPlan, MacroPlanData } from "@/types";

// Minimal supabase-like client shape (admin client)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export function nextMondayStr(from = new Date()): string {
  const d = new Date(from);
  const dow = (d.getDay() + 6) % 7;          // 0 = Monday
  d.setDate(d.getDate() + (7 - dow));        // always the NEXT Monday
  return d.toISOString().slice(0, 10);
}

/** Mondays from next week through the 21st of the target month (race buffer). */
export function buildWeekStarts(targetMonth: string): string[] {
  const weeks: string[] = [];
  const cursor = new Date(`${nextMondayStr()}T12:00:00`);
  const end = new Date(`${targetMonth}-21T12:00:00`);
  while (cursor <= end && weeks.length < 44) {
    weeks.push(cursor.toISOString().slice(0, 10));
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
  const today = new Date().toISOString().slice(0, 10);
  const pastWeeks = plan.weeks.filter(w => w.week_start < today).slice(-4);
  if (pastWeeks.length === 0) return "Plano recém-criado — sem semanas executadas ainda.";

  return pastWeeks.map(w => {
    const weekEnd = new Date(`${w.week_start}T12:00:00`);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const actual = runs
      .filter(r => r.date >= w.week_start && r.date < weekEndStr)
      .reduce((s, r) => s + r.distance_km, 0);
    const pct = w.target_km > 0 ? Math.round((actual / w.target_km) * 100) : 100;
    return `Semana ${w.week_start} [${w.phase}]: planejado ${w.target_km}km → feito ${actual.toFixed(1)}km (${pct}%)`;
  }).join("\n");
}

/**
 * Adapt the user's active macro plan to recent execution. Best-effort:
 * returns the adaptation note, or null when there's nothing to adapt.
 */
export async function adaptMacroPlanForUser(db: Db, userId: string): Promise<string | null> {
  const plan = await loadActiveMacroPlan(db, userId);
  if (!plan) return null;

  const today = new Date().toISOString().slice(0, 10);
  const hasPast   = plan.plan_json.weeks.some(w => w.week_start < today);
  const hasFuture = plan.plan_json.weeks.some(w => w.week_start >= today);
  if (!hasPast || !hasFuture) return null; // nothing executed yet, or plan finished

  const since = new Date();
  since.setDate(since.getDate() - 35);
  const { data: runs } = await db
    .from("runs")
    .select("date, distance_km")
    .eq("user_id", userId)
    .gte("date", since.toISOString().slice(0, 10))
    .is("deleted_at", null);

  const summary = buildExecutionSummary(plan.plan_json, runs ?? []);
  const result = await adaptMacroPlan(plan.plan_json, plan.race_label, plan.target_month, summary, null);
  if (!result) return null;

  const newData: MacroPlanData = {
    ...plan.plan_json,
    weeks: result.weeks,
    adaptation_note: result.note,
    adapted_at: new Date().toISOString(),
  };

  await db
    .from("training_macro_plans")
    .update({ plan_json: newData })
    .eq("id", plan.id);

  return result.note;
}
