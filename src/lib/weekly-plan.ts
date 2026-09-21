/**
 * Weekly plan orchestration — shared by the API route (on-demand) and the
 * Monday cron (automatic). Handles: reading a cached plan, gathering athlete
 * context, generating via AI, and upserting the week's coach_report.
 */
import { normalizeWeeklyPlanDays, generateCoachNote } from "@/lib/ai";
import { toBrt } from "@/lib/plan-notify";
import { localDateStr } from "@/lib/week";
import { cyclePosition, cutbackWeekIndex, recoveryApplies, weekIsUnderway, regenerationTarget } from "@/lib/mesocycle";
import { testStatus, shouldScheduleTest } from "@/lib/test-status";
import { normalizeSports } from "@/lib/sports";
import { computeMetrics, paceToString, type TrainingPace } from "@/lib/performance";
import {
  buildWeekPlan, planWeeklyVolume, provenCapacity, volumeWithRatchet, normalizePrefs, isLegacyPlanShape, type WeekContext,
} from "@/lib/workout-builder";
import { normalizeStrengthPrefs, type StrengthPrefs } from "@/lib/strength-prefs";
import { prefsForAgenda } from "@/lib/week-fit";
import { planFingerprint, planStaleness, type Staleness } from "@/lib/plan-freshness";
import { readWeek, type ShortfallReason, type WeekReading } from "@/lib/week-reading";
import { allowedWeekNumbers, fallbackWeekNote, noteRespectsPlan, type WeekNoteFacts } from "@/lib/week-note";
import { stillValidFilter, weekStartsAt } from "@/lib/athlete-notes";
import type { RunContext } from "@/lib/run-feedback";
import type { WeeklyPlanData, WeeklyPlanDay, Run, TrainingPrefs } from "@/types";

/** Supabase client shape we rely on (service-role or user-scoped). */
type DbClient = ReturnType<typeof import("@/lib/supabase/server").createAdminClient>;

export interface PlanPaces {
  easy?: string; threshold?: string; long?: string; interval?: string;
}

/**
 * Monday (YYYY-MM-DD) of the week containing `d`, on the ATHLETE's calendar.
 *
 * This has to agree with the browser, which computes the week in São Paulo
 * time. Using the server's local clock (UTC on Vercel) made the two disagree
 * between 21:00 and midnight BRT — and on a Sunday night they disagreed about
 * the whole week, so the app rejected its own request with "Semana inválida".
 */
export function mondayOf(d: Date): string {
  const m = toBrt(d);
  m.setUTCHours(0, 0, 0, 0);
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
  return m.toISOString().slice(0, 10);
}

/** Monday of the week after the one containing `d`. */
export function nextMondayOf(d: Date): string {
  const m = new Date(`${mondayOf(d)}T12:00:00Z`);
  m.setUTCDate(m.getUTCDate() + 7);
  return m.toISOString().slice(0, 10);
}

/** Monday of the week before the one containing `d`. */
export function previousMondayOf(d: Date): string {
  const m = new Date(`${mondayOf(d)}T12:00:00Z`);
  m.setUTCDate(m.getUTCDate() - 7);
  return m.toISOString().slice(0, 10);
}

