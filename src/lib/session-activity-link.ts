import type { SportKey } from "@/lib/sports";
import type { WeeklyPlanDay } from "@/types";

export interface SessionActivityLink {
  session_date: string;
  sport: SportKey;
  session_type: string;
  run_id: string | null;
  activity_id: string | null;
  planned: WeeklyPlanDay;
}

export type ActivityRef = { kind: "run" | "activity"; id: string };

export function sameActivity(link: SessionActivityLink, activity: ActivityRef): boolean {
  return (activity.kind === "run" ? link.run_id : link.activity_id) === activity.id;
}

/** undefined means inference may continue. null means a different record was selected. */
export function linkedReference(link: SessionActivityLink | undefined, activity: ActivityRef): WeeklyPlanDay | null | undefined {
  if (!link) return undefined;
  return sameActivity(link, activity) ? link.planned : null;
}

export function sessionLinkFor(links: SessionActivityLink[], date: string, sport: SportKey) {
  return links.find(link => link.session_date === date && link.sport === sport);
}
