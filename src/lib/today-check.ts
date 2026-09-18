/**
 * Health in the coach's decision — when the body's signals earn a question.
 *
 * Sleep, the watch, what the athlete reported and the training load already
 * exist in Saúde, but the coach only looked at one number (the readiness
 * verdict). Sérgio, 18/09, from the analysis he approved:
 *
 *   "Hoje tem um treino intenso. Você relatou cansaço e suas últimas noites
 *    ficaram abaixo do seu habitual. Como está se sentindo?"
 *
 *   O importante é definir quando esses sinais justificam uma pergunta ou
 *   proposta de ajuste. Perguntar todo dia vira burocracia; ignorar tudo faz
 *   Saúde continuar isolada.
 *
 * So the rule is explicit, and every part of it is there to keep the question
 * rare and worth answering:
 *
 *   · Signals are grouped by where they come from — sleep, the watch, the
 *     athlete's own reports, training load — and each source counts once, at
 *     its strongest. One bad night seen three ways is still one bad night.
 *   · A demanding session (quality, long run, test) earns a question when the
 *     signals add up to 2: one strong signal, or two moderate ones from
 *     different sources. A single moderate signal never asks.
 *   · An easy day never asks. When the signals are heavy (3 or more) it gets a
 *     line of advice instead.
 *   · Pain is different: it asks before any run.
 *   · At most one question a day, and the pop-up at most once. After "estou
 *     bem", the next day asks again only if the signals got worse. More than
 *     two questions in a week needs a strong reason.
 *   · Nothing changes by itself. Every answer is the athlete's; the coach
 *     applies what they chose.
 *
 * Deterministic, no model.
 */
import { buildVital } from "@/lib/health-view";
import { sessionKindOf } from "@/lib/session-adapt";
import { HARD_SESSION } from "@/lib/session-swap";
import type { RunContext } from "@/lib/run-feedback";
import type { HealthCheckin, WeeklyPlanDay, WellnessData } from "@/types";

export type TodayAnswer = "keep" | "shorter" | "easy" | "tomorrow";
export type SignalSource = "sono" | "relogio" | "relato" | "carga";

export interface CheckSignal {
  key: "short_night" | "sleep_debt" | "hrv_low" | "rhr_high" | "garmin_low"
    | "fatigue_reported" | "very_hard" | "low_energy" | "soreness" | "pain" | "heavy_load";
  source: SignalSource;
  weight: 1 | 2;
  /** Written to follow "Você…" or stand in a list: "suas últimas noites ficaram abaixo do seu habitual". */
  phrase: string;
  /** Sleep only: last night and the athlete's usual, in hours. */
  hours?: number;
  usual?: number;
}

export interface TodayCheck {
  action: "none" | "note" | "ask";
  /** Sum over sources of each source's strongest signal. */
  score: number;
  signals: CheckSignal[];
  pain: boolean;
  demanding: boolean;
  session: WeeklyPlanDay | null;
  message: string | null;
  question: string | null;
  options: Array<{ value: TodayAnswer; label: string }>;
  /** Why a question was held back, when it was. For the record, not the screen. */
  held?: "answered_yesterday" | "weekly_cap";
}

export interface TodayCheckHistory {
  date: string;
  action: "ask" | "note";
  answer: TodayAnswer | null;
  score: number;
}

export interface TodayCheckInput {
  today: string;
  session: WeeklyPlanDay | null;
  sessionDone: boolean;
  rows: WellnessData[];
  load: Record<string, { tss: number; tsb: number }>;
  /** This morning's check-in, if any. */
  checkin: HealthCheckin | null;
  /** Post-run check-ins of the last three days. */
  recentFeedback: Array<{ date: string; effort: number | null; context: RunContext | null }>;
  /** The coach's own previous checks, last seven days. */
  history: TodayCheckHistory[];
  /** Whether today's session could move to tomorrow without stacking two hard days. */
  canTomorrow: boolean;
}

// ─── Thresholds ─────────────────────────────────────────────────────────────

const ASK_AT = 2;
const NOTE_AT = 3;
const STRONG = 3;
const WEEKLY_ASKS = 2;

const QUALITY = new Set(["hills", "repetitions", "intervals", "intervals_dense", "threshold", "fartlek", "progression"]);

const hm = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 60 ? `${h + 1}h` : `${h}h${String(m).padStart(2, "0")}`;
};

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Quality, long run, test — the sessions a tired body should not walk into unasked. */
export function isDemanding(day: WeeklyPlanDay | null): boolean {
  if (!day) return false;
  if (HARD_SESSION.has(day.type)) return true;
  const kind = sessionKindOf(day);
  return !!kind && (QUALITY.has(kind) || kind === "long_run" || kind === "test");
}

// ─── Signals ────────────────────────────────────────────────────────────────