/** Sunday (YYYY-MM-DD) closing the week that starts on `mondayStr`. */
function sundayOf(mondayStr: string): string {
  const d = new Date(`${mondayStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/** Training paces derived from the athlete's latest 3km test. */
export async function pacesFromLatestTest(db: DbClient, userId: string): Promise<PlanPaces | null> {
  try {
    const { data } = await db
      .from("performance_tests").select("distance_km, time_seconds, avg_hr, max_hr")
      .eq("user_id", userId).order("test_date", { ascending: false }).limit(1);
    const test = data?.[0];
    if (!test) return null;

    const metrics = computeMetrics(test.distance_km * 1000, test.time_seconds, test.avg_hr ?? undefined, test.max_hr ?? undefined);
    const find = (name: string) => metrics.paces.find(p => p.name === name);
    const fmt  = (min: number, max: number) => `${paceToString(min)}–${paceToString(max)}/km`;
    const easy = find("easy"), threshold = find("threshold");
    const marathon = find("marathon"), interval = find("interval");

    return {
      easy:      easy      ? fmt(easy.pace_min_sec,      easy.pace_max_sec)      : undefined,
      threshold: threshold ? fmt(threshold.pace_min_sec, threshold.pace_max_sec) : undefined,
      long:      marathon  ? fmt(marathon.pace_min_sec,  marathon.pace_max_sec)  : undefined,
      interval:  interval  ? fmt(interval.pace_min_sec,  interval.pace_max_sec)  : undefined,
    };
  } catch {
    return null;
  }
}

export interface AthleteFitness {
  lthr:          number | null;
  trainingPaces: TrainingPace[] | null;
  /** Reserved: paces are only ever measured today, never estimated. */
  estimated:     boolean;
}

/**
 * Training paces and LTHR for the athlete — from the 3 km test only.
 *
 * We deliberately do NOT estimate these from training runs. A pace derived from
 * whatever the athlete happened to run hardest looks as authoritative on screen
 * as a measured one, but it isn't: training runs aren't maximal, aren't a fixed
 * distance, and vary with terrain and weather. Prescribing intensity from that
 * is worse than prescribing none, because the athlete can't tell it's a guess.
 *
 * Without a test the plan still works — it just carries distances and session
 * types, and the UI asks for the test instead of showing invented numbers.
 */
/**
 * What last week asked for and what the athlete actually ran.
 *
 * The plan is stored as JSON in `coach_reports`, so the previous prescription
 * has to be read back rather than recomputed — recomputing it would reproduce
 * whatever the history said at the time, which is exactly the number the
 * ratchet exists to stop trusting.
 */
/** The Monday `weeks` weeks before `mondayStr`. */
function mondayMinus(mondayStr: string, weeks: number): string {
  const d = new Date(`${mondayStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}

async function weekVolumes(
  db: DbClient, userId: string, prev: string,
  runs: Array<{ date: string; distance_km: number }>,
): Promise<{ plannedKm: number; actualKm: number } | null> {
  const prevEnd = sundayOf(prev);

  const { data } = await db
    .from("coach_reports").select("full_report")
    .eq("user_id", userId).eq("period_type", "week").eq("period_start", prev)
    .limit(1);

  const report = data?.[0]?.full_report;
  if (!report) return null;

  let plannedKm = 0;
  try {
    for (const d of (JSON.parse(report as string)?.days ?? [])) {
      plannedKm += Number(d?.distance_km ?? 0);
    }
  } catch { return null; }
  if (plannedKm <= 0) return null;

  // An unfinished week cannot fail an adherence check it has not had the chance
  // to pass. Generating next week's plan on a Tuesday judged the current week on
  // two days of running, decided the athlete had stopped, and released the
  // ratchet — the exact shrink this was built to prevent. Until the week closes,
  // it counts as met.
  const today = new Date().toISOString().slice(0, 10);
  if (prevEnd >= today) {
    return { plannedKm: Math.round(plannedKm), actualKm: Math.round(plannedKm) };
  }

  const actualKm = runs
    .filter(r => r.date >= prev && r.date <= prevEnd)
    .reduce((s, r) => s + Number(r.distance_km ?? 0), 0);

  return { plannedKm: Math.round(plannedKm), actualKm: Math.round(actualKm) };
}

async function previousWeekVolumes(
  db: DbClient, userId: string, weekStart: string,
  runs: Array<{ date: string; distance_km: number }>,
): Promise<{ plannedKm: number; actualKm: number } | null> {
  return weekVolumes(db, userId, mondayMinus(weekStart, 1), runs);
}

/** What the athlete said in that week's post-run check-ins. */
async function weekCheckinContexts(
  db: DbClient, userId: string, monday: string, runs: Array<{ id: string; date: string }>,
): Promise<RunContext[]> {
  const end = sundayOf(monday);
  const ids = runs.filter(r => r.date >= monday && r.date <= end).map(r => r.id);
  if (ids.length === 0) return [];
  const { data } = await db.from("run_feedback").select("context").eq("user_id", userId).in("run_id", ids);
  return ((data ?? []) as Array<{ context: string | null }>)
    .map(r => r.context).filter((c): c is RunContext => !!c && c !== "none" && c !== "other");
}

/** The athlete's own answer about that week, when the coach asked and they replied. */
async function weekAnswer(db: DbClient, userId: string, monday: string): Promise<ShortfallReason | null> {
  const { data } = await db.from("week_feedback").select("reason")
    .eq("user_id", userId).eq("week_start", monday).limit(1);
  const reason = (data as Array<{ reason: string }> | null)?.[0]?.reason;
  return reason === "life" || reason === "body" || reason === "too_much" ? reason : null;
}

/**
 * Did the athlete ask for lighter sessions during that week?
 *
 * Read by when the answer was given, not by the run's date: a Sunday run
 * answered on Monday asks to lighten Monday's week, so the following one is the
 * week that must not ramp.
 */
async function reductionRequestedIn(db: DbClient, userId: string, monday: string): Promise<boolean> {
  // Monday 00:00 in São Paulo is 03:00 UTC.
  const { data } = await db.from("run_feedback").select("run_id")
    .eq("user_id", userId).eq("reduce_requested", true)
    .gte("updated_at", `${monday}T03:00:00Z`).lt("updated_at", `${mondayMinus(monday, -1)}T03:00:00Z`)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * The reading of the week that just closed, with the one before it as context.
 *
 * Every lookup degrades to "nothing known": a missing table or a failed query
 * must never cost the athlete their plan, and an unexplained short week is held
 * once anyway.
 */
/** The reading of the week that closed before `weekStart`, for screens and routes. */
export async function weekReadingFor(
  db: DbClient, userId: string, weekStart: string,
  runs: Array<{ id: string; date: string; distance_km: number }>,
): Promise<WeekReading | null> {
  const previous = await weekVolumes(db, userId, mondayMinus(weekStart, 1), runs).catch(() => null);
  if (!previous) return null;
  return readPreviousWeek(db, userId, weekStart, runs, previous).catch(() => null);
}

export async function readPreviousWeek(
  db: DbClient, userId: string, weekStart: string,
  runs: Array<{ id: string; date: string; distance_km: number }>,
  previous: { plannedKm: number; actualKm: number },
): Promise<WeekReading> {
  const prev = mondayMinus(weekStart, 1);
  const earlier = mondayMinus(weekStart, 2);
  const [contexts, answer, earlierVolumes, reductionRequested] = await Promise.all([
    weekCheckinContexts(db, userId, prev, runs).catch(() => [] as RunContext[]),
    weekAnswer(db, userId, prev).catch(() => null),
    weekVolumes(db, userId, earlier, runs).catch(() => null),
    reductionRequestedIn(db, userId, prev).catch(() => false),
  ]);
  // Four quiet weeks is not a bad week; it is someone who stopped, and the
  // volume engine already knows how to bring them back.
  const inactive = !runs.some(r => r.date >= mondayMinus(weekStart, 5) && r.date < prev && Number(r.distance_km) > 0);
  const heldLastWeek = earlierVolumes
    ? readWeek({
      plannedKm: earlierVolumes.plannedKm,
      actualKm: earlierVolumes.actualKm,
      contexts: await weekCheckinContexts(db, userId, earlier, runs).catch(() => [] as RunContext[]),
      answer: await weekAnswer(db, userId, earlier).catch(() => null),
    }).holding
    : false;
  return readWeek({ plannedKm: previous.plannedKm, actualKm: previous.actualKm, contexts, answer, heldLastWeek, inactive, reductionRequested });
}

export async function athleteFitness(
  db: DbClient, userId: string,
): Promise<AthleteFitness> {
  try {
    const { data } = await db
      .from("performance_tests").select("distance_km, time_seconds, avg_hr, max_hr")
      .eq("user_id", userId).order("test_date", { ascending: false }).limit(1);

    const test = data?.[0];
    if (!test) return { lthr: null, trainingPaces: null, estimated: false };

    const m = computeMetrics(test.distance_km * 1000, test.time_seconds, test.avg_hr ?? undefined, test.max_hr ?? undefined);

    // Heart-rate zones need the test's average HR; paces don't.
    return {
      lthr: test.avg_hr ? m.lthr : null,
      trainingPaces: m.paces,
      estimated: false,
    };
  } catch {
    return { lthr: null, trainingPaces: null, estimated: false };
  }
}

/**
 * The active macro plan's target for this week, when there is one.
 *
 * The athlete's complaint was that the long-term plan and the weekly plan "did
 * not talk to each other" — they were computed from separate volume estimates
 * and drifted apart immediately.
 */
async function macroTargetFor(
  db: DbClient, userId: string, weekStart: string,
): Promise<number | null> {
  try {
    const { data } = await db
      .from("training_macro_plans").select("plan_json")
      .eq("user_id", userId).eq("status", "active")
      .order("updated_at", { ascending: false }).limit(1);

    const weeks = (data?.[0]?.plan_json?.weeks ?? []) as Array<{ week_start: string; target_km: number }>;
    const week = weeks.find(w => w.week_start === weekStart);
    return week && week.target_km > 0 ? week.target_km : null;
  } catch {
    return null;
  }
}

/** Weekly running volume (km) for the 4 weeks before `weekStart`, recent first. */
export function weeklyVolumesBefore(runs: Run[], weekStart: string, today?: string): number[] {
  const out: number[] = [];
  const start = new Date(`${weekStart}T12:00:00`);
  const now = today ?? localDateStr();

  for (let i = 1; i <= 4; i++) {
    const from = new Date(start); from.setDate(from.getDate() - i * 7);
    const to   = new Date(start); to.setDate(to.getDate() - (i - 1) * 7);
    // setDate above is local; reading these back as UTC is the mismatch that
    // has already shipped three times. Noon anchoring hid it in Brazil and
    // would not east of Greenwich.
    const fromStr = localDateStr(from);
    const toStr   = localDateStr(to);

    // A week still in progress is not a data point.
    //
    // Generating next week's plan on a Tuesday counted the current week — two
    // days old — as a finished one, so 4 km on Tuesday entered the average
    // beside three complete weeks and dragged the whole plan down. Every plan
    // built before Sunday understated the athlete's volume, and the earlier in
    // the week it ran, the worse the error. This is the most load-bearing
    // number in the app: it decides every distance the athlete is given.
    if (toStr > now) continue;

    out.push(
      runs.filter(r => r.date >= fromStr && r.date < toStr)
          .reduce((s, r) => s + r.distance_km, 0),
    );
  }
  return out;
}

/**
 * Periodization phase for the week, based on how far the target race is.
 * Taper in the final 2 weeks, peak in the 3 before that, then build/base.
 */
/**
 * Monday of the athlete's first training week — the anchor every block counts
 * from.
 *
 * Any anchor is arbitrary, since a cycle has to start somewhere. This one is
 * derived from data we already hold, never moves under the athlete, and gives
 * a returning athlete the same block structure as a new one.
 */
async function firstTrainingMonday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
): Promise<string | null> {
  const { data } = await db
    .from("runs").select("date")
    .eq("user_id", userId).is("deleted_at", null)
    .order("date", { ascending: true }).limit(1);
  const first = (data as Array<{ date: string }> | null)?.[0]?.date;
  // The athlete-calendar mondayOf above, not the one in lib/mesocycle: this
  // file already resolves weeks in BRT, and mixing the two would put the block
  // boundary a day out on Sunday nights.
  return first ? mondayOf(new Date(`${first}T12:00:00Z`)) : null;
}

/**
 * Running volume the athlete has already been promised for this week.
 *
 * Read from the stored report rather than recomputed, because the point is
 * exactly what they saw — not what the engine would produce today.
 */
async function currentWeekPlannedKm(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  weekStart: string,
): Promise<number | null> {
  const { data } = await db
    .from("coach_reports").select("full_report")
    .eq("user_id", userId).eq("period_type", "week").eq("period_start", weekStart)
    .limit(1);
  const raw = (data as Array<{ full_report: string | null }> | null)?.[0]?.full_report;
  if (!raw) return null;
  try {
    const plan = JSON.parse(raw) as { days?: Array<{ distance_km?: number | null }> };
    const km = (plan.days ?? []).reduce((s, d) => s + (d.distance_km ?? 0), 0);
    return km > 0 ? km : null;
  } catch { return null; }
}

export function phaseForRace(raceDate: string | null, weekStart: string): WeekContext["phase"] {
  if (!raceDate) return "base";
  const days = Math.round(
    (new Date(`${raceDate}T12:00:00`).getTime() - new Date(`${weekStart}T12:00:00`).getTime()) / 86400000,
  );
  if (days < 0)  return "base";
  if (days <= 7)  return "race";
  if (days <= 21) return "taper";
  if (days <= 42) return "peak";
  if (days <= 84) return "build";
  return "base";
}

/**
 * O recado da semana — contexto, nunca os treinos.
 *
 * Escrito pela IA e **conferido pelo código**: todo número em km que ele citar
 * tem que estar no plano (`noteRespectsPlan`). Em 21/09 o recado da semana de
 * recuperação de 28/09 inventou "6 km" e "20 km" e não disse que a semana era
 * de recuperação; o prompt já proibia distâncias e o modelo escreveu assim
 * mesmo. Recado reprovado vira o do motor (`fallbackWeekNote`), que só diz o
 * que o plano tem. Sem IA disponível, também.
 */
async function coachNoteFor(input: {
  phase: WeekContext["phase"];
  nextRace: { name: string; date: string; distance_km: number } | null;
  vdot: number | null; athleteProfile: string | null;
  facts: WeekNoteFacts;
}): Promise<string> {
  const note = await generateCoachNote({
    weeklyKm: input.facts.weeklyKm,
    phase: input.phase ?? "base",
    nextRace: input.nextRace,
    vdot: input.vdot,
    athleteProfile: input.athleteProfile,
    previousPlannedKm: input.facts.previousPlannedKm,
    isRecovery: input.facts.isRecovery,
    sessions: input.facts.sessions,
  }).catch(() => null);

  return note && noteRespectsPlan(note, allowedWeekNumbers(input.facts))
    ? note
    : fallbackWeekNote(input.facts);
}

/** Read the stored plan for a week, repaired so the UI can always render it. */
export async function loadWeeklyPlan(
  db: DbClient, userId: string, weekStart: string,
): Promise<{ plan: WeeklyPlanData | null; reportId: string | null }> {
  const { data } = await db
    .from("coach_reports").select("id, full_report")
    .eq("user_id", userId).eq("period_type", "week").eq("period_start", weekStart)
    .order("created_at", { ascending: false }).limit(1);

  const row = data?.[0];
  if (!row?.full_report) return { plan: null, reportId: row?.id ?? null };

  try {
    const parsed = JSON.parse(row.full_report) as WeeklyPlanData;
    if (!Array.isArray(parsed.days) || parsed.days.length === 0) return { plan: null, reportId: row.id };
    parsed.days = normalizeWeeklyPlanDays(parsed.days);
    return { plan: parsed, reportId: row.id };
  } catch {
    return { plan: null, reportId: row.id };   // legacy text-format report
  }
}

/**
 * The fingerprint the athlete's configuration would produce right now.
 *
 * Deliberately cheap — one profile row and one test row — because it runs on
 * every visit to the Treinador just to answer "is what you are looking at still
 * current?". Regenerating to find out would cost an AI call and a second of
 * latency to usually learn that nothing changed.
 */
export async function currentPlanFingerprint(db: DbClient, userId: string) {
  const [profileRes, testRes] = await Promise.all([
    db.from("profiles").select("sports, training_prefs, strength_prefs").eq("id", userId).single(),
    db.from("performance_tests").select("vdot, avg_hr, max_hr, distance_km, time_seconds")
      .eq("user_id", userId).order("test_date", { ascending: false }).limit(1),
  ]);

  const profile = profileRes.data;
  const test = testRes.data?.[0];

  // LTHR comes from the same computation the plan uses, so a change in how it
  // is derived also invalidates the plan — which is correct: the heart-rate
  // windows in every session come from it.
  const metrics = test
    ? computeMetrics(test.distance_km * 1000, test.time_seconds, test.avg_hr ?? undefined, test.max_hr ?? undefined)
    : null;

  return planFingerprint({
    vdot: metrics?.vdot ?? null,
    lthr: metrics?.lthr ?? null,
    prefs: normalizePrefs(profile?.training_prefs),
    sports: normalizeSports(profile?.sports),
    strengthPrefs: profile?.strength_prefs ? normalizeStrengthPrefs(profile.strength_prefs) : null,
  });
}

/**
 * Whether the stored plan for `weekStart` still matches the configuration.
 *
 * A missing plan is not stale — there is nothing to be out of date. It reports
 * `stale: false` so the caller generates rather than prompting to "update"
 * something that does not exist.
 */
export async function checkPlanFreshness(
  db: DbClient, userId: string, weekStart: string,
): Promise<Staleness & { hasPlan: boolean }> {
  const { plan } = await loadWeeklyPlan(db, userId, weekStart);
  if (!plan) return { hasPlan: false, stale: false, reasons: [], message: "" };

  const current = await currentPlanFingerprint(db, userId);
  return { hasPlan: true, ...planStaleness(plan.fingerprint, current) };
}

export interface EnsurePlanResult {
  plan: WeeklyPlanData | null;
  reportId: string | null;
  cached: boolean;
  error?: string;
  /** The week had already begun, so it was left exactly as the athlete saw it. */
  frozen?: boolean;
  /** Where the refused regeneration should go instead. */
  suggestWeek?: string;
}

/**
 * Return the plan for `weekStart`, generating it when missing (or when forced).
 * Used on-demand by the coach UI and ahead-of-time by the Monday cron.
 */
/** The running days the athlete said they have for a given week, if they said. */
async function fetchAgenda(db: DbClient, userId: string, weekStart: string): Promise<WeeklyPlanDay["day"][] | null> {
  try {
    const { data, error } = await db.from("week_availability").select("run_days")
      .eq("user_id", userId).eq("week_start", weekStart).limit(1);
    if (error) return null;
    const days = (data as Array<{ run_days: string[] | null }> | null)?.[0]?.run_days;
    return Array.isArray(days) && days.length > 0 ? days as WeeklyPlanDay["day"][] : null;
  } catch { return null; }
}

export async function ensureWeeklyPlan(
  db: DbClient,
  userId: string,
  weekStart: string,
  opts: { force?: boolean; paces?: PlanPaces | null } = {},
): Promise<EnsurePlanResult> {
  const existing = await loadWeeklyPlan(db, userId, weekStart);
  const usable = existing.plan && !isLegacyPlanShape(existing.plan);

  if (!opts.force && usable) return { ...existing, cached: true };

  /*
   * A week already underway is frozen, even against an explicit force.
   *
   * The athlete has read it and built their week around it — which day is off,
   * when the long run happens. Rewriting it is not an update. This is enforced
   * here rather than in the route so that every path reaches the same answer:
   * the freshness banner, the cron, and the button all go through this.
   */
  const guard = regenerationTarget(weekStart, localDateStr(new Date()), !usable);
  if (!guard.allowed) {
    return { ...existing, cached: true, frozen: true, error: guard.reason, suggestWeek: guard.suggestWeek };
  }

  const weekEnd = sundayOf(weekStart);

  // ── Athlete context (all independent; optional tables degrade to null) ─────
  const fetchNextRace = async () => {
    try {
      const { data } = await db.from("races").select("name, race_date, distance_km")
        .eq("user_id", userId).gt("race_date", weekStart).is("time_seconds", null)
        .order("race_date", { ascending: true }).limit(1);
      const race = data?.[0];
      return race
        ? { name: race.name as string, date: race.race_date as string, distance_km: race.distance_km as number }
        : null;
    } catch { return null; }
  };

  const fetchVdot = async () => {
    try {
      const { data } = await db.from("performance_tests").select("vdot")
        .eq("user_id", userId).order("test_date", { ascending: false }).limit(1);
      return (data?.[0]?.vdot as number | null) ?? null;
    } catch { return null; }
  };

  const fetchProfileNotes = async () => {
    try {
      // O que vale NA SEMANA MONTADA, não agora: esta semana é gerada durante a
      // anterior, e o pedido de "essa segunda" ainda vale até a virada.
      const { data } = await db.from("athlete_notes").select("category, content")
        .eq("user_id", userId).eq("active", true).or(stillValidFilter(weekStartsAt(weekStart)))
        .order("created_at", { ascending: false }).limit(30);
      if (!data || data.length === 0) return null;
      return (data as Array<{ category: string; content: string }>)
        .map(n => `[${n.category}] ${n.content}`).join("\n");
    } catch { return null; }
  };

  const fetchSports = async () => {
    try {
      const { data } = await db.from("profiles").select("sports").eq("id", userId).single();
      return normalizeSports(data?.sports);
    } catch { return undefined; }
  };

  // The athlete's own weekly layout — which days they run and lift.
  const fetchPrefs = async (): Promise<TrainingPrefs> => {
    try {
      const { data } = await db.from("profiles").select("training_prefs").eq("id", userId).single();
      return normalizePrefs(data?.training_prefs);
    } catch { return normalizePrefs(null); }
  };

  // Strength configuration — only used when the athlete actually filled it in.
  const fetchStrengthPrefs = async (): Promise<StrengthPrefs | null> => {
    try {
      const { data } = await db.from("profiles").select("strength_prefs").eq("id", userId).single();
      return data?.strength_prefs ? normalizeStrengthPrefs(data.strength_prefs) : null;
    } catch { return null; }
  };

  const [{ data: recentRuns }, nextRace, vdot, athleteProfile, sports, paces, prefs, strengthPrefs] = await Promise.all([
    // A year of history, not 30 runs: the plan has to know the athlete raced a
    // half last season before it prescribes them a 5 km long run.
    db.from("runs").select("*").eq("user_id", userId).is("deleted_at", null)
      .gte("date", new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10))
      .order("date", { ascending: false }).limit(400),
    fetchNextRace(),
    fetchVdot(),
    fetchProfileNotes(),
    fetchSports(),
    opts.paces ? Promise.resolve(opts.paces) : pacesFromLatestTest(db, userId),
    fetchPrefs(),
    fetchStrengthPrefs(),
  ]);

  // ── Build the week deterministically ──────────────────────────────────────
  // Sessions come from the workout engine (VDOT paces + LTHR heart-rate windows
  // + Daniels volume caps), not from the model. The AI only writes the coach's
  // note on top. See TRAINING_SCIENCE.md.
  const runs = (recentRuns ?? []) as Run[];
  const { lthr, trainingPaces } = await athleteFitness(db, userId);

  const phase = phaseForRace(nextRace?.date ?? null, weekStart);
  const proven = provenCapacity(runs);

  /*
   * Where this week sits in its four-week block.
   *
   * `phaseForRace` answers "base" for every athlete without a dated race
   * ahead, which is most of them — so phase alone gave the plan no shape at all.
   * The mesocycle supplies one. It also finally feeds `weekIndex` to
   * `planWeeklyVolume`, whose every-fourth-week cutback had a passing test and
   * no caller, and so had never once fired in production.
   */
  const cycleAnchor = await firstTrainingMonday(db, userId).catch(() => null);
  const cycle = cyclePosition(weekStart, cycleAnchor);

  const volumesBefore = weeklyVolumesBefore(runs, weekStart);

  /*
   * A recovery week has to be earned.
   *
   * The four-week cadence is a calendar anchor and the calendar has no idea
   * what the athlete has been doing. Cutting to 70% after three interrupted
   * weeks recovers nothing — it lowers a volume that was already low, and reads
   * as the app giving up. One solid week out of the last three is enough.
   */
  const isRecovery = cycle.isRecovery && recoveryApplies(volumesBefore, proven.weeklyKm);

  /*
   * Is this week already being lived in?
   *
   * Sérgio had a 19 km week, ran 5.87 km of it on Monday, and on Tuesday
   * accepted the "plan out of date" banner. Regeneration rewrote the week he was
   * standing in — the new engine called it a recovery week — cutting the easy
   * run from 6 km to 3 and the long run from 9.5 to 8. He had already built his
   * week around the first plan. That is not an update, it is an erasure.
   */
  const underway = weekIsUnderway(weekStart, localDateStr(new Date()));
  const alreadyPlannedThisWeekKm = underway
    ? await currentWeekPlannedKm(db, userId, weekStart).catch(() => null)
    : null;

  /*
   * Does this week owe the 3 km test?
   *
   * Until now it was asked for by push alone, and a push is dismissed with a
   * thumb. Four of the app's six athletes had never done one, which means their
   * plans prescribed structure and volume with every pace field empty — the
   * engine cannot calibrate an intensity it has never measured. A session on the
   * calendar is much harder to ignore than a banner, and it costs the week
   * nothing: the test replaces the hard session rather than joining it.
   */
  const testDue = await (async () => {
    try {
      const { data } = await db
        .from("performance_tests").select("test_date, avg_hr")
        .eq("user_id", userId).order("test_date", { ascending: false }).limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return shouldScheduleTest(testStatus((data ?? []) as any), cycle.week);
    } catch {
      // Never block a plan over the reminder — a week without the test prompt is
      // a far smaller problem than a week without a plan.
      return false;
    }
  })();

  /*
   * A dated race is what justifies hurrying. Without one the athlete has time,
   * and time spent uninjured is worth more than a big week — so the patient
   * ramp is the default and the faster one has to be earned by a date.
   */
  const raceAhead = nextRace?.date != null;

  const suggestedKm = planWeeklyVolume(
    volumesBefore,
    { phase, provenWeeklyKm: proven.weeklyKm,
      // Only claim the cutback week when it was earned.
      weekIndex: cutbackWeekIndex(cycle, isRecovery),
      raceAhead },
  );

  // The macro plan owns the destination; it was built with the same 8%/week
  // ceiling, so honouring its target here is what makes the two agree. Without
  // this the long-term plan promised one thing and the week delivered another.
  const macroTargetKm = await macroTargetFor(db, userId, weekStart).catch(() => null);
  const afterMacro = macroTargetKm != null && phase !== "taper" && phase !== "race"
    ? Math.max(suggestedKm, Math.min(macroTargetKm, suggestedKm * 1.15))
    : suggestedKm;

  // The ratchet: a week the athlete completed becomes the floor for the next
  // one. Volume is recomputed from what was *run*, so without this a single
  // light week drags the following weeks down with it and the plan appears to
  // give up on an athlete who is still training.
  const previous = await previousWeekVolumes(db, userId, weekStart, runs).catch(() => null);

  /*
   * A week broken by work or rain is not a smaller athlete.
   *
   * The ratchet reads executed kilometres, which is right while someone is
   * training and wrong the moment life interferes: the plan came back smaller,
   * silently, as if the body had lost something. `readWeek` decides what the
   * engine should treat as executed — the prescription when the athlete told us
   * why (or when nobody knows yet, once), what was actually run when the body
   * asked for less.
   */
  const reading = previous
    ? await readPreviousWeek(db, userId, weekStart, runs, previous).catch(() => null)
    : null;

  const ratchetedKm = volumeWithRatchet(afterMacro, {
    previousPlannedKm: previous?.plannedKm ?? null,
    previousActualKm:  reading?.creditedKm ?? previous?.actualKm ?? null,
    // The block's recovery week is supposed to go down; the ratchet must not
    // hold it up, and over-delivery must not push it up either.
    lighterByDesign:   phase === "taper" || phase === "race" || isRecovery,
    raceAhead,
    alreadyPlannedThisWeekKm,
  });

  // The athlete asked for lighter sessions (or said the plan was too big):
  // this week does not climb above the one they found too heavy.
  const weeklyKm = reading?.noRamp && previous?.plannedKm
    ? Math.min(ratchetedKm, previous.plannedKm)
    : ratchetedKm;

  const recentWeeks = weeklyVolumesBefore(runs, weekStart).filter(v => v > 0);
  const recentAverageKm = recentWeeks.length > 0
    ? recentWeeks.reduce((s, v) => s + v, 0) / recentWeeks.length
    : 0;

  const ctx: WeekContext = {
    weekStart,
    weeklyKm,
    recentAverageKm,
    paces: trainingPaces,
    lthr,
    phase,
    targetRaceKm: nextRace?.distance_km ?? null,
    cycleWeek:    cycle.week,
    cycleNumber:  cycle.cycle,
    testDue,
    minRunKm:     prefs.minRunKm ?? 5,
    minLongRunKm: prefs.minLongRunKm ?? null,
    provenLongRunKm: proven.longestRunKm,
    excludedQuality: prefs.excludedQuality ?? [],
  };

  /*
   * The agenda the athlete gave for this week ("só consigo terça, quinta e
   * sábado"), when they gave one before the week was built. It is planning
   * data, not an excuse after the fact: the sessions are laid on those days.
   * The fingerprint below keeps the profile's own days, so a one-week agenda
   * never makes the plan look out of date.
   */
  const agenda = await fetchAgenda(db, userId, weekStart);
  const weekPrefs = prefsForAgenda(prefs, agenda);
  const days = buildWeekPlan(ctx, sports ?? [], weekPrefs, strengthPrefs);

  // The note narrates the week the engine built, with the engine's numbers.
  const runningDays = days.filter(d => (d.distance_km ?? 0) > 0);
  const aiMessage = await coachNoteFor({
    phase: ctx.phase, nextRace, vdot, athleteProfile,
    facts: {
      weeklyKm: Math.round(runningDays.reduce((s, d) => s + (d.distance_km ?? 0), 0) * 10) / 10,
      isRecovery,
      cycleWeek: cycle.week,
      sessions: runningDays.map(d => ({ label: d.label, km: d.distance_km ?? 0 })),
      previousPlannedKm: previous?.plannedKm ?? null,
    },
  }).catch(() => null);

  const plan: WeeklyPlanData = {
    week_start: weekStart,
    days,
    ai_message: aiMessage ?? undefined,
    generated_at: new Date().toISOString(),
    // What this plan was built from. Read back on load to tell whether the
    // athlete's configuration — or the engine — has moved since.
    fingerprint: planFingerprint({
      vdot, lthr, prefs, sports: sports ?? [], strengthPrefs,
    }),
    // How the previous week entered this one, in the athlete's language.
    week_reading: reading ?? undefined,
    phase: ctx.phase,
    agenda: agenda ?? undefined,
    cycle: { week: cycle.week, isRecovery },
  };

  // ── Upsert the week's report ───────────────────────────────────────────────
  const trainingDays = plan.days.filter(d => d.type !== "rest").length;
  const payload = {
    user_id:      userId,
    title:        `Plano da semana — ${weekStart}`,
    report_date:  new Date().toISOString().slice(0, 10),
    period_type:  "week",
    period_start: weekStart,
    period_end:   weekEnd,
    summary:      plan.ai_message ?? `${trainingDays} treinos planejados`,
    full_report:  JSON.stringify(plan),
    updated_at:   new Date().toISOString(),
  };

  const { data: existingRow } = await db
    .from("coach_reports").select("id")
    .eq("user_id", userId).eq("period_type", "week").eq("period_start", weekStart)
    .limit(1);

  let reportId: string | null = existingRow?.[0]?.id ?? null;
  if (reportId) {
    await db.from("coach_reports").update(payload).eq("id", reportId);
  } else {
    const { data: created } = await db.from("coach_reports").insert(payload).select("id").single();
    reportId = created?.id ?? null;
  }

  return { plan, reportId, cached: false };
}
