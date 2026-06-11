/**
 * GET /api/friends/feed
 * Recent runs from the current user + accepted friends (last 14 days, max 30),
 * each with kudos count and whether the current user already reacted.
 * Privacy: only summary fields are exposed — never notes, HR or GPS.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Friendship } from "@/types";

export interface FeedItem {
  runId: string;
  userId: string;
  name: string | null;       // athlete display name
  username: string | null;
  isMe: boolean;
  runName: string;
  date: string;
  distanceKm: number;
  paceSecondsPerKm: number | null;
  durationSeconds: number;
  kudosCount: number;
  didIKudo: boolean;
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Accepted friendships (RLS scopes to me)
  const { data: rows } = await supabase
    .from("friendships")
    .select("*")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const friendIds = ((rows ?? []) as Friendship[])
    .map(f => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
  const allIds = Array.from(new Set([user.id, ...friendIds]));

  const admin = createAdminClient();

  const since = new Date();
  since.setDate(since.getDate() - 14);
  const sinceStr = since.toISOString().slice(0, 10);

  const [{ data: runs }, { data: profiles }] = await Promise.all([
    admin
      .from("runs")
      .select("id, user_id, name, date, distance_km, avg_pace_seconds_per_km, duration_seconds")
      .in("user_id", allIds)
      .gte("date", sinceStr)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(30),
    admin.from("profiles").select("id, name, username").in("id", allIds),
  ]);

  const profileMap = new Map(
    ((profiles ?? []) as Array<{ id: string; name: string | null; username: string | null }>)
      .map(p => [p.id, p] as const)
  );

  type FeedRun = {
    id: string; user_id: string; name: string; date: string;
    distance_km: number; avg_pace_seconds_per_km: number | null; duration_seconds: number;
  };
  const feedRuns = (runs ?? []) as FeedRun[];

  // Kudos for the visible runs in one query
  const runIds = feedRuns.map(r => r.id);
  const kudosByRun = new Map<string, { count: number; mine: boolean }>();
  if (runIds.length > 0) {
    const { data: kudos } = await admin
      .from("kudos")
      .select("run_id, sender_id")
      .in("run_id", runIds);
    for (const k of kudos ?? []) {
      const entry = kudosByRun.get(k.run_id) ?? { count: 0, mine: false };
      entry.count++;
      if (k.sender_id === user.id) entry.mine = true;
      kudosByRun.set(k.run_id, entry);
    }
  }

  const feed: FeedItem[] = feedRuns.map(r => {
    const prof = profileMap.get(r.user_id);
    const k = kudosByRun.get(r.id) ?? { count: 0, mine: false };
    return {
      runId: r.id,
      userId: r.user_id,
      name: prof?.name ?? null,
      username: prof?.username ?? null,
      isMe: r.user_id === user.id,
      runName: r.name,
      date: r.date,
      distanceKm: r.distance_km,
      paceSecondsPerKm: r.avg_pace_seconds_per_km,
      durationSeconds: r.duration_seconds,
      kudosCount: k.count,
      didIKudo: k.mine,
    };
  });

  return NextResponse.json({ feed });
}
