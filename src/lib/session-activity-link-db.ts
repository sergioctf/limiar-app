import type { createClient } from "@/lib/supabase/server";
import type { SessionActivityLink } from "@/lib/session-activity-link";
import { dayStatus } from "@/lib/day-status";
import { loadWeeklyPlan } from "@/lib/weekly-plan";
import { athleteDateStr, athleteMondayStr } from "@/lib/week";
import { dayKeyOf } from "@/lib/session-swap";

export async function loadSessionActivityLinks(db: ReturnType<typeof createClient>, userId: string, since: string, until?: string) {
  try {
    let query = db.from("session_activity_links").select("session_date,sport,session_type,run_id,activity_id,planned")
      .eq("user_id", userId).gte("session_date", since);
    if (until) query = query.lte("session_date", until);
    const { data, error } = await query;
    // Older environments still show unresolved candidates. Writes require 045.
    return error ? [] : (data ?? []) as SessionActivityLink[];
  } catch {
    return [];
  }
}

/** Infer only when exactly one eligible record is on that day. */
export async function inferRunSession(db: ReturnType<typeof createClient>, userId: string, run: { id: string; date: string }) {
  const week = athleteMondayStr(new Date(`${run.date}T15:00:00Z`));
  const [{ plan }, { data, error }] = await Promise.all([
    loadWeeklyPlan(db, userId, week),
    db.from("runs").select("id,date,distance_km,duration_seconds,moving_time_seconds,elapsed_time_seconds")
      .eq("user_id", userId).eq("date", run.date).is("deleted_at", null),
  ]);
  if (error || !plan?.generated_at || athleteDateStr(new Date(plan.generated_at)) > run.date) return null;
  const planned = plan.days.find(day => day.day === dayKeyOf(run.date));
  const status = dayStatus({ date: run.date, planned, runs: data ?? [], activities: [] });
  return status.done.some(item => item.planned && item.kind === "run" && item.id === run.id) ? planned ?? null : null;
}
