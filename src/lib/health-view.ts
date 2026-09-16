/**
 * Everything the Saúde screen shows, computed once on the server.
 *
 * The old screen had one question — "how recovered am I" — and answered it with
 * a number and nothing underneath. A number with no context is a horoscope: 72
 * means nothing until you know it was 58 on Friday, that your HRV is 12% above
 * your own normal, and that today's plan is hill repeats.
 *
 * So each signal here is read the way Whoop reads it: against *the athlete's
 * own* recent baseline, never against a population. 45 ms of HRV is excellent
 * for one person and a warning for another; the information is in the change.
 *
 * Pure functions, no I/O. The page fetches, this decides.
 */
import {
  computeReadiness, restingHrBaseline, hrvBaseline,
  type Readiness, type ReadinessVerdict,
} from "@/lib/readiness";
import type { Tone } from "@/components/ui/tone";
import type { HealthCheckin, WeeklyPlanDay, WellnessData } from "@/types";

/** The nightly sleep the athlete is measured against. */
export const SLEEP_TARGET_H = 7.5;

/** How far back a baseline looks. Long enough to be stable, short enough to follow a training block. */
export const BASELINE_DAYS = 30;

/** Nights before a baseline is trusted — the same bar the readiness engine uses for HRV. */
export const CALIBRATION_NIGHTS = 7;

// ─── Dates ───────────────────────────────────────────────────────────────────

