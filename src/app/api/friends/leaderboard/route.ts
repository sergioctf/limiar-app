/**
 * GET /api/friends/leaderboard
 * Returns privacy-safe AGGREGATE stats for the current user + accepted friends.
 * Friends never see each other's raw runs — only weekly/monthly km, streak, PRs.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { computeRunStreak } from "@/lib/training-load";
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

function bestForDistance(runs: Run[], km: number, tol = 0.5): number | null {
  const matches = runs.filter(r => Math.abs(r.distance_km - km) <= tol && r.duration_seconds > 0);
  if (matches.length === 0) return null;
  return Math.min(...matches.map(r => r.duration_seconds));
}

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

  const stats: FriendStats[] = [];
  for (const id of allIds) {
    // Only fetch the fields needed for aggregates
    const { data: runs } = await admin
      .from("runs")
      .select("date, distance_km, duration_seconds")
      .eq("user_id", id)
      .is("deleted_at", null);

    const list = (runs ?? []) as Run[];
    const weekKm  = list.filter(r => r.date >= mon).reduce((s, r) => s + r.distance_km, 0);
    const monthKm = list.filter(r => r.date >= monthStart).reduce((s, r) => s + r.distance_km, 0);
    const prof = profileMap.get(id);

    stats.push({
      userId: id,
      name: prof?.name ?? null,
      username: prof?.username ?? null,
      isMe: id === user.id,
      weekKm: Math.round(weekKm * 10) / 10,
      monthKm: Math.round(monthKm * 10) / 10,
      streak: computeRunStreak(list),
      best5kSeconds: bestForDistance(list, 5),
      best10kSeconds: bestForDistance(list, 10),
    });
  }

  return NextResponse.json({ stats });
}
