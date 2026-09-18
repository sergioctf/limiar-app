/**
 * "O que está melhorando para mim?" — the run history read as evolution.
 *
 * The list of runs records what happened; it does not say whether anything is
 * getting better. This answers that question with a few readings, each one
 * backed by data the app actually has, and each one allowed to say "not enough
 * to tell yet":
 *
 *   · consistência      — how often the athlete runs, last 4 weeks against the 4 before
 *   · rotina × plano    — how many runs a week the routine actually carries
 *   · ritmo comparável  — pace in runs that are genuinely alike (distance, heart
 *                         rate, climb, heat), never "this run was faster"
 *   · esforço           — the same kind of session, rated easier or harder over time
 *   · adaptações        — how often the week bent, and why
 *
 * The rule that shapes all of it (from the analysis Sérgio approved, 17/09):
 * *evitar declarar melhora só porque uma corrida foi mais rápida. Quando os
 * treinos não forem comparáveis ou faltarem dados, o aplicativo precisa
 * reconhecer isso.* Every threshold below is there to keep one lucky day from
 * becoming a trend.
 *
 * Deterministic, no model. Nothing here changes the plan: the routine reading
 * can suggest fewer running days, and the athlete decides.
 */
import { movingPaceSecPerKm, looksLikeForgottenWatch } from "@/lib/run-time";
import { EFFORTS, type RunContext } from "@/lib/run-feedback";
import { sessionKindOf } from "@/lib/session-adapt";
import type { WeeklyPlanDay } from "@/types";

export type Signal = "better" | "steady" | "worse" | "unknown" | "info";

export interface ProgressReading {
  key: "consistency" | "routine" | "comparable" | "effort" | "adaptations";
  title: string;
  signal: Signal;
  headline: string;
  detail: string | null;
}

export interface ProgressReport {
  question: string;
  summary: string;
  readings: ProgressReading[];
}

export interface ProgressRun {
  id: string;
  date: string;
  distance_km: number;
  duration_seconds: number;
  moving_time_seconds?: number | null;
  elapsed_time_seconds?: number | null;
  avg_pace_seconds_per_km?: number | null;
  avg_hr?: number | null;
  elevation_gain_m?: number | null;
  temperature_c?: number | null;
  /** The importer's classification and the athlete's words: used only to keep workouts out of comparisons. */
  type?: string | null;
  name?: string | null;
  notes?: string | null;
}

export interface ProgressPlan {
  weekStart: string;
  days: WeeklyPlanDay[];
}

export interface ProgressCheckin {
  run_id: string;
  effort: number | null;
  context: RunContext | null;
  execution?: "as_planned" | "adapted" | "other" | null;
}

export interface ProgressInput {
  today: string;
  runs: ProgressRun[];
  plans: ProgressPlan[];
  checkins: ProgressCheckin[];
  weekAnswers: Array<{ week_start: string; reason: string }>;
  /** Race days: a race is not a training run and is never compared as one. */
  raceDates?: string[];
}

// ─── Thresholds ─────────────────────────────────────────────────────────────

/** Weeks read for consistency, routine and adaptations: two blocks of four. */
const WEEKS = 8;
/** A change in runs per week smaller than this is noise, not a trend. */
const FREQUENCY_STEP = 0.5;
/** The routine "carries" k runs a week when k happened in at least this share of weeks. */
const ROUTINE_SHARE = 0.7;
/** Comparable runs: recent block, and how far back the baseline reaches. */
const RECENT_DAYS = 42;
const BASELINE_DAYS = 140;
/** What "alike" means. Wider than this and pace differences stop meaning anything. */
const MAX_DISTANCE_GAP = 0.2;
const MAX_HR_GAP = 6;
const MAX_CLIMB_GAP_PER_KM = 8;
const MAX_TEMP_GAP = 6;
const MIN_PAIRS = 3;
/** Seconds per kilometre below which a pace difference is within day-to-day noise. */
const PACE_STEP = 5;
/** Half a step on the five-point effort scale, averaged, is the smallest change we name. */
const EFFORT_STEP = 0.75;

