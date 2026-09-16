/**
 * GET /api/friends/achievements
 *   → the athlete's badges alongside every accepted friend's.
 *
 * Computed, never stored. `detectAchievements` is a pure function of a person's
 * runs, so the comparison is derived on read and cannot drift from the badge
 * grid the same athlete sees on their own dashboard.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { detectAchievements } from "@/lib/achievements";
import type { StoredEffort } from "@/lib/records";
import { acceptedFriendIds } from "@/lib/friend-notify";
import type { AthleteBadges } from "@/lib/achievement-compare";
import type { Run } from "@/types";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  try {
    const friendIds = await acceptedFriendIds(admin, user.id);
    const everyone = [user.id, ...friendIds];

    // Only the fields the badge rules read. Pulling whole run rows for a dozen
    // athletes to count them would be a lot of network for a number.
    const [{ data: runs }, { data: profiles }, { data: efforts }] = await Promise.all([
      admin.from("runs")
        .select("id, user_id, name, date, distance_km, duration_seconds, moving_time_seconds, elapsed_time_seconds, avg_pace_seconds_per_km, elevation_gain_m")
        .in("user_id", everyone).is("deleted_at", null),
      admin.from("profiles").select("id, name, username").in("id", everyone),
      // Badges that name a time — "10K abaixo de 45 min" — have to be judged on
      // the same records the athlete sees on their own card.
      admin.from("run_best_efforts")
        .select("user_id, run_id, distance_m, seconds, run_date, pace_sec_km, start_m, end_m, paused_sec")
        .in("user_id", everyone),
    ]);

    const byUser = new Map<string, Run[]>();
    for (const r of (runs ?? []) as Array<Run & { user_id: string }>) {
      const list = byUser.get(r.user_id) ?? [];
      list.push(r);
      byUser.set(r.user_id, list);
    }

    type EffortRow = StoredEffort & { user_id: string };
    const effortsBy = new Map<string, EffortRow[]>();
    for (const e of (efforts ?? []) as EffortRow[]) {
      if (e.distance_m <= 0) continue;   // sentinel, not a mark
      const list = effortsBy.get(e.user_id) ?? [];
      list.push(e);
      effortsBy.set(e.user_id, list);
    }

    const nameOf = new Map(
      ((profiles ?? []) as Array<{ id: string; name: string | null; username: string | null }>)
        .map(p => [p.id, p]));

    const group: AthleteBadges[] = everyone.map(id => ({
      userId:   id,
      name:     nameOf.get(id)?.name ?? null,
      username: nameOf.get(id)?.username ?? null,
      isMe:     id === user.id,
      unlocked: detectAchievements(byUser.get(id) ?? [], effortsBy.get(id) ?? [])
        .filter(a => a.unlocked)
        .map(a => a.id),
    }));

    return NextResponse.json({ group });
  } catch {
    // Never break the page over a comparison — show the athlete alone.
    return NextResponse.json({ group: [] });
  }
}
