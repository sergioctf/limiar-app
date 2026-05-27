// ─────────────────────────────────────────────────────────
// Database types — mirror Supabase schema
// ─────────────────────────────────────────────────────────

export type RunSource = "strava" | "manual" | "imported_ai" | "strava+ai";

export type RunType =
  | "easy"
  | "long_run"
  | "tempo"
  | "intervals"
  | "race"
  | "recovery"
  | "steady"
  | "progression"
  | "other";

export type GoalStatus = "upcoming" | "active" | "completed" | "cancelled";

export type RaceScenario = "conservative" | "balanced" | "aggressive";

export type ProjectionScenario = "conservative" | "likely" | "optimistic";

export type CoachReportPeriodType =
  | "run"
  | "week"
  | "month"
  | "cycle"
  | "general";

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export interface StravaConnection {
  id: string;
  user_id: string;
  athlete_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  created_at: string;
  updated_at: string;
}

export interface Run {
  id: string;
  user_id: string;
  strava_activity_id: number | null;
  source: RunSource;
  name: string;
  date: string;
  type: RunType;
  distance_km: number;
  duration_seconds: number;
  moving_time_seconds: number | null;
  elapsed_time_seconds: number | null;
  avg_pace_seconds_per_km: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  avg_cadence: number | null;
  calories: number | null;
  suffer_score: number | null;
  map_polyline: string | null;
  device_name: string | null;
  temperature_c: number | null;
  conditions: string | null;
  perceived_effort: number | null;
  hydration: string | null;
  gel_usage: string | null;
  notes: string | null;
  relevance: number | null;
  raw_text: string | null;
  coach_feedback: string | null;
  strava_raw_json: Record<string, unknown> | null;
  workout_score: number | null;
  synced_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  tags?: string[];
}

export interface RunTag {
  id: string;
  run_id: string;
  tag: string;
}

export interface Goal {
  id: string;
  user_id: string;
  race_name: string;
  distance_km: number;
  race_date: string | null;
  target_time_seconds: number | null;
  target_pace_seconds_per_km: number | null;
  conservative_time_seconds: number | null;
  likely_time_seconds: number | null;
  optimistic_time_seconds: number | null;
  status: GoalStatus;
  strategy: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RaceStrategy {
  id: string;
  user_id: string;
  goal_id: string | null;
  title: string;
  scenario: RaceScenario;
  target_time_seconds: number | null;
  target_pace_seconds_per_km: number | null;
  strategy_text: string | null;
  hydration_plan: string | null;
  gel_plan: string | null;
  splits_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CoachReport {
  id: string;
  user_id: string;
  title: string;
  report_date: string;
  period_type: CoachReportPeriodType;
  period_start: string | null;
  period_end: string | null;
  summary: string | null;
  full_report: string | null;
  strengths: string | null;
  weaknesses: string | null;
  projections: string | null;
  recommendations: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingCycle {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  objective: string | null;
  planned_volume_km: number | null;
  actual_volume_km: number | null;
  notes: string | null;
  final_assessment: string | null;
  created_at: string;
  updated_at: string;
}

export interface Projection {
  id: string;
  user_id: string;
  distance_km: number;
  scenario: ProjectionScenario;
  projected_time_seconds: number;
  projected_pace_seconds_per_km: number;
  confidence: string | null;
  assumptions: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  user_id: string;
  source: string;
  status: "success" | "error" | "partial";
  message: string | null;
  activities_imported: number;
  activities_updated: number;
  activities_ignored: number;
  created_at: string;
}

// ─────────────────────────────────────────────────────────
// UI / computed types
// ─────────────────────────────────────────────────────────

export interface WeeklyVolume {
  week: string;        // "2024-W12"
  weekLabel: string;   // "Sem 12"
  totalKm: number;
  runs: number;
}

export interface MonthlyVolume {
  month: string;       // "2024-03"
  monthLabel: string;  // "Mar/24"
  totalKm: number;
  runs: number;
}

export interface PaceTrend {
  date: string;
  pace: number;        // seconds/km
  paceLabel: string;
  distance: number;
  type: RunType;
}

export interface DashboardStats {
  totalRuns: number;
  totalDistanceKm: number;
  totalDurationSeconds: number;
  avgPaceSecondsPerKm: number | null;
  longestRunKm: number;
  bestPaceSecondsPerKm: number | null;
  weeklyVolumeKm: number;
  monthlyVolumeKm: number;
  stravaImported: number;
  withCoachFeedback: number;
  lastRun: Run | null;
  nextGoal: Goal | null;
}
