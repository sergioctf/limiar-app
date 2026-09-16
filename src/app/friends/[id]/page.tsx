import { localDateStr } from "@/lib/week";
import { redirect, notFound } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { FriendProfile } from "@/components/friends/FriendProfile";
import { computeRunStreak } from "@/lib/training-load";
import { toSportKey, type SportKey } from "@/lib/sports";
import { buildRecords, type RunForRecords, type StoredEffort } from "@/lib/records";
import type { Run } from "@/types";

interface Props {
  params: { id: string };
}

/** Athlete profile — aggregates only, and only for accepted friends (or self). */
export default async function FriendProfilePage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const targetId = params.id;
  const isMe = targetId === user.id;

  // Access control: must be self or an accepted friend.
  if (!isMe) {
    const { data: rows } = await supabase
      .from("friendships").select("id").eq("status", "accepted")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${targetId}),` +
        `and(requester_id.eq.${targetId},addressee_id.eq.${user.id})`,
      )
      .limit(1);
    if (!rows || rows.length === 0) notFound();
  }

  const admin = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceStr = localDateStr(since);

const RUN_COLS =
    "id, name, date, distance_km, duration_seconds, moving_time_seconds, elapsed_time_seconds, avg_pace_seconds_per_km";
  const EFFORT_COLS = "run_id, distance_m, seconds, run_date, pace_sec_km, start_m, end_m, paused_sec";

  const [
    { data: profile }, { data: runs }, { data: activities },
    { data: theirEfforts }, { data: myRuns }, { data: myEfforts },
  ] = await Promise.all([
    admin.from("profiles").select("name, username, created_at").eq("id", targetId).maybeSingle(),
    admin.from("runs").select(RUN_COLS)
      .eq("user_id", targetId).is("deleted_at", null).order("date", { ascending: false }),
    admin.from("activities").select("date, sport_type, duration_seconds")
      .eq("user_id", targetId).gte("date", sinceStr).is("deleted_at", null),
    admin.from("run_best_efforts").select(EFFORT_COLS).eq("user_id", targetId),
    // Mine, for the side-by-side. Skipped when looking at my own profile, where
    // comparing me to me would be noise.
    isMe ? Promise.resolve({ data: [] }) : admin.from("runs").select(RUN_COLS)
      .eq("user_id", user.id).is("deleted_at", null),
    isMe ? Promise.resolve({ data: [] }) : admin.from("run_best_efforts")
      .select(EFFORT_COLS).eq("user_id", user.id),
  ]);

  if (!profile) notFound();

  const runList = (runs ?? []) as Run[];
  const acts = (activities ?? []) as Array<{ date: string; sport_type: string; duration_seconds: number | null }>;

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const mondayStr = localDateStr(monday);
  const monthStart = new Date();
  const monthStartStr = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1)
    .toISOString().slice(0, 10);

  const sum = (list: Run[]) => list.reduce((s, r) => s + r.distance_km, 0);
  const weekKm  = Math.round(sum(runList.filter(r => r.date >= mondayStr)) * 10) / 10;
  const monthKm = Math.round(sum(runList.filter(r => r.date >= monthStartStr)) * 10) / 10;
  const totalKm = Math.round(sum(runList) * 10) / 10;

  const trainingDaysIn = (from: string) => {
    const days = new Set<string>();
    for (const r of runList) if (r.date >= from) days.add(r.date);
    for (const a of acts)    if (a.date >= from) days.add(a.date);
    return days.size;
  };

  // Sport mix over the last 90 days (sessions per sport)
  const sportCounts: Partial<Record<SportKey, number>> = {};
  for (const r of runList) {
    if (r.date >= sinceStr) sportCounts.corrida = (sportCounts.corrida ?? 0) + 1;
  }
  for (const a of acts) {
    const key = toSportKey(a.sport_type);
    if (key) sportCounts[key] = (sportCounts[key] ?? 0) + 1;
  }

  // Weekly volume for the last 8 weeks
  const weeks: Array<{ label: string; km: number }> = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const s = localDateStr(start);
    const e = localDateStr(end);
    weeks.push({
      label: `${start.getDate()}/${start.getMonth() + 1}`,
      km: Math.round(sum(runList.filter(r => r.date >= s && r.date < e)) * 10) / 10,
    });
  }

  /*
   * Records, from the same engine the dashboard and the coach card use.
   *
   * This page used to carry a third definition of its own — whole activities
   * within ±0.5 km, timed on `duration_seconds` — so the same athlete had a
   * different 5 km record here than on their own dashboard. There is now one
   * answer to the question.
   */
  const theirRecords = buildRecords(
    runList as unknown as RunForRecords[],
    (theirEfforts ?? []) as StoredEffort[],
  );
  const myRecords = isMe ? [] : buildRecords(
    (myRuns ?? []) as unknown as RunForRecords[],
    (myEfforts ?? []) as StoredEffort[],
  );

  return (
    <AppShell>
      <FriendProfile
        userId={targetId}
        name={profile.name}
        username={profile.username}
        isMe={isMe}
        memberSince={profile.created_at}
        totalRuns={runList.length}
        totalKm={totalKm}
        weekKm={weekKm}
        monthKm={monthKm}
        trainingDaysWeek={trainingDaysIn(mondayStr)}
        trainingDaysMonth={trainingDaysIn(monthStartStr)}
        streak={computeRunStreak(runList)}
        records={theirRecords}
        myRecords={myRecords}
        sportCounts={sportCounts}
        weeklyVolume={weeks}
      />
    </AppShell>
  );
}
