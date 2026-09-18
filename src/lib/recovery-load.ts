/**
 * Fetch everything today's recovery needs, the same way for every caller.
 *
 * The Saúde page, the dashboard and the morning notification all call this, so
 * they cannot drift apart on which runs count toward load, how far back the
 * baseline reaches, or which week's plan "today" belongs to.
 */
import { buildRecoveryToday, type RecoveryToday } from "@/lib/recovery-today";
import { addDays, type LoadDay } from "@/lib/health-view";
import { computeTrainingLoad, type DailyLoad, type LoadActivity } from "@/lib/training-load";
import { computeMetrics } from "@/lib/performance";
import { athleteDateStr } from "@/lib/week";
import { getMondayStr, toBrt } from "@/lib/plan-notify";
import { isStrengthActivity } from "@/lib/sports";
import { dayKeyOf } from "@/lib/session-swap";
import { dayStatus } from "@/lib/day-status";
import type { HealthCheckin, Run, WeeklyPlanData, WellnessData } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface RecoveryInputs {
  today: string;
  rows: WellnessData[];
  load: Record<string, LoadDay>;
  checkin: HealthCheckin | null;
  plan: WeeklyPlanData | null;
  planReportId: string | null;
  doneKm: number;
  strengthDone: boolean;
  recovery: RecoveryToday;
  /** Ninety days of fitness, fatigue and form — the load card that moved from the Home to Saúde. */
  fitness: DailyLoad[];
}

function parsePlan(raw: string | null | undefined): WeeklyPlanData | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as WeeklyPlanData;
    return Array.isArray(p.days) && p.days.length > 0 ? p : null;
  } catch { return null; }
}

export async function loadRecoveryInputs(db: Db, userId: string, now: Date = new Date()): Promise<RecoveryInputs> {
  const today = athleteDateStr(now);
  const monday = getMondayStr(toBrt(now));
  const nextMonday = addDays(monday, 7);

  const [wellnessRes, runsRes, testRes, checkinRes, plansRes, actsRes, loadActsRes] = await Promise.all([
    // Sixty days: thirty on screen, and thirty before them to judge the first against.
    db.from("wellness_data").select("*").eq("user_id", userId)
      .gte("date", addDays(today, -60)).order("date", { ascending: false }),
    db.from("runs").select("date, distance_km, duration_seconds, avg_pace_seconds_per_km, avg_hr")
      .eq("user_id", userId).gte("date", addDays(today, -180)).is("deleted_at", null),
    db.from("performance_tests").select("distance_km, time_seconds, avg_hr, max_hr")
      .eq("user_id", userId).order("test_date", { ascending: false }).limit(1),
    db.from("health_checkins").select("*").eq("user_id", userId).eq("date", today).maybeSingle(),
    db.from("coach_reports").select("id, full_report, period_start")
      .eq("user_id", userId).eq("period_type", "week").in("period_start", [monday, nextMonday]),
    db.from("activities").select("sport_type, duration_seconds").eq("user_id", userId).eq("date", today).is("deleted_at", null),
    // Gym, bike and swim sessions load the body too — see `activityTSS`.
    db.from("activities").select("date, sport_type, duration_seconds, avg_hr")
      .eq("user_id", userId).gte("date", addDays(today, -180)).is("deleted_at", null),
  ]);

  const rows = (wellnessRes.data ?? []) as WellnessData[];
  const runs = (runsRes.data ?? []) as Run[];

  // Same LTHR and threshold pace as the dashboard's Fitness card, so "forma"
  // means the same number on every screen.
  const test = testRes.data?.[0];
  const metrics = test
    ? computeMetrics(test.distance_km * 1000, test.time_seconds, test.avg_hr ?? undefined, test.max_hr ?? undefined)
    : null;
  const load: Record<string, LoadDay> = {};
  let fitness: DailyLoad[] = [];
  try {
    const threshold = metrics?.paces.find(p => p.name === "threshold")?.pace_min_sec ?? null;
    const loadActivities = (loadActsRes.data ?? []) as LoadActivity[];
    for (const d of computeTrainingLoad(runs, metrics?.lthr ?? null, threshold, 45, loadActivities)) {
      load[d.date] = { tss: d.tss, tsb: d.tsb };
    }
    fitness = computeTrainingLoad(runs, metrics?.lthr ?? null, threshold, 90, loadActivities);
  } catch { /* no runs yet — readiness simply goes without load */ }

  const reports = (plansRes.data ?? []) as Array<{ id: string; full_report: string | null; period_start: string }>;
  const current = reports.find(r => r.period_start === monday) ?? null;
  const plan = parsePlan(current?.full_report);
  const nextPlan = parsePlan(reports.find(r => r.period_start === nextMonday)?.full_report);

  const doneKm = runs.filter(r => r.date === today).reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
  const todayActs = ((actsRes.data ?? []) as Array<{ sport_type: string; duration_seconds: number | null }>)
    .map(a => ({ ...a, date: today }));
  const strengthDone = todayActs.some(a => isStrengthActivity(a.sport_type));
  // One definition of "done" for the whole app (see day-status).
  const todayStatus = dayStatus({
    date: today,
    planned: plan?.days.find(d => d.day === dayKeyOf(today)) ?? null,
    runs: runs.map(r => ({ date: r.date, distance_km: Number(r.distance_km) || 0, duration_seconds: r.duration_seconds })),
    activities: todayActs,
  });
  const checkin = (checkinRes.data ?? null) as HealthCheckin | null;

  const recovery = buildRecoveryToday({
    date: today, rows, load, checkin, plan,
    // Sunday's tomorrow is Monday of next week.
    tomorrowOverride: dayKeyOf(today) === "Sun"
      ? nextPlan?.days.find(d => d.day === "Mon") ?? null
      : undefined,
    doneKm, strengthDone, status: todayStatus,
  });

  return { today, rows, load, checkin, plan, planReportId: current?.id ?? null, doneKm, strengthDone, recovery, fitness };
}
