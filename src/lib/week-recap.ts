/**
 * Closing the week — what happened, what the coach made of it, what changes.
 *
 * Sérgio, 17/09: *"Fechar a semana com uma explicação curta e útil"*, answering
 * three questions and nothing else:
 *
 *   1. Como foi minha semana?      — the facts, as they are
 *   2. O que o treinador entendeu? — the reading that fed the next plan
 *   3. O que muda na próxima?      — the consequence, in a line or two
 *
 * This replaces the Monday summary that never ran: the cron looked for a week
 * report without a `summary`, the plan row always has one, so the summary was
 * never generated for anyone with a plan — and would have overwritten the plan
 * if it had been (debt A1). It was also a model writing about numbers it could
 * not check. Here the engine speaks for itself: every sentence comes from the
 * plan, the runs and the check-ins, and nothing is padded to fill a section.
 */
import { contextLabel, type RunContext } from "@/lib/run-feedback";
import { sessionKindOf } from "@/lib/session-adapt";
import type { WeekAdherence } from "@/lib/plan-adherence";
import type { WeekReading } from "@/lib/week-reading";
import type { WeeklyPlanDay } from "@/types";

export interface RecapCheckin {
  effort: number | null;
  context: RunContext | null;
  execution?: "as_planned" | "adapted" | "other" | null;
}

export interface WeekRecapInput {
  /** Monday of the week being closed. */
  weekStart: string;
  adherence: WeekAdherence | null;
  /** Kilometres actually run in the week before the one being closed. */
  previousActualKm: number | null;
  /** How the coach read the week — the same reading that fed the next plan. */
  reading: WeekReading | null;
  checkins: RecapCheckin[];
  /**
   * Whether the athlete already answered the coach's question about this week.
   * The pop-up uses the same rule, so the recap never asks for an answer that
   * has been given.
   */
  weekAnswered?: boolean;
  /** The week that follows, when it has already been generated. */
  nextWeek: { weekStart: string; days: WeeklyPlanDay[] } | null;
  /** Today, for deciding whether the week has closed. Defaults to the real date. */
  today?: string;
}

export interface RecapSection {
  question: string;
  headline: string;
  lines: string[];
}