export function collectSignals(input: Pick<TodayCheckInput, "today" | "rows" | "load" | "checkin" | "recentFeedback">): CheckSignal[] {
  const out: CheckSignal[] = [];
  const { today, rows } = input;
  const byDate = new Map(rows.map(r => [r.date, r]));

  // Sleep — last night, and the nights before it, against the athlete's own usual.
  const sleep = buildVital("sleep", rows, today);
  const usual = !sleep.calibrating && sleep.nBaseline >= 5 ? sleep.baseline : null;
  if (sleep.value != null) {
    const h = sleep.value;
    if (h < 5) {
      out.push({ key: "short_night", source: "sono", weight: 2, phrase: `dormiu só ${hm(h)} esta noite` });
    } else if (usual != null && h <= usual - 1) {
      out.push({ key: "short_night", source: "sono", weight: 1, phrase: `dormiu ${hm(h)} esta noite, abaixo do seu habitual (${hm(usual)})`, hours: h, usual });
    } else if (usual == null && h < 5.5) {
      out.push({ key: "short_night", source: "sono", weight: 1, phrase: `dormiu ${hm(h)} esta noite` });
    }
  }
  if (usual != null) {
    const nights = [0, 1, 2]
      .map(back => byDate.get(addDays(today, -back))?.sleep_seconds)
      .filter((s): s is number => s != null && s > 0)
      .map(s => s / 3600);
    if (nights.length >= 2) {
      const avg = nights.reduce((a, b) => a + b, 0) / nights.length;
      if (avg <= usual - 0.75) {
        out.push({ key: "sleep_debt", source: "sono", weight: 1, phrase: "suas últimas noites ficaram abaixo do seu habitual" });
      }
    }
  }

  // The watch: heart rate variability, resting heart rate, and Garmin's own number.
  const hrv = buildVital("hrv", rows, today);
  // `deltaPct` is a fraction of the baseline (−0.12 = 12% below), not a percentage.
  if (!hrv.calibrating && hrv.deltaPct != null && hrv.deltaPct <= -0.12) {
    out.push({ key: "hrv_low", source: "relogio", weight: hrv.deltaPct <= -0.25 ? 2 : 1, phrase: "sua variabilidade cardíaca está abaixo do normal" });
  }
  const rhr = buildVital("rhr", rows, today);
  if (!rhr.calibrating && rhr.delta != null && rhr.delta >= 5) {
    out.push({ key: "rhr_high", source: "relogio", weight: rhr.delta >= 8 ? 2 : 1, phrase: `sua frequência de repouso está ${Math.round(rhr.delta)} bpm acima do normal` });
  }
  const garmin = byDate.get(today)?.garmin_readiness;
  if (garmin != null && garmin < 40) {
    out.push({ key: "garmin_low", source: "relogio", weight: garmin < 25 ? 2 : 1, phrase: `o Garmin marcou disposição ${garmin}` });
  }

  // What the athlete said — after recent runs, and this morning.
  const said = input.recentFeedback;
  if (said.some(f => f.context === "pain")) {
    out.push({ key: "pain", source: "relato", weight: 2, phrase: "relatou dor ou incômodo depois de um treino recente" });
  }
  if (said.some(f => f.context === "fatigue" || f.context === "sleep" || f.context === "stress")) {
    out.push({ key: "fatigue_reported", source: "relato", weight: 1, phrase: "relatou cansaço" });
  } else if (said.some(f => f.effort === 5)) {
    out.push({ key: "very_hard", source: "relato", weight: 1, phrase: "marcou um treino recente como muito difícil" });
  }
  const c = input.checkin;
  if (c?.energy != null && c.energy <= 2) {
    out.push({ key: "low_energy", source: "relato", weight: c.energy <= 1 ? 2 : 1, phrase: "marcou energia baixa hoje" });
  }
  if (c?.soreness != null && c.soreness >= 4) {
    out.push({ key: "soreness", source: "relato", weight: 1, phrase: "marcou dor muscular forte hoje" });
  }

  // Load: running and the gym together (see `activityTSS`).
  const tsb = input.load[today]?.tsb ?? input.load[addDays(today, -1)]?.tsb;
  if (tsb != null && tsb <= -20) {
    out.push({ key: "heavy_load", source: "carga", weight: tsb <= -30 ? 2 : 1, phrase: "a carga de treino dos últimos dias está alta" });
  }

  return out;
}

/** Each source counts once, at its strongest. */
export function scoreSignals(signals: CheckSignal[]): number {
  const best = new Map<SignalSource, number>();
  for (const s of signals) best.set(s.source, Math.max(best.get(s.source) ?? 0, s.weight));
  return Array.from(best.values()).reduce((a, b) => a + b, 0);
}

// ─── Words ──────────────────────────────────────────────────────────────────

