/**
 * GET /api/friends/leaderboard
 * Returns privacy-safe AGGREGATE stats for the current user + accepted friends.
 * Friends never see each other's raw runs — only weekly/monthly km, streak, PRs.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { computeRunStreak } from "@/lib/training-load";
import { buildRecords, bestAt, type RunForRecords, type StoredEffort } from "@/lib/records";
import type { Run, FriendStats, Friendship } from "@/types";

function mondayStr(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function firstOfMonthStr(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/*
 * Records come from the shared engine — see lib/records.ts.
 *
 * This route used to carry its own rule (whole activities within ±0.5 km, timed
 * on `duration_seconds`), which is how a leaderboard could rank two athletes on
 * numbers neither of their own profiles showed. Sérgio's 5 km read 29:44 here
 * and 24:25 on his profile; Manoela's differed by 12:41.
 */

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Accepted friendships (RLS scopes to the current user)
  const { data: rows } = await supabase
    .from("friendships")
    .select("*")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const friendships = (rows ?? []) as Friendship[];
  const friendIds = friendships.map(f => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
  const allIds = Array.from(new Set([user.id, ...friendIds]));

  const admin = createAdminClient();

  // Profiles for display
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, username")
    .in("id", allIds);
  const profileMap = new Map(
    ((profiles ?? []) as Array<{ id: string; name: string | null; username: string | null }>)
      .map(p => [p.id, p] as const)
  );

  const mon = mondayStr();
  const monthStart = firstOfMonthStr();

  // Previous calendar week (Mon..Sun before the current Monday)
  const prevMon = new Date(`${mon}T12:00:00`);
  prevMon.setDate(prevMon.getDate() - 7);
  const prevMonStr = prevMon.toISOString().slice(0, 10);

  // One round-trip per table for the whole group, instead of per athlete.
  const [{ data: allRuns }, { data: allEfforts }, { data: allActivities }] = await Promise.all([
    admin.from("runs")
      .select("id, user_id, name, date, distance_km, duration_seconds, moving_time_seconds, elapsed_time_seconds")
      .in("user_id", allIds).is("deleted_at", null),
    admin.from("run_best_efforts")
      .select("user_id, run_id, distance_m, seconds, run_date, pace_sec_km, start_m, end_m, paused_sec")
      .in("user_id", allIds),
    admin.from("activities")
      .select("user_id, date, sport_type")
      .in("user_id", allIds).gte("date", monthStart).is("deleted_at", null),
  ]);

  type RunRow = Run & { user_id: string };
  const runsByUser = new Map<string, RunRow[]>();
  for (const r of (allRuns ?? []) as RunRow[]) {
    const list = runsByUser.get(r.user_id) ?? [];
    list.push(r);
    runsByUser.set(r.user_id, list);
  }

  type EffortRow = StoredEffort & { user_id: string };
  const effortsByUser = new Map<string, EffortRow[]>();
  for (const e of (allEfforts ?? []) as EffortRow[]) {
    // The zero-distance sentinel marks a run the backfill has read; not a mark.
    if (e.distance_m <= 0) continue;
    const list = effortsByUser.get(e.user_id) ?? [];
    list.push(e);
    effortsByUser.set(e.user_id, list);
  }

  type ActRow = { user_id: string; date: string; sport_type: string };
  const actsByUser = new Map<string, ActRow[]>();
  for (const a of (allActivities ?? []) as ActRow[]) {
    const list = actsByUser.get(a.user_id) ?? [];
    list.push(a);
    actsByUser.set(a.user_id, list);
  }

  /** Distinct days with ANY training (run or other activity) since `from`. */
  function trainingDays(runs: Run[], acts: ActRow[], from: string): number {
    const days = new Set<string>();
    for (const r of runs) if (r.date >= from) days.add(r.date);
    for (const a of acts) if (a.date >= from) days.add(a.date);
    return days.size;
  }

  const stats: FriendStats[] = allIds.map(id => {
    const list = runsByUser.get(id) ?? [];
    const acts = actsByUser.get(id) ?? [];
    const records = buildRecords(
      list as unknown as RunForRecords[],
      effortsByUser.get(id) ?? [],
    );

    const weekKm     = list.filter(r => r.date >= mon).reduce((s, r) => s + r.distance_km, 0);
    const monthKm    = list.filter(r => r.date >= monthStart).reduce((s, r) => s + r.distance_km, 0);
    const lastWeekKm = list.filter(r => r.date >= prevMonStr && r.date < mon)
      .reduce((s, r) => s + r.distance_km, 0);
    const prof = profileMap.get(id);

    return {
      userId: id,
      name: prof?.name ?? null,
      username: prof?.username ?? null,
      isMe: id === user.id,
      weekKm: Math.round(weekKm * 10) / 10,
      lastWeekKm: Math.round(lastWeekKm * 10) / 10,
      monthKm: Math.round(monthKm * 10) / 10,
      streak: computeRunStreak(list),
      trainingDaysWeek:  trainingDays(list, acts, mon),
      trainingDaysMonth: trainingDays(list, acts, monthStart),
      best5kSeconds:  bestAt(records, 5000),
      best10kSeconds: bestAt(records, 10000),
    };
  });

  return NextResponse.json({ stats });
}