export interface WeekRecap {
  weekStart: string;
  /** "8 a 14 de setembro" */
  range: string;
  went: RecapSection;
  understood: RecapSection;
  next: RecapSection;
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const num = (n: number) => Number(n.toFixed(1)).toString().replace(".", ",");
const km = (n: number) => `${num(n)} km`;

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dayName = (day: WeeklyPlanDay) => (day.dayPt ?? "").toLowerCase();
/** "na quarta", "no sábado" — the weekend days are the masculine ones. */
const onDay = (day: WeeklyPlanDay) => {
  const name = dayName(day);
  return `${/^(sáb|dom)/.test(name) ? "no" : "na"} ${name}`;
};
const OnDay = (day: WeeklyPlanDay) => {
  const text = onDay(day);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function rangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(`${addDays(weekStart, 6)}T12:00:00`);
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()} a ${end.getDate()} de ${MONTHS[end.getMonth()]}`
    : `${start.getDate()} de ${MONTHS[start.getMonth()]} a ${end.getDate()} de ${MONTHS[end.getMonth()]}`;
}

/** Runs only: strength and rest are counted apart. */
const isRunDay = (day: WeeklyPlanDay) => day.type !== "rest" && day.type !== "strength";

const QUALITY_KINDS = new Set(["hills", "repetitions", "intervals", "intervals_dense", "threshold", "fartlek", "progression"]);

/**
 * The session that gives the week its shape.
 *
 * Reads the `quality` tag when the plan has one and falls back to recognising
 * the session by name, so weeks written before the tag existed still get their
 * hard session named instead of silently dropping the line.
 */
function isQualityDay(day: WeeklyPlanDay): boolean {
  if (day.quality) return true;
  const kind = sessionKindOf(day);
  return !!kind && QUALITY_KINDS.has(kind);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The week in facts.
 *
 * Counts sessions by what they were, not by what would look good: an adapted
 * session is named as adapted, and a missed one as missed.
 */
function howItWent(input: WeekRecapInput): RecapSection {
  const question = "Como foi sua semana?";
  const days = input.adherence?.days ?? [];
  const runDays = days.filter(d => isRunDay(d.planned));
  const actualKm = days.reduce((s, d) => s + d.actualKm, 0);
  const ranDays = days.filter(d => d.actualKm > 0);
  const plannedKm = runDays.reduce((s, d) => s + (d.planned.distance_km ?? 0), 0);

  if (actualKm <= 0) {
    return {
      question,
      headline: "Nenhuma corrida registrada",
      lines: plannedKm > 0 ? [`Estavam previstos ${km(plannedKm)}.`] : [],
    };
  }

  const headline = `${km(actualKm)} em ${plural(ranDays.length, "dia de corrida", "dias de corrida")}`;
  const lines: string[] = [];

  const done = runDays.filter(d => d.status === "done").length;
  const adapted = runDays.filter(d => d.status === "adapted").length;
  const partial = runDays.filter(d => d.status === "partial").length;
  const missed = runDays.filter(d => d.status === "missed").length;
  if (runDays.length > 0) {
    const parts = [`${done} de ${runDays.length} como previstas`];
    if (adapted > 0) parts.push(plural(adapted, "adaptada", "adaptadas"));
    if (partial > 0) parts.push(plural(partial, "encurtada", "encurtadas"));
    if (missed > 0) parts.push(plural(missed, "não feita", "não feitas"));
    lines.push(`Sessões de corrida: ${parts.join(" · ")}.`);
  }

  // The session that gives the week its shape.
  const quality = days.find(d => isQualityDay(d.planned));
  if (quality) {
    const what = `O treino forte (${quality.planned.label})`;
    lines.push(
      quality.status === "adapted" ? `${what} você adaptou — conta como feito, não como falta.`
        : quality.status === "done" ? `${what} saiu como previsto.`
          : quality.status === "partial" ? `${what} saiu encurtado.`
            : `${what} ficou de fora.`,
    );
  }

  if (ranDays.length > 1) {
    const longest = ranDays.reduce((best, d) => (d.actualKm > best.actualKm ? d : best), ranDays[0]);
    lines.push(`Maior corrida: ${km(longest.actualKm)} ${onDay(longest.planned)}.`);
  }

  const strengthDays = days.filter(d => d.planned.type === "strength");
  if (strengthDays.length > 0) {
    const doneStrength = strengthDays.filter(d => d.status === "done").length;
    lines.push(`Musculação: ${doneStrength} de ${strengthDays.length} ${strengthDays.length === 1 ? "sessão" : "sessões"}.`);
  }

  if (input.previousActualKm != null && input.previousActualKm > 0) {
    const diff = actualKm - input.previousActualKm;
    lines.push(Math.abs(diff) < 1
      ? `Praticamente o mesmo volume da semana anterior (${km(input.previousActualKm)}).`
      : `${km(Math.abs(diff))} ${diff > 0 ? "a mais" : "a menos"} que na semana anterior (${km(input.previousActualKm)}).`);
  }

  return { question, headline, lines };
}

/**
 * The reading, in the athlete's own language.
 *
 * `WeekReading` already says what the coach concluded and why; this adds what
 * the check-ins and the substitutions said, and admits when nothing was
 * concluded instead of inventing a conclusion.
 */
function whatTheCoachUnderstood(input: WeekRecapInput): RecapSection {
  const question = "O que o treinador entendeu?";
  const lines: string[] = [];
  const reading = input.reading;

  if (reading?.detail) lines.push(reading.detail);

  const contexts = input.checkins
    .map(c => c.context)
    .filter((c): c is RunContext => !!c && c !== "none");
  if (contexts.length > 0) {
    const labels = Array.from(new Set(contexts.map(c => contextLabel(c, null).toLowerCase())));
    lines.push(`Nos check-ins você citou: ${labels.join(", ")}.`);
  }

  const veryHard = input.checkins.filter(c => c.effort === 5).length;
  if (veryHard > 0) {
    lines.push(`${plural(veryHard, "treino foi marcado", "treinos foram marcados")} como muito difícil.`);
  }

  for (const day of input.adherence?.days ?? []) {
    const adaptation = day.planned.adaptation;
    if (!adaptation) continue;
    const verdict = adaptation.verdict === "equivalent" ? "mantendo o objetivo da sessão"
      : adaptation.verdict === "partial" ? "mantendo parte do objetivo"
        : adaptation.verdict === "different" ? "com outro objetivo"
          : null;
    lines.push(adaptation.when === "before"
      ? `${OnDay(day.planned)} a sessão foi combinada antes do treino${verdict ? `, ${verdict}` : ""}.`
      : `${OnDay(day.planned)} você registrou ${adaptation.doneLabel ?? adaptation.text ?? "outro treino"}${verdict ? `, ${verdict}` : ""} — o previsto continua registrado como foi pedido.`);
  }

  if (reading?.ask && !input.weekAnswered) {
    lines.push("Falta a sua resposta sobre esta semana: a pergunta aparece ao abrir o app.");
  }

  if (lines.length === 0) {
    lines.push("Sem check-ins e sem plano anterior para comparar, não há leitura da semana — o plano seguiu apenas o que foi registrado nas corridas.");
  }

  return { question, headline: reading?.headline ?? "Semana registrada", lines };
}

/** The consequence: what the next week does with all of this. */
function whatChangesNext(input: WeekRecapInput): RecapSection {
  const question = "O que muda na próxima?";
  const next = input.nextWeek;
  if (!next) {
    return {
      question,
      headline: "A próxima semana ainda não foi gerada",
      lines: ["Quando ela for gerada, a leitura acima é o ponto de partida."],
    };
  }

  const nextKm = next.days.filter(isRunDay).reduce((s, d) => s + (d.distance_km ?? 0), 0);
  const plannedBefore = (input.adherence?.days ?? [])
    .filter(d => isRunDay(d.planned))
    .reduce((s, d) => s + (d.planned.distance_km ?? 0), 0);
  const diff = plannedBefore > 0 ? nextKm - plannedBefore : null;

  const headline = diff == null ? `Volume previsto: ${km(nextKm)}`
    : Math.abs(diff) < 0.5 ? `Volume previsto: ${km(nextKm)} — o mesmo da semana passada`
      : `Volume previsto: ${km(nextKm)} (${diff > 0 ? "+" : "−"}${km(Math.abs(diff))})`;

  const lines: string[] = [];
  const reading = input.reading;
  if (reading?.holding) lines.push("O que faltou não puxou o plano para baixo: o volume foi mantido, não reduzido.");
  if (reading?.noRamp) {
    lines.push(reading.reason === "too_much"
      ? "Sem aumento nesta semana, porque você pediu para aliviar a carga."
      : "Sem aumento nesta semana, até ficar claro como o corpo respondeu.");
  }

  const quality = next.days.find(isQualityDay);
  if (quality) lines.push(`Treino forte: ${quality.label} ${onDay(quality)}.`);

  const long = next.days.find(d => d.type === "long_run");
  if (long) lines.push(`Longão de ${km(long.distance_km ?? 0)} ${onDay(long)}.`);

  if (lines.length === 0) lines.push("A progressão segue a mesma linha da semana passada.");

  return { question, headline, lines };
}

/**
 * The recap of a week that has closed.
 *
 * Returns null while the week is still running — a week is not read before it
 * ends — and when there is nothing at all to say about it.
 */
export function weekRecap(input: WeekRecapInput): WeekRecap | null {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  if (addDays(input.weekStart, 6) >= today) return null;

  const days = input.adherence?.days ?? [];
  const ranKm = days.reduce((s, d) => s + d.actualKm, 0);
  const hadPlan = days.some(d => isRunDay(d.planned));
  if (ranKm <= 0 && !hadPlan) return null;

  return {
    weekStart: input.weekStart,
    range: rangeLabel(input.weekStart),
    went: howItWent(input),
    understood: whatTheCoachUnderstood(input),
    next: whatChangesNext(input),
  };
}
