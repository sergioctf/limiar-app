import { validPerception, validRpe, type Perception } from "@/lib/debrief";
import { SPORTS, toSportKey } from "@/lib/sports";
import type { WeeklyPlanDay } from "@/types";

const HOUR = 3_600_000;
const UUID = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;

export const ACTIVITY_REASONS = {
  as_expected: "Tudo certo", well: "Estava me sentindo bem", time: "Tempo ou agenda",
  weather: "Clima", sleep: "Sono", fatigue: "Cansaço", discomfort: "Incômodo",
  intentional: "Mudei de propósito", other: "Outro motivo",
} as const;

type Reason = keyof typeof ACTIVITY_REASONS;
type Status = "answered" | "deferred" | "skipped";

export interface FeedbackActivity {
  id: string;
  name: string | null;
  date: string;
  sport_type: string;
  duration_seconds: number | null;
  distance_m: number | null;
  avg_hr: number | null;
}
export interface ActivityFeedback {
  activity_id: string;
  status: Status;
  perception: Perception | null;
  rpe: number | null;
  reason: Reason | null;
  note: string | null;
  planned: WeeklyPlanDay | null;
  updated_at: string;
}
export interface ActivityFeedbackItem {
  activity: FeedbackActivity;
  feedback: ActivityFeedback | null;
  planned: WeeklyPlanDay | null;
}
export type ActivityFeedbackInput =
  | { activityId: string; status: "skipped" | "deferred" }
  | { activityId: string; status: "answered"; perception: Perception; rpe?: number | null; reason: Reason; note?: string };

export function validActivityFeedback(body: unknown): body is ActivityFeedbackInput {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.activityId !== "string" || !UUID.test(b.activityId)) return false;
  if (b.status === "deferred" || b.status === "skipped") return true;
  return b.status === "answered" && validPerception(b.perception) && validRpe(b.rpe)
    && typeof b.reason === "string" && Object.prototype.hasOwnProperty.call(ACTIVITY_REASONS, b.reason)
    && (b.note === undefined || (typeof b.note === "string" && b.note.length <= 300));
}

export function supportsActivityDebrief(activity: FeedbackActivity): boolean {
  const sport = toSportKey(activity.sport_type);
  return sport != null && sport !== "outro" && sport !== "corrida"
    && ((activity.duration_seconds ?? 0) > 0 || (activity.distance_m ?? 0) > 0);
}

export function activityDebriefCandidate(items: ActivityFeedbackItem[], since: string, now = Date.now()) {
  return items.find(({ activity, feedback }) => activity.date >= since &&
    (!feedback || (feedback.status === "deferred" && now - Date.parse(feedback.updated_at) >= 8 * HOUR))) ?? null;
}

export function activityPlanMatch(activity: FeedbackActivity, others: FeedbackActivity[], days: WeeklyPlanDay[]) {
  const sport = toSportKey(activity.sport_type);
  if (!sport || others.filter(a => a.date === activity.date && toSportKey(a.sport_type) === sport).length !== 1) return null;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${activity.date}T12:00:00Z`).getUTCDay()];
  const planned = days.find(d => d.day === day);
  if (!planned || planned.type === "rest") return null;
  if (sport === "musculacao" && planned.strength) {
    return { ...planned, label: "Musculação", sport, duration_min: planned.strength.estimatedMinutes, distance_km: undefined };
  }
  return planned.sport === sport ? planned : null;
}

export function activityComparison(activity: FeedbackActivity, plan: WeeklyPlanDay | null) {
  const sport = toSportKey(activity.sport_type);
  const distance = Boolean(sport && SPORTS[sport].unit === "distance" && plan?.distance_km && activity.distance_m);
  const goal = distance ? (plan?.distance_km ?? 0) * 1000 : (plan?.duration_min ?? 0) * 60;
  const actual = distance ? activity.distance_m : activity.duration_seconds;
  if (goal <= 0 || actual == null || actual <= 0) return null;
  const ratio = actual / goal;
  const metric = distance ? "distância" : "duração";
  if (ratio < .85) return { question: "O que encurtou este treino?", summary: `A ${metric} registrada ficou abaixo da referência.` };
  if (ratio > 1.15) return { question: "Você quis estender o treino?", summary: `A ${metric} registrada ficou acima da referência.` };
  return { question: "Tudo ocorreu como previsto?", summary: `A ${metric} registrada ficou próxima da referência.` };
}