/** Calendar arithmetic at noon UTC, which no timezone can push across midnight. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 7.2 → "7h12". Sleep is read in hours and minutes, never as a decimal. */
export function hoursLabel(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "—";
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, "0")}`;
}

// ─── Vitals ──────────────────────────────────────────────────────────────────

export type VitalKey = "hrv" | "rhr" | "sleep";

export interface VitalPoint { date: string; value: number | null }

export interface Vital {
  key: VitalKey;
  label: string;
  unit: string;
  /** Last night's reading — today's row, or yesterday's if today has not landed yet. */
  value: number | null;
  valueDate: string | null;
  baseline: number | null;
  /** Nights the baseline is built from. */
  nBaseline: number;
  calibrating: boolean;
  delta: number | null;
  deltaPct: number | null;
  tone: Tone;
  /** One sentence: what this reading means for this athlete. */
  note: string;
  /** The last 30 days, oldest first, with gaps kept as null so charts show them. */
  series: VitalPoint[];
}

const META: Record<VitalKey, { label: string; unit: string }> = {
  hrv:   { label: "HRV",        unit: "ms" },
  // "FC repouso" wrapped onto two lines in a third of a 375 px screen and pushed
  // its number below the other two. The heart icon beside it says the rest.
  rhr:   { label: "Repouso",    unit: "bpm" },
  sleep: { label: "Sono",       unit: "h" },
};

function readingOf(row: WellnessData | undefined, key: VitalKey): number | null {
  if (!row) return null;
  if (key === "hrv")   return row.hrv_ms != null && row.hrv_ms > 0 ? Number(row.hrv_ms) : null;
  if (key === "rhr")   return row.resting_hr != null && row.resting_hr > 0 ? row.resting_hr : null;
  return row.sleep_seconds != null && row.sleep_seconds > 0
    ? Math.round((row.sleep_seconds / 3600) * 100) / 100
    : null;
}

function toneFor(key: VitalKey, value: number, baseline: number | null, calibrating: boolean): Tone {
  if (key === "sleep") {
    // Sleep has an absolute floor that matters regardless of habit: someone who
    // always sleeps five hours is not "normal", they are short.
    return value >= 7 ? "good" : value >= 6 ? "warn" : "alert";
  }
  if (calibrating || baseline == null) return "neutral";
  if (key === "hrv") {
    const pct = (value - baseline) / baseline;
    return pct >= 0.03 ? "good" : pct >= -0.07 ? "neutral" : pct >= -0.15 ? "warn" : "alert";
  }
  const delta = value - baseline;   // resting HR: lower is better
  return delta <= -1 ? "good" : delta <= 2 ? "neutral" : delta <= 5 ? "warn" : "alert";
}

function noteFor(v: Omit<Vital, "note" | "series">): string {
  if (v.value == null) {
    return v.nBaseline > 0 ? "Sem leitura desta noite ainda." : "Nenhuma leitura recebida ainda.";
  }
  if (v.key === "sleep") {
    const gap = v.value - SLEEP_TARGET_H;
    if (gap >= 0) return `Na meta de ${hoursLabel(SLEEP_TARGET_H)}.`;
    return `${hoursLabel(-gap)} abaixo da meta de ${hoursLabel(SLEEP_TARGET_H)}.`;
  }
  if (v.calibrating) {
    return `Calibrando: ${v.nBaseline} de ${CALIBRATION_NIGHTS} noites para conhecer o seu normal.`;
  }
  const base = Math.round(v.baseline!);
  if (v.key === "hrv") {
    const pct = Math.round((v.deltaPct ?? 0) * 100);
    if (v.tone === "good")    return `${pct}% acima da sua média (${base} ms) — sistema nervoso recuperado.`;
    if (v.tone === "neutral") return `Dentro do seu normal (média ${base} ms).`;
    if (v.tone === "warn")    return `${Math.abs(pct)}% abaixo da média (${base} ms) — fadiga, estresse ou sono ruim.`;
    return `${Math.abs(pct)}% abaixo da média (${base} ms) — o corpo está pedindo um dia leve.`;
  }
  const d = Math.round(v.delta ?? 0);
  if (v.tone === "good")    return `${Math.abs(d)} bpm abaixo da sua média (${base}) — boa recuperação.`;
  if (v.tone === "neutral") return `Dentro do seu normal (média ${base} bpm).`;
  return `${d} bpm acima da média (${base}) — fadiga, calor, álcool ou começo de gripe.`;
}

export function buildVital(key: VitalKey, rows: WellnessData[], today: string): Vital {
  const byDate = new Map(rows.map(r => [r.date, r]));

  const todayValue = readingOf(byDate.get(today), key);
  const yesterday = addDays(today, -1);
  const valueDate = todayValue != null ? today
    : readingOf(byDate.get(yesterday), key) != null ? yesterday
    : null;
  const value = valueDate ? readingOf(byDate.get(valueDate), key) : null;

  // The baseline never includes the reading it is judging.
  const anchor = valueDate ?? today;
  const prior = dateRange(addDays(anchor, -BASELINE_DAYS), addDays(anchor, -1))
    .map(d => readingOf(byDate.get(d), key))
    .filter((x): x is number => x != null);

  const baseline = prior.length >= 3 ? median(prior) : null;
  const calibrating = prior.length < CALIBRATION_NIGHTS;
  const delta = value != null && baseline != null ? value - baseline : null;
  const deltaPct = delta != null && baseline ? delta / baseline : null;
  const tone: Tone = value != null ? toneFor(key, value, baseline, calibrating) : "neutral";

  const partial = {
    key, ...META[key], value, valueDate, baseline, nBaseline: prior.length,
    calibrating, delta, deltaPct, tone,
  };

  return {
    ...partial,
    note: noteFor(partial),
    series: dateRange(addDays(today, -29), today).map(date => ({ date, value: readingOf(byDate.get(date), key) })),
  };
}

// ─── Sleep ───────────────────────────────────────────────────────────────────

export interface SleepWeek {
  nights: Array<{ date: string; hours: number | null; score: number | null }>;
  avgHours: number | null;
  /** Hours short of the target, summed over the nights that were measured. */
  debtHours: number;
  measured: number;
}

export function buildSleepWeek(rows: WellnessData[], today: string): SleepWeek {
  const byDate = new Map(rows.map(r => [r.date, r]));
  const nights = dateRange(addDays(today, -6), today).map(date => {
    const r = byDate.get(date);
    return {
      date,
      hours: readingOf(r, "sleep"),
      score: r?.sleep_score != null && r.sleep_score > 0 ? r.sleep_score : null,
    };
  });
  const measured = nights.filter(n => n.hours != null);
  const avgHours = measured.length > 0
    ? measured.reduce((s, n) => s + n.hours!, 0) / measured.length
    : null;
  const debtHours = measured.reduce((s, n) => s + Math.max(0, SLEEP_TARGET_H - n.hours!), 0);
  return { nights, avgHours, debtHours: Math.round(debtHours * 100) / 100, measured: measured.length };
}

/**
 * Check-ins read as wellness rows, so the athlete without a watch gets the same
 * sleep week — built from what they told the app instead of what a sensor saw.
 */
export function checkinsAsWellness(checkins: HealthCheckin[]): WellnessData[] {
  return checkins
    .filter(c => c.sleep_hours != null && c.sleep_hours > 0)
    .map(c => ({
      date: c.date, source: "checkin",
      sleep_seconds: Math.round(c.sleep_hours! * 3600),
      // Quality 1–5 onto the 0–100 scale a watch uses; 3 lands at 50.
      sleep_score: c.sleep_quality != null ? Math.round(((c.sleep_quality - 1) / 4) * 100) : null,
      hrv_ms: null, hrv_status: null, resting_hr: null, stress_avg: null, body_battery: null,
    }));
}

// ─── Readiness, today and over time ──────────────────────────────────────────

export interface LoadDay { tss: number; tsb: number }

/**
 * Readiness for one date, judged only against the nights before it.
 *
 * The old screen built today's baseline from a window that included today, so a
 * bad night pulled its own yardstick down and looked less bad than it was.
 */
export function readinessOn(
  date: string,
  rows: WellnessData[],
  load: Record<string, LoadDay>,
  checkin: HealthCheckin | null = null,
): Readiness {
  const from = addDays(date, -BASELINE_DAYS);
  const prior = rows.filter(r => r.date >= from && r.date < date);
  // The last three nights, most recent first. Sleep is dated on the morning the
  // athlete woke up, so "date" is last night.
  const sleepHistoryHours = [0, 1, 2]
    .map(back => rows.find(r => r.date === addDays(date, -back))?.sleep_seconds)
    .filter((sec): sec is number => sec != null && sec > 0)
    .map(sec => sec / 3600);
  // Someone whose watch has been sending anything this month has a watch: on
  // their mornings, a missing signal is unknown rather than irrelevant.
  const expectWatch = rows.some(r => r.date >= from && r.date <= date
    && (r.hrv_ms != null || r.resting_hr != null || r.sleep_seconds != null));
  return computeReadiness({
    wellness: rows.find(r => r.date === date) ?? null,
    checkin,
    tsb: load[date]?.tsb ?? null,
    rhrBaseline: restingHrBaseline(prior),
    hrvBaselineMs: hrvBaseline(prior),
    sleepHistoryHours,
    expectWatch,
  });
}

export interface DayRecovery {
  date: string;
  score: number | null;
  verdict: ReadinessVerdict | null;
  /** Whether a watch signal took part, or it was training load alone. */
  hasWatch: boolean;
  /** That day's training stress. */
  load: number;
}

export function recoveryHistory(
  rows: WellnessData[], load: Record<string, LoadDay>, today: string, days = 14,
  /** Past check-ins, so an athlete without a watch sees their own answers in the history too. */
  checkins: HealthCheckin[] = [],
): DayRecovery[] {
  const byDate = new Map(checkins.map(c => [c.date, c]));
  return dateRange(addDays(today, -(days - 1)), today).map(date => {
    const r = readinessOn(date, rows, load, byDate.get(date) ?? null);
    const scored = r.components.length > 0;
    return {
      date,
      score: scored ? r.score : null,
      verdict: scored ? r.verdict : null,
      hasWatch: r.components.some(c => c.auto && c.key !== "tsb"),
      load: Math.round(load[date]?.tss ?? 0),
    };
  });
}

/** This week's average recovery against last week's, when both are worth comparing. */
export function recoveryTrend(history: DayRecovery[]): { avg: number; change: number | null } | null {
  const scores = (xs: DayRecovery[]) => xs.map(d => d.score).filter((s): s is number => s != null);
  const recent = scores(history.slice(-7));
  const before = scores(history.slice(-14, -7));
  if (recent.length < 3) return null;
  const avg = Math.round(recent.reduce((s, v) => s + v, 0) / recent.length);
  const prev = before.length >= 3 ? Math.round(before.reduce((s, v) => s + v, 0) / before.length) : null;
  return { avg, change: prev != null ? avg - prev : null };
}

// ─── What to do with it ──────────────────────────────────────────────────────

const HARD: WeeklyPlanDay["type"][] = ["intervals", "tempo", "test", "race", "hiit", "long_run"];

/**
 * The recovery score, turned into a decision about today's session.
 *
 * A readiness number that does not touch the plan is trivia. The athlete opens
 * this screen to decide whether to do what the plan says, so the answer names
 * the session. It never rewrites the plan — the athlete decides — and when the
 * score has no watch signal behind it, it says so rather than borrowing an
 * authority it does not have.
 */
export function sessionAdvice(
  readiness: Readiness,
  day: WeeklyPlanDay | null,
  done: {
    /** Kilometres already run today. */
    doneKm?: number;
    /** A strength session already logged today. */
    strengthDone?: boolean;
    /** Tomorrow's session, for when today's is behind the athlete. */
    tomorrow?: WeeklyPlanDay | null;
  } = {},
): { headline: string; detail: string } {
  const watch = readiness.components.some(c => c.auto && c.key !== "tsb");
  const basis = watch ? "" : " (pela carga de treino — sem dados do relógio hoje)";
  const v = readiness.verdict;

  /*
   * A session already done is not a session to advise on.
   *
   * On Monday 14/09 Sérgio ran his 6 km before breakfast, opened Saúde at lunch,
   * and was told to go and run 6 km easy. The recovery number was fine; the
   * screen simply did not know the day had moved on. After the session, the
   * useful question is the next one: how to spend the rest of today, and what
   * tomorrow holds.
   */
  const ranToday = (done.doneKm ?? 0) > 0;
  const sessionDone = day != null && day.type !== "rest"
    && (day.type === "strength" ? Boolean(done.strengthDone) : ranToday);
  if (sessionDone) {
    const what = day!.type === "strength"
      ? `${day!.label}: concluída`
      : `${day!.label}: ${(done.doneKm ?? 0).toFixed(1).replace(".", ",")} km concluídos`;
    const restOfDay = v === "baixa"
      ? " Recuperação baixa: capriche no sono e na comida hoje."
      : v === "moderada"
        ? " Resto do dia tranquilo ajuda a chegar melhor amanhã."
        : "";
    const next = done.tomorrow
      ? done.tomorrow.type === "rest"
        ? " Amanhã: descanso."
        : ` Amanhã: ${done.tomorrow.label}${done.tomorrow.distance_km ? ` ${String(done.tomorrow.distance_km).replace(".", ",")} km` : ""} — a leitura de amanhã cedo confirma.`
      : "";
    return { headline: "Treino de hoje feito", detail: `${what}.${restOfDay}${next}` };
  }

  // "Ready to train hard" above an easy run contradicts the line beneath it —
  // the headline follows the day the plan actually holds.
  const hardDay = day != null && HARD.includes(day.type);
  const headline = v === "alta" ? (day == null || hardDay ? "Pronto para treinar forte" : "Corpo recuperado")
    : v === "moderada" ? "Treine, mas com margem"
    : "Dia de priorizar recuperação";

  if (!day) {
    return { headline, detail: readiness.recommendation + basis };
  }

  const session = day.label + (day.distance_km ? ` ${String(day.distance_km).replace(".", ",")} km` : "");

  if (day.type === "rest") {
    return {
      headline,
      detail: v === "baixa"
        ? `Hoje é descanso no plano — e o corpo concorda. Durma cedo${basis}.`
        : `Hoje é descanso no plano. Aproveite: é no descanso que o treino vira ganho${basis}.`,
    };
  }

  if (HARD.includes(day.type)) {
    if (v === "alta") return { headline, detail: `${session} hoje: faça como planejado${basis}.` };
    if (v === "moderada") {
      return {
        headline,
        detail: `${session} hoje: faça, mas no limite de baixo das faixas. Se as primeiras repetições pesarem, encerre antes${basis}.`,
      };
    }
    return {
      headline,
      detail: `${session} hoje: troque por rodagem leve de 30–40 min ou passe para amanhã. Treino forte com recuperação baixa custa mais do que rende${basis}.`,
    };
  }

  if (day.type === "strength") {
    return {
      headline,
      detail: v === "baixa"
        ? `Musculação hoje: reduza a carga ou fique na mobilidade${basis}.`
        : `Musculação hoje: siga o plano${basis}.`,
    };
  }

  return {
    headline,
    detail: v === "baixa"
      ? `${session} hoje: encurte e mantenha bem leve — ou descanse${basis}.`
      : `${session} hoje: leve de verdade, como planejado${basis}.`,
  };
}

// ─── Everything else the watch sends ─────────────────────────────────────────

export interface MonitorItem {
  key: string;
  label: string;
  value: string;
  date: string;
}

const MONITOR: Array<{ key: string; label: string; format: (n: number) => string; maxAgeDays: number }> = [
  { key: "spO2",        label: "SpO₂",         format: n => `${Math.round(n)}%`, maxAgeDays: 3 },
  { key: "respiration", label: "Respiração",   format: n => `${n.toFixed(1).replace(".", ",")} rpm`, maxAgeDays: 3 },
  { key: "steps",       label: "Passos",       format: n => Math.round(n).toLocaleString("pt-BR"), maxAgeDays: 1 },
  { key: "vo2max",      label: "VO₂máx Garmin", format: n => `${Math.round(n)}`, maxAgeDays: 30 },
  // No weight: Garmin's daily weight is the profile setting, not a weighing — it
  // jumped 77 → 88 kg overnight when a new band was set up.
];

/**
 * The secondary readings the watch sends — kept out of the score, shown for
 * what they are. Only readings recent enough to still describe the athlete.
 */
export function buildMonitor(rows: WellnessData[], today: string): MonitorItem[] {
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const items: MonitorItem[] = [];
  for (const m of MONITOR) {
    const oldest = addDays(today, -m.maxAgeDays);
    const hit = sorted.find(r => {
      const n = Number(r.raw?.[m.key]);
      return r.date >= oldest && r.date <= today && r.raw?.[m.key] != null && Number.isFinite(n) && n > 0;
    });
    if (hit) {
      items.push({ key: m.key, label: m.label, value: m.format(Number(hit.raw![m.key])), date: hit.date });
    }
  }
  return items;
}

/** The most recent weight the watch knows, for athletes who never logged one here. */
export function watchWeight(rows: WellnessData[], today: string, maxAgeDays = 60): number | null {
  const oldest = addDays(today, -maxAgeDays);
  const hit = [...rows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .find(r => {
      const n = Number(r.raw?.weight);
      return r.date >= oldest && r.date <= today && r.raw?.weight != null && Number.isFinite(n) && n >= 30 && n <= 250;
    });
  return hit ? Number(hit.raw!.weight) : null;
}
