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
  username: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────
// Social (friends + leaderboard)
// ─────────────────────────────────────────────────────────

export type FriendshipStatus = "pending" | "accepted";

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
}

/** A friend entry as returned by the friends API (joined with profile). */
export interface FriendSummary {
  friendshipId: string;
  userId: string;
  name: string | null;
  username: string | null;
  direction?: "incoming" | "outgoing"; // only for pending requests
}

/** Aggregated, privacy-safe stats for the leaderboard. */
export interface FriendStats {
  userId: string;
  name: string | null;
  username: string | null;
  isMe: boolean;
  weekKm: number;
  lastWeekKm: number;
  monthKm: number;
  streak: number;
  best5kSeconds: number | null;
  best10kSeconds: number | null;
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
// Activities (all sport types — non-run Strava + manual gym)
// ─────────────────────────────────────────────────────────

export type SportType =
  | "Run" | "TrailRun" | "VirtualRun"
  | "WeightTraining" | "Workout" | "Crossfit" | "Yoga" | "Pilates"
  | "Ride" | "VirtualRide" | "EBikeRide"
  | "Swim" | "OpenWaterSwim"
  | "Walk" | "Hike"
  | "Soccer" | "Tennis" | "Basketball" | "Other";

export interface GymExercise {
  name: string;
  sets?: number;
  reps?: number;
  weight_kg?: number;
  notes?: string;
}

export interface Activity {
  id: string;
  user_id: string;
  strava_activity_id: number | null;
  name: string;
  sport_type: string;
  date: string;                // YYYY-MM-DD
  duration_seconds: number | null;
  distance_m: number | null;
  calories: number | null;
  avg_hr: number | null;
  elevation_gain_m: number | null;
  source: "strava" | "manual";
  notes: string | null;
  exercises: GymExercise[] | null;
  strava_raw_json: Record<string, unknown> | null;
  created_at: string;
  deleted_at: string | null;
}

/** Unified entry used by the calendar (merges Run + Activity rows) */
export interface CalendarEntry {
  id: string;
  date: string;
  name: string;
  sport_type: string;
  duration_seconds: number | null;
  distance_km: number | null;
  calories: number | null;
  avg_hr: number | null;
  source: string;
  // run-specific
  avg_pace_seconds_per_km?: number | null;
  type?: string;
  // gym-specific
  exercises?: GymExercise[] | null;
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

// ─────────────────────────────────────────────────────────
// Performance Tests (bi-monthly 3km time trials)
// ─────────────────────────────────────────────────────────

export interface PerformanceTest {
  id: string;
  user_id: string;
  test_date: string;        // YYYY-MM-DD
  distance_km: number;      // default 3.0
  time_seconds: number;     // total time
  avg_hr: number | null;
  max_hr: number | null;
  notes: string | null;
  vo2max_estimate: number | null;
  vdot: number | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────
// Weekly training plan (AI-generated, structured)
// ─────────────────────────────────────────────────────────

export type PlanDayType =
  | "rest" | "easy" | "tempo" | "intervals"
  | "long_run" | "recovery" | "test" | "race" | "strength";

// ── Structured workout (steps a watch can execute) ────────

export type WorkoutStepKind = "warmup" | "run" | "recovery" | "cooldown";

export interface WorkoutStep {
  kind:         WorkoutStepKind;
  distance_km?: number;   // either distance…
  duration_min?: number;  // …or duration
  pace?:        string;   // target, e.g. "4:25–4:35/km"
  note?:        string;   // e.g. "ritmo controlado, não acelerar"
}

export interface WorkoutRepeat {
  repeat: number;         // e.g. 6 × (run + recovery)
  steps:  WorkoutStep[];
}

export type WorkoutBlock = WorkoutStep | WorkoutRepeat;

export interface StructuredWorkout {
  blocks: WorkoutBlock[];
}

export function isRepeatBlock(b: WorkoutBlock): b is WorkoutRepeat {
  return (b as WorkoutRepeat).repeat !== undefined;
}

export interface WeeklyPlanDay {
  day:         "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  dayPt:       string;       // "Segunda", "Terça", …
  type:        PlanDayType;
  label:       string;       // "Rodagem", "Tiro", "Longão", "Descanso" …
  distance_km?: number;
  duration_min?: number;
  pace?:       string;       // "6:30–6:45/km"
  description: string;
  /** step-by-step structure for quality sessions (exportable to watch) */
  structure?:  StructuredWorkout;
}

export interface WeeklyPlanData {
  week_start:   string;      // YYYY-MM-DD (Monday)
  days:         WeeklyPlanDay[];
  ai_message?:  string;      // Proactive question / observation
  generated_at: string;      // ISO timestamp
}

export interface PlanChatMessage {
  role:      "user" | "assistant";
  content:   string;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────
// Macro plan — long-term periodization toward a target race
// ─────────────────────────────────────────────────────────

export type MacroRaceType = "5k" | "10k" | "half" | "marathon" | "ultra" | "triathlon" | "other";
export type MacroPhase = "base" | "build" | "peak" | "taper" | "race";

export interface MacroPlanWeek {
  week_start:  string;     // Monday YYYY-MM-DD
  phase:       MacroPhase;
  target_km:   number;
  focus:       string;     // e.g. "volume aeróbico"
  key_workout: string;     // e.g. "longão 16km"
}

export interface MacroPlanData {
  weeks:           MacroPlanWeek[];
  phases_summary:  Array<{ phase: MacroPhase; weeks: number; description: string }>;
  rationale:       string;
  adaptation_note?: string;
  adapted_at?:      string;
}

export interface MacroPlan {
  id:           string;
  user_id:      string;
  race_type:    MacroRaceType;
  race_label:   string;
  target_month: string;     // YYYY-MM (estimated — editable)
  status:       "active" | "completed" | "cancelled";
  plan_json:    MacroPlanData;
  created_at:   string;
  updated_at:   string;
}

// ─────────────────────────────────────────────────────────
// Health & body (Phase 2)
// ─────────────────────────────────────────────────────────

/** Common runner soreness areas (key → label) for the body-area chips. */
export const SORENESS_AREAS: Record<string, string> = {
  panturrilha: "Panturrilha",
  canela:      "Canela",
  joelho:      "Joelho",
  posterior:   "Posterior de coxa",
  quadriceps:  "Quadríceps",
  quadril:     "Quadril",
  tornozelo:   "Tornozelo",
  pe:          "Pé / planta",
  lombar:      "Lombar",
  aquiles:     "Tendão de Aquiles",
};

export interface HealthCheckin {
  id?:            string;
  user_id?:       string;
  date:           string;             // YYYY-MM-DD
  sleep_hours:    number | null;
  sleep_quality:  number | null;      // 1-5
  energy:         number | null;      // 1-5
  soreness:       number | null;      // 1-5 (1 = nenhuma)
  soreness_areas: string[] | null;    // keys of SORENESS_AREAS
  rpe:            number | null;      // 1-10 (treino de ontem)
  notes:          string | null;
  created_at?:    string;
  updated_at?:    string;
}

export interface Supplement {
  id?:        string;
  user_id?:   string;
  name:       string;
  dosage:     string | null;
  timing:     string | null;
  notes:      string | null;
  active:     boolean;
  created_at?: string;
}

export interface WellnessData {
  id?:            string;
  user_id?:       string;
  date:           string;             // YYYY-MM-DD
  sleep_seconds:  number | null;
  sleep_score:    number | null;      // 0-100
  hrv_ms:         number | null;
  hrv_status:     string | null;      // balanced | unbalanced | low | poor
  resting_hr:     number | null;
  stress_avg:     number | null;      // 0-100
  body_battery:   number | null;      // 0-100
  source:         string;             // healthconnect | healthkit | garmin | manual_import
  created_at?:    string;
  updated_at?:    string;
}

export interface BodyMeasurement {
  id?:             string;
  user_id?:        string;
  date:            string;            // YYYY-MM-DD
  weight_kg:       number;            // required
  body_fat_pct:    number | null;
  muscle_mass_kg:  number | null;
  water_pct:       number | null;
  visceral_fat:    number | null;
  bone_mass_kg:    number | null;
  bmi:             number | null;
  basal_kcal:      number | null;
  notes:           string | null;
  created_at?:     string;
  updated_at?:     string;
}

// ─────────────────────────────────────────────────────────
// Coach Memory — athlete notes extracted from conversations
// ─────────────────────────────────────────────────────────

export type AthleteNoteCategory =
  | "injury"        // lesões, dores
  | "preference"    // preferências de treino
  | "availability"  // disponibilidade (dias, horários)
  | "goal"          // objetivos de performance
  | "observation";  // observações gerais

export interface AthleteNote {
  id:         string;
  user_id:    string;
  category:   AthleteNoteCategory;
  content:    string;
  source:     string;   // "chat" | "run_analysis" | "plan" | "manual"
  active:     boolean;
  created_at: string;
  updated_at: string;
}

export interface CoachChatMessage {
  id:         string;
  user_id:    string;
  report_id:  string | null;
  role:       "user" | "assistant";
  content:    string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────
// Races (official race results + upcoming target races)
// ─────────────────────────────────────────────────────────

export interface Race {
  id: string;
  user_id: string;
  name: string;
  race_date: string;             // YYYY-MM-DD
  distance_km: number;
  time_seconds: number | null;   // null = future race (no result yet)
  avg_hr: number | null;
  notes: string | null;
  location: string | null;
  is_target_race: boolean;
  bib_number: string | null;
  weather: string | null;
  created_at: string;
}