// ─── Small helpers ──────────────────────────────────────────────────────────

const pad = (v: number) => String(v).padStart(2, "0");
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return addDays(dateStr, -((d.getDay() + 6) % 7));
}
const DAY_KEYS: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function dayKeyOf(dateStr: string): WeeklyPlanDay["day"] {
  const d = new Date(`${dateStr}T12:00:00`);
  return DAY_KEYS[(d.getDay() + 6) % 7];
}
const num = (n: number, digits = 1) => Number(n.toFixed(digits)).toString().replace(".", ",");
const pace = (sec: number) => `${Math.floor(sec / 60)}:${pad(Math.round(sec % 60))}/km`;
const dateBr = (dateStr: string) => `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const isRunDay = (day: WeeklyPlanDay) => day.type !== "rest" && day.type !== "strength";
/** Anything shorter is a warm-up logged on its own or a watch started by mistake. */
const counts = (run: ProgressRun) => run.distance_km >= 1 && !looksLikeForgottenWatch(run);

type Group = "easy" | "long_run" | "quality";
const QUALITY = new Set(["hills", "repetitions", "intervals", "intervals_dense", "threshold", "fartlek", "progression"]);
function groupOf(day: WeeklyPlanDay | null): Group | null {
  if (!day) return null;
  const kind = sessionKindOf(day);
  if (!kind) return null;
  if (kind === "long_run") return "long_run";
  if (kind === "easy" || kind === "recovery" || kind === "strides") return "easy";
  return QUALITY.has(kind) ? "quality" : null;
}
const GROUP_LABEL: Record<Group, string> = { easy: "as rodagens leves", long_run: "o longão", quality: "os treinos fortes" };

// ─── The readings ───────────────────────────────────────────────────────────

interface Context {
  input: ProgressInput;
  /** Closed weeks, oldest first. */
  weeks: string[];
  planDay: (date: string) => WeeklyPlanDay | null;
  runsIn: (monday: string) => ProgressRun[];
}

function consistency({ input, weeks, runsIn }: Context): ProgressReading {
  const title = "Consistência";
  const first = input.runs.filter(counts).map(r => r.date).sort()[0];
  if (!first) {
    return { key: "consistency", title, signal: "unknown", headline: "Nenhuma corrida registrada ainda.", detail: null };
  }
  // Weeks before the athlete's first run are not absences.
  const applicable = weeks.filter(w => addDays(w, 6) >= first);
  const perWeek = applicable.map(w => runsIn(w).length);
  const active = perWeek.filter(n => n > 0).length;
  const headline = `Você correu em ${active} das últimas ${plural(applicable.length, "semana", "semanas")}.`;

  const recent = applicable.slice(-4);
  const earlier = applicable.slice(0, -4);
  if (recent.length < 4 || earlier.length < 3) {
    return {
      key: "consistency", title, signal: "unknown", headline,
      detail: "O histórico ainda é curto para comparar um bloco de quatro semanas com o anterior.",
    };
  }
  const avg = (list: string[]) => list.reduce((s, w) => s + runsIn(w).length, 0) / list.length;
  const km = (list: string[]) => list.reduce((s, w) => s + runsIn(w).reduce((t, r) => t + r.distance_km, 0), 0) / list.length;
  const rAvg = avg(recent), eAvg = avg(earlier);
  const diff = rAvg - eAvg;
  const signal: Signal = diff >= FREQUENCY_STEP ? "better" : diff <= -FREQUENCY_STEP ? "worse" : "steady";
  return {
    key: "consistency", title, signal, headline,
    detail: `Nas últimas 4 semanas, ${num(rAvg)} corrida${rAvg === 1 ? "" : "s"} por semana (${num(km(recent))} km); nas ${earlier.length} anteriores, ${num(eAvg)} (${num(km(earlier))} km).`,
  };
}

/**
 * How many runs a week the routine actually carries.
 *
 * "O plano prevê quatro sessões, mas sua rotina comporta três com muito mais
 * consistência" — the kind of thing only the history can teach the coach.
 */
function routine({ input, weeks, runsIn }: Context): ProgressReading | null {
  const title = "Rotina × plano";
  const planned = weeks
    .map(w => ({ week: w, plan: input.plans.find(p => p.weekStart === w) }))
    .filter((x): x is { week: string; plan: ProgressPlan } => !!x.plan)
    .map(x => ({
      week: x.week,
      planned: x.plan.days.filter(d => isRunDay(d) && (d.sport ?? "corrida") === "corrida").length,
      done: new Set(runsIn(x.week).map(r => r.date)).size,
    }))
    .filter(x => x.planned > 0);
  if (planned.length === 0) return null;
  if (planned.length < 4) {
    return {
      key: "routine", title, signal: "unknown",
      headline: "Ainda poucas semanas com plano para ver quantas corridas cabem na sua rotina.",
      detail: `${plural(planned.length, "semana", "semanas")} com plano entre as últimas ${WEEKS}; a partir de 4 dá para ler.`,
    };
  }
  // What the plan usually asks for: the most common count, the larger on a tie.
  const freq = new Map<number, number>();
  for (const x of planned) freq.set(x.planned, (freq.get(x.planned) ?? 0) + 1);
  const target = Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  // The largest k done in at least 70% of the weeks.
  let sustained = 0;
  for (let k = target; k >= 1; k--) {
    if (planned.filter(x => x.done >= k).length / planned.length >= ROUTINE_SHARE) { sustained = k; break; }
  }
  const history = planned.map(x => x.done).join(", ");
  if (sustained >= target) {
    return {
      key: "routine", title, signal: "info",
      headline: `Sua rotina tem comportado as ${target} corridas por semana previstas.`,
      detail: `Corridas por semana, nas ${planned.length} semanas com plano: ${history}.`,
    };
  }
  return {
    key: "routine", title, signal: "info",
    headline: sustained > 0
      ? `O plano prevê ${target} corridas por semana; sua rotina tem comportado ${sustained} com mais regularidade.`
      : `O plano prevê ${target} corridas por semana, e a rotina não tem comportado esse número com regularidade.`,
    detail: `Corridas por semana, nas ${planned.length} semanas com plano: ${history}. Se fizer sentido, os dias de corrida mudam em "Minha semana" — nada muda sozinho.`,
  };
}

interface Candidate { run: ProgressRun; pace: number; hr: number; climbPerKm: number | null }

/**
 * Most of the history has no plan to say what a run was for, and the importer
 * calls nearly everything "Leve" — the 8 × 400 m of 16/09 included. So a run
 * the importer classified as a workout, or that the athlete described as one,
 * stays out: its average pace is warm-up, repetitions and jogging mixed.
 */
const WORKOUT_TYPES = new Set(["intervals", "tempo", "race", "progression"]);
const WORKOUT_WORDS = /(^|[^a-zà-ú])(tiros?|intervalad[oa]s?|fartlek|ritmo forte|limiar|prova)([^a-zà-ú]|$)/i;
function looksLikeWorkout(run: ProgressRun): boolean {
  if (run.type && WORKOUT_TYPES.has(run.type)) return true;
  return WORKOUT_WORDS.test(`${run.name ?? ""} ${run.notes ?? ""}`);
}

/**
 * Pace in runs that are genuinely alike.
 *
 * A run is only compared with one of the same length (±20%), at the same
 * average heart rate (±6 bpm), with similar climb and, when both are known,
 * similar heat. Quality sessions, adapted days and races never enter: their
 * average pace mixes warm-up, repetitions and recoveries. Each recent run is
 * paired with at most one earlier run, and it takes three pairs to say anything.
 */
function comparable({ input, planDay }: Context): ProgressReading {
  const title = "Ritmo em corridas comparáveis";
  const races = new Set(input.raceDates ?? []);
  const candidates: Candidate[] = [];
  for (const run of input.runs) {
    if (!counts(run) || run.distance_km < 3 || races.has(run.date)) continue;
    if (looksLikeWorkout(run)) continue;
    const day = planDay(run.date);
    if (day?.adaptation) continue;
    const group = groupOf(day);
    if (group === "quality" || (day && !group && isRunDay(day))) continue;
    const p = movingPaceSecPerKm(run);
    const hr = run.avg_hr ?? null;
    if (!p || p < 150 || p > 600 || !hr || hr < 90) continue;
    candidates.push({
      run, pace: p, hr,
      climbPerKm: run.elevation_gain_m != null ? run.elevation_gain_m / run.distance_km : null,
    });
  }

  const recentFrom = addDays(input.today, -RECENT_DAYS);
  const baselineFrom = addDays(input.today, -BASELINE_DAYS);
  const recent = candidates.filter(c => c.run.date >= recentFrom).sort((a, b) => b.run.date.localeCompare(a.run.date));
  const baseline = candidates.filter(c => c.run.date < recentFrom && c.run.date >= baselineFrom);

  const used = new Set<string>();
  const pairs: Array<{ now: Candidate; then: Candidate }> = [];
  for (const now of recent) {
    let best: { c: Candidate; score: number } | null = null;
    for (const then of baseline) {
      if (used.has(then.run.id)) continue;
      const distGap = Math.abs(then.run.distance_km - now.run.distance_km) / now.run.distance_km;
      const hrGap = Math.abs(then.hr - now.hr);
      if (distGap > MAX_DISTANCE_GAP || hrGap > MAX_HR_GAP) continue;
      if (now.climbPerKm != null && then.climbPerKm != null && Math.abs(now.climbPerKm - then.climbPerKm) > MAX_CLIMB_GAP_PER_KM) continue;
      const tNow = now.run.temperature_c, tThen = then.run.temperature_c;
      if (tNow != null && tThen != null && Math.abs(tNow - tThen) > MAX_TEMP_GAP) continue;
      const score = hrGap / MAX_HR_GAP + distGap / MAX_DISTANCE_GAP;
      if (!best || score < best.score) best = { c: then, score };
    }
    if (best) { used.add(best.c.run.id); pairs.push({ now, then: best.c }); }
  }

  const rule = "distância até 20% diferente e FC média até 6 bpm, sem treinos fortes, adaptados ou provas";
  if (pairs.length < MIN_PAIRS) {
    return {
      key: "comparable", title, signal: "unknown",
      headline: "Ainda não há corridas comparáveis suficientes para dizer se o ritmo melhorou.",
      detail: `Só comparamos corridas parecidas (${rule}). Entre as últimas 6 semanas e os meses anteriores, ${pairs.length === 0 ? "nenhum par apareceu" : `apareceram ${plural(pairs.length, "par", "pares")}`}; são necessários ${MIN_PAIRS}.`,
    };
  }

  const delta = pairs.reduce((s, p) => s + (p.now.pace - p.then.pace), 0) / pairs.length;
  const signal: Signal = delta <= -PACE_STEP ? "better" : delta >= PACE_STEP ? "worse" : "steady";
  const ex = pairs[0];
  const example = `Ex.: ${num(ex.now.run.distance_km)} km a ${pace(ex.now.pace)} com FC ${ex.now.hr} em ${dateBr(ex.now.run.date)}, contra ${num(ex.then.run.distance_km)} km a ${pace(ex.then.pace)} com FC ${ex.then.hr} em ${dateBr(ex.then.run.date)}.`;
  return {
    key: "comparable", title, signal,
    headline: signal === "better" ? `Mais rápido com o mesmo esforço: ${Math.round(-delta)} s/km em média.`
      : signal === "worse" ? `Mais lento com o mesmo esforço: ${Math.round(delta)} s/km em média.`
        : "Mesmo ritmo com o mesmo esforço.",
    detail: `${pairs.length} pares de corridas parecidas (${rule}), últimas 6 semanas contra os meses anteriores. ${example}`,
  };
}

/**
 * The same kind of session, rated over time.
 *
 * Only sessions done as prescribed: an adapted day was a different session,
 * and its effort says nothing about the one that was planned.
 */
function effort({ input, planDay }: Context): ProgressReading {
  const title = "Esforço nos mesmos treinos";
  const runById = new Map(input.runs.map(r => [r.id, r]));
  const rated = input.checkins
    .filter(c => c.effort != null && c.execution !== "adapted" && c.execution !== "other")
    .map(c => {
      const run = runById.get(c.run_id);
      const day = run ? planDay(run.date) : null;
      return run && !day?.adaptation ? { date: run.date, effort: c.effort!, group: groupOf(day) } : null;
    })
    .filter((x): x is { date: string; effort: number; group: Group | null } => !!x && !!x.group);

  const since = rated.map(r => r.date).sort()[0];
  const lines: Array<{ group: Group; from: number; to: number }> = [];
  for (const group of ["easy", "long_run", "quality"] as Group[]) {
    const list = rated.filter(r => r.group === group).sort((a, b) => a.date.localeCompare(b.date));
    if (list.length < 4) continue;
    const half = Math.floor(list.length / 2);
    const mean = (xs: typeof list) => xs.reduce((s, x) => s + x.effort, 0) / xs.length;
    lines.push({ group, from: mean(list.slice(0, half)), to: mean(list.slice(half)) });
  }

  if (lines.length === 0) {
    return {
      key: "effort", title, signal: "unknown",
      headline: "Ainda poucos check-ins para comparar o esforço dos mesmos treinos.",
      detail: rated.length > 0
        ? `${plural(rated.length, "treino avaliado", "treinos avaliados")} desde ${dateBr(since)}. Com quatro avaliações do mesmo tipo de treino dá para ver se ele ficou mais leve.`
        : "Os check-ins depois de cada corrida alimentam esta leitura.",
    };
  }

  const label = (x: number) => EFFORTS[Math.min(4, Math.max(0, Math.round(x) - 1))].toLowerCase();
  const changed = lines.filter(l => Math.abs(l.to - l.from) >= EFFORT_STEP);
  const easier = changed.filter(l => l.to < l.from);
  const harder = changed.filter(l => l.to > l.from);
  const signal: Signal = easier.length && !harder.length ? "better" : harder.length && !easier.length ? "worse" : "steady";
  const sentence = (l: typeof lines[number]) => {
    const from = label(l.from), to = label(l.to);
    const what = GROUP_LABEL[l.group];
    return from === to
      ? `${what.charAt(0).toUpperCase()}${what.slice(1)}: ${l.to < l.from ? "um pouco mais leve" : "um pouco mais pesado"}, ainda ${to}.`
      : `${what.charAt(0).toUpperCase()}${what.slice(1)} ${l.group === "long_run" ? "passou" : "passaram"} de ${from} para ${to}.`;
  };
  return {
    key: "effort", title, signal,
    headline: changed.length ? sentence(changed[0]) : "O mesmo esforço para os mesmos treinos.",
    detail: changed.length > 1 ? changed.slice(1).map(sentence).join(" ") : null,
  };
}

/** How often the week bent, and why. Information, not a verdict. */
function adaptations({ input, weeks }: Context): ProgressReading {
  const title = "Adaptações";
  const from = weeks[0];
  const inWindow = (date: string) => date >= from;

  let before = 0, after = 0;
  for (const plan of input.plans) {
    if (!inWindow(plan.weekStart)) continue;
    for (const day of plan.days) {
      if (day.adaptation?.when === "before") before++;
      else if (day.adaptation?.when === "after") after++;
    }
  }

  const runDates = new Map(input.runs.map(r => [r.id, r.date]));
  const tally = { rotina: 0, clima: 0, corpo: 0 };
  for (const c of input.checkins) {
    const date = runDates.get(c.run_id);
    if (!date || !inWindow(date) || !c.context) continue;
    if (c.context === "schedule" || c.context === "work" || c.context === "personal") tally.rotina++;
    else if (c.context === "weather") tally.clima++;
    else if (["fatigue", "pain", "session_too_hard", "sleep", "stress"].includes(c.context)) tally.corpo++;
  }
  for (const a of input.weekAnswers) {
    if (!inWindow(a.week_start)) continue;
    if (a.reason === "life") tally.rotina++;
    else if (a.reason === "body" || a.reason === "too_much") tally.corpo++;
  }

  const parts: string[] = [];
  if (before) parts.push(`${plural(before, "treino adaptado", "treinos adaptados")} antes de sair`);
  if (after) parts.push(`${plural(after, "treino trocado", "treinos trocados")} e registrado depois`);
  if (tally.rotina) parts.push(`rotina ou agenda ${tally.rotina}×`);
  if (tally.clima) parts.push(`clima ${tally.clima}×`);
  if (tally.corpo) parts.push(`cansaço ou dificuldade ${tally.corpo}×`);

  if (parts.length === 0) {
    return {
      key: "adaptations", title, signal: "info",
      headline: `Nenhuma adaptação ou interrupção registrada nas últimas ${WEEKS} semanas.`,
      detail: null,
    };
  }
  const reasons = Object.entries(tally).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const top = reasons.length > 1 && reasons[0][1] > reasons[1][1] && reasons[0][1] >= 2
    ? `O motivo mais comum foi ${reasons[0][0] === "rotina" ? "rotina ou agenda" : reasons[0][0] === "clima" ? "o clima" : "cansaço ou dificuldade"}.`
    : null;
  return {
    key: "adaptations", title, signal: "info",
    headline: `Nas últimas ${WEEKS} semanas: ${parts.join(" · ")}.`,
    detail: top,
  };
}

// ─── The report ─────────────────────────────────────────────────────────────

const SUMMARY_NAME: Partial<Record<ProgressReading["key"], string>> = {
  consistency: "consistência",
  comparable: "ritmo em corridas comparáveis",
  effort: "esforço nos mesmos treinos",
};

export function progressReport(input: ProgressInput): ProgressReport {
  const thisMonday = mondayOf(input.today);
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(thisMonday, -7 * (WEEKS - i)));
  const byWeek = new Map<string, ProgressRun[]>();
  for (const run of input.runs) {
    if (!counts(run)) continue;
    const w = mondayOf(run.date);
    byWeek.set(w, [...(byWeek.get(w) ?? []), run]);
  }
  const plans = new Map(input.plans.map(p => [p.weekStart, p]));
  const ctx: Context = {
    input, weeks,
    runsIn: monday => byWeek.get(monday) ?? [],
    planDay: date => plans.get(mondayOf(date))?.days.find(d => d.day === dayKeyOf(date)) ?? null,
  };

  const readings = [
    consistency(ctx),
    routine(ctx),
    comparable(ctx),
    effort(ctx),
    adaptations(ctx),
  ].filter((r): r is ProgressReading => r !== null);

  const named = (signal: Signal) => readings
    .filter(r => r.signal === signal && SUMMARY_NAME[r.key])
    .map(r => SUMMARY_NAME[r.key]!);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const parts: string[] = [];
  if (named("better").length) parts.push(`Melhorando: ${named("better").join(", ")}.`);
  if (named("worse").length) parts.push(`Em queda: ${named("worse").join(", ")}.`);
  if (named("steady").length) parts.push(`Estável: ${named("steady").join(", ")}.`);
  if (named("unknown").length) parts.push(`Ainda sem dados para afirmar: ${named("unknown").join(", ")}.`);

  return {
    question: "O que está melhorando para você?",
    summary: parts.length ? parts.map(cap).join(" ") : "Ainda não há histórico suficiente para ler evolução.",
    readings,
  };
}