/** "você relatou cansaço e suas últimas noites ficaram abaixo do seu habitual" */
function sentence(signals: CheckSignal[]): string {
  // Sleep says one thing, even when two readings found it: a short night inside
  // a short week is "suas últimas noites…", with last night's number beside it.
  const shortNight = signals.find(s => s.key === "short_night");
  const debt = signals.find(s => s.key === "sleep_debt");
  const merged = signals.filter(s => s.source !== "sono");
  if (shortNight?.weight === 2 || (shortNight && !debt)) merged.push(shortNight);
  else if (debt) {
    merged.push(shortNight?.hours != null && shortNight.usual != null
      ? { ...debt, phrase: `${debt.phrase} — ${hm(shortNight.hours)} esta noite, contra ${hm(shortNight.usual)} de costume` }
      : debt);
  }

  // Strongest first; on a tie, what the athlete said leads — it is their own account.
  const order: SignalSource[] = ["relato", "sono", "relogio", "carga"];
  const ordered = merged.sort((a, b) => b.weight - a.weight || order.indexOf(a.source) - order.indexOf(b.source));
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const s of ordered) {
    if (seen.has(s.source)) continue;
    seen.add(s.source);
    // Phrases about the athlete take "você"; the others stand alone.
    const selfish = /^(dormiu|relatou|marcou)/.test(s.phrase);
    parts.push(selfish && !parts.some(p => p.startsWith("você")) ? `você ${s.phrase}` : s.phrase);
    if (parts.length === 3) break;
  }
  const list = parts.length <= 1 ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
  return list.charAt(0).toUpperCase() + list.slice(1);
}

function optionsFor(session: WeeklyPlanDay, pain: boolean, canTomorrow: boolean): TodayCheck["options"] {
  const out: TodayCheck["options"] = [];
  if (pain) {
    out.push({ value: "keep", label: "Foi pontual — está tudo bem" });
    out.push({ value: "easy", label: "Ainda incomoda — troco por uma rodagem leve" });
  } else {
    out.push({ value: "keep", label: "Estou bem — mantenho o treino" });
    out.push({ value: "shorter", label: "Um pouco cansado — prefiro uma versão mais curta" });
    if (session.type !== "easy" && session.type !== "recovery") {
      out.push({ value: "easy", label: "Cansado — troco por uma rodagem leve" });
    }
  }
  if (canTomorrow) out.push({ value: "tomorrow", label: "Prefiro passar para amanhã" });
  return out;
}

// ─── The decision ───────────────────────────────────────────────────────────

export function todayCheck(input: TodayCheckInput): TodayCheck {
  const session = input.session;
  const signals = collectSignals(input);
  const score = scoreSignals(signals);
  const pain = signals.some(s => s.key === "pain");
  const demanding = isDemanding(session);
  const none: TodayCheck = { action: "none", score, signals, pain, demanding, session, message: null, question: null, options: [] };

  // Nothing to decide: no run today, it is done, it is a race, or the athlete already decided.
  if (!session || input.sessionDone) return none;
  if (session.type === "rest" || session.type === "strength" || session.type === "race") return none;
  if (session.swap || session.adaptation) return none;

  let action: TodayCheck["action"] = "none";
  if (pain) action = "ask";
  else if (demanding && score >= ASK_AT) action = "ask";
  else if (!demanding && score >= NOTE_AT) action = "note";

  // Anti-bureaucracy: once a day, not again after "estou bem" unless worse, and rarely.
  let held: TodayCheck["held"];
  const earlier = input.history.filter(h => h.date < input.today);
  const today = input.history.find(h => h.date === input.today);
  if (today) {
    action = today.action;          // the day's decision stands; signals may still refresh
  } else if (action === "ask" && !pain) {
    const yesterday = earlier.find(h => h.date === addDays(input.today, -1));
    const asksThisWeek = earlier.filter(h => h.action === "ask" && h.date >= addDays(input.today, -6)).length;
    if (yesterday?.answer === "keep" && score <= yesterday.score) { action = "note"; held = "answered_yesterday"; }
    else if (asksThisWeek >= WEEKLY_ASKS && score < STRONG) { action = "note"; held = "weekly_cap"; }
  }
  if (action === "none") return none;

  const why = sentence(signals);
  if (action === "note") {
    return {
      ...none, action, held,
      message: demanding
        ? `Hoje tem ${session.label}. ${why}. Se no aquecimento as pernas não responderem, encurtar é uma boa decisão.`
        : `Dia leve, e ainda bem: ${why.charAt(0).toLowerCase()}${why.slice(1)}. Vá no ritmo mais confortável.`,
    };
  }
  return {
    ...none, action,
    message: `Hoje tem ${session.label}. ${why}.`,
    question: pain ? "Como está esse incômodo?" : "Como está se sentindo?",
    options: optionsFor(session, pain, input.canTomorrow),
  };
}

export const ANSWER_LABEL: Record<TodayAnswer, string> = {
  keep: "Treino mantido",
  shorter: "Versão mais curta",
  easy: "Trocado por rodagem leve",
  tomorrow: "Passado para amanhã",
};
