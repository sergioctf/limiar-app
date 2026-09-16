/**
 * The last three months, read back to the athlete.
 *
 * There was a card doing this before. It showed a report written once by hand,
 * dated two years in the future, describing a training block from 2024 — and
 * nothing in the app had ever been able to replace it, because nothing wrote
 * that shape of record. It was a window onto a fossil.
 *
 * So this computes instead of remembering. Every number comes from the runs the
 * dashboard has already loaded, which means it cannot be stale, cannot drift
 * from reality, and costs no query and no token. A quarter is the right window:
 * long enough that a bad week does not swing it, short enough to still describe
 * the athlete you are now.
 *
 * Findings only fire when the evidence is there. Padding the list to look
 * thorough is how a summary stops being read.
 */
import type { Run, PerformanceTest } from "@/types";
import { isStrengthActivity, toSportKey } from "@/lib/sports";

/** Days in the window. Thirteen weeks — one training block. */
export const CYCLE_DAYS = 91;

export interface CycleFinding {
  title:  string;
  detail: string;
}

export interface CycleStat {
  label: string;
  value: string;
  /** Change against the previous quarter, when there is one to compare with. */
  delta?: { pct: number; better: boolean };
}

export interface CycleSummary {
  /** True when there is enough history to say anything at all. */
  ready:     boolean;
  from:      string;         // YYYY-MM-DD
  to:        string;         // YYYY-MM-DD
  headline:  string;
  stats:     CycleStat[];
  strengths: CycleFinding[];
  attention: CycleFinding[];
}

export interface CycleInput {
  runs: Run[];
  tests?: PerformanceTest[];
  /** Every logged activity, for spotting strength work and cross-training. */
  activities?: Array<{ date: string; sport_type: string }>;
  /** Overridable so tests do not depend on the clock. */
  today?: Date;
}

// ─── Window helpers ──────────────────────────────────────────────────────────

const dayMs = 86_400_000;

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shift(from: Date, days: number): Date {
  return new Date(from.getTime() + days * dayMs);
}

/** ISO-ish week key (Monday) for grouping, from a YYYY-MM-DD string. */
function weekKey(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** "12,8" — Portuguese uses a comma, and "12.8 km" reads as a typo. */
const dec = (n: number) => n.toFixed(1).replace(".", ",");

/** Percentage change, or null when there is no baseline to compare against. */
function change(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

// ─── The summary ─────────────────────────────────────────────────────────────

export function buildCycleSummary(input: CycleInput): CycleSummary {
  const today = input.today ?? new Date();
  const from  = shift(today, -CYCLE_DAYS);
  const prevFrom = shift(today, -CYCLE_DAYS * 2);

  const fromStr = dateStr(from);
  const toStr   = dateStr(today);
  const prevFromStr = dateStr(prevFrom);

  const inWindow = input.runs.filter(r => r.date >= fromStr && r.date <= toStr);
  const previous = input.runs.filter(r => r.date >= prevFromStr && r.date < fromStr);

  // Two runs in a quarter is not a training block. Saying nothing is more
  // honest than dressing three data points up as a trend.
  if (inWindow.length < 4) {
    return {
      ready: false, from: fromStr, to: toStr,
      headline: "", stats: [], strengths: [], attention: [],
    };
  }

  const km      = sum(inWindow.map(r => r.distance_km ?? 0));
  const prevKm  = sum(previous.map(r => r.distance_km ?? 0));
  const weeks   = CYCLE_DAYS / 7;
  const perWeek = km / weeks;

  const byWeek = new Map<string, number>();
  for (const r of inWindow) {
    const k = weekKey(r.date);
    byWeek.set(k, (byWeek.get(k) ?? 0) + (r.distance_km ?? 0));
  }
  const weeksWithRuns = byWeek.size;

  const longest = Math.max(...inWindow.map(r => r.distance_km ?? 0));
  const prevLongest = previous.length > 0 ? Math.max(...previous.map(r => r.distance_km ?? 0)) : 0;

  const volumeDelta = change(km, prevKm);

  const stats: CycleStat[] = [
    {
      label: "Volume",
      value: `${Math.round(km)} km`,
      delta: volumeDelta == null ? undefined : { pct: volumeDelta, better: volumeDelta >= 0 },
    },
    { label: "Por semana", value: `${dec(perWeek)} km` },
    { label: "Corridas",   value: String(inWindow.length) },
    { label: "Maior corrida", value: `${dec(longest)} km` },
  ];

  const headline = buildHeadline(km, inWindow.length, perWeek, volumeDelta);

  return {
    ready: true,
    from: fromStr,
    to: toStr,
    headline,
    stats,
    strengths: strengthsFrom({ km, prevKm, volumeDelta, weeksWithRuns, weeks, longest, prevLongest, input, fromStr, toStr }),
    attention: attentionFrom({ volumeDelta, weeksWithRuns, weeks, byWeek, longest, perWeek, input, fromStr, toStr, today }),
  };
}

function buildHeadline(km: number, runs: number, perWeek: number, delta: number | null): string {
  const base = `Nos últimos 3 meses você correu ${Math.round(km)} km em ${runs} corrida${runs > 1 ? "s" : ""}, ` +
    `média de ${dec(perWeek)} km por semana`;

  if (delta == null) return `${base}.`;
  if (delta >= 10)   return `${base} — ${delta}% acima do trimestre anterior.`;
  if (delta <= -10)  return `${base} — ${Math.abs(delta)}% abaixo do trimestre anterior.`;
  return `${base}, praticamente o mesmo do trimestre anterior.`;
}

// ─── Findings ────────────────────────────────────────────────────────────────

interface StrengthArgs {
  km: number; prevKm: number; volumeDelta: number | null;
  weeksWithRuns: number; weeks: number;
  longest: number; prevLongest: number;
  input: CycleInput; fromStr: string; toStr: string;
}

function strengthsFrom(a: StrengthArgs): CycleFinding[] {
  const out: CycleFinding[] = [];

  if (a.volumeDelta != null && a.volumeDelta >= 10) {
    out.push({
      title: "Volume subindo",
      detail: `${Math.round(a.km)} km contra ${Math.round(a.prevKm)} km no trimestre anterior — ` +
        `${a.volumeDelta}% a mais, construído ao longo de semanas em vez de num salto.`,
    });
  }

  const consistency = a.weeksWithRuns / a.weeks;
  if (consistency >= 0.8) {
    out.push({
      title: "Constância",
      detail: `Você correu em ${a.weeksWithRuns} das ${Math.round(a.weeks)} semanas. ` +
        `Regularidade rende mais que qualquer treino isolado.`,
    });
  }

  if (a.longest > a.prevLongest && a.prevLongest > 0) {
    out.push({
      title: "Longão mais longo",
      detail: `Sua maior corrida foi ${dec(a.longest)} km, contra ${dec(a.prevLongest)} km ` +
        `no trimestre anterior. Resistência é o que decide prova longa.`,
    });
  }

  const vdot = vdotProgress(a.input.tests ?? [], a.fromStr);
  if (vdot && vdot.delta > 0.4) {
    out.push({
      title: "VDOT em alta",
      detail: `De ${dec(vdot.before)} para ${dec(vdot.after)} — ` +
        `os ritmos de treino subiram junto, então o esforço de hoje vale mais que o de três meses atrás.`,
    });
  }

  const lifting = strengthSessions(a.input.activities ?? [], a.fromStr, a.toStr);
  if (lifting >= 12) {
    out.push({
      title: "Força mantida",
      detail: `${lifting} sessões de musculação no período. É a intervenção com melhor evidência ` +
        `para prevenir lesão e melhorar economia de corrida.`,
    });
  }

  return out.slice(0, 4);
}

interface AttentionArgs {
  volumeDelta: number | null;
  weeksWithRuns: number; weeks: number;
  byWeek: Map<string, number>;
  longest: number; perWeek: number;
  input: CycleInput; fromStr: string; toStr: string; today: Date;
}

function attentionFrom(a: AttentionArgs): CycleFinding[] {
  const out: CycleFinding[] = [];

  if (a.volumeDelta != null && a.volumeDelta <= -15) {
    out.push({
      title: "Volume caiu",
      detail: `${Math.abs(a.volumeDelta)}% abaixo do trimestre anterior. Se foi lesão ou pausa planejada, ` +
        `tudo bem — se não foi, o plano volta a crescer assim que a frequência voltar.`,
    });
  }

  const idle = Math.round(a.weeks) - a.weeksWithRuns;
  if (idle >= 3) {
    out.push({
      title: `${idle} semanas sem correr`,
      detail: `Buracos no calendário custam mais que semanas leves: a adaptação aeróbica começa a ` +
        `regredir por volta de 10 a 14 dias parado.`,
    });
  }

  // Week-to-week jumps. The 10% guideline is about the ramp, and the biggest
  // single jump is what actually hurts people.
  // Array.from rather than spreading the iterator: the build targets an older
  // ES level, where spreading a Map iterator needs downlevelIteration.
  const volumes = Array.from(a.byWeek.entries())
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([, v]) => v);
  const biggestJump = volumes.reduce((worst, v, i) => {
    if (i === 0 || volumes[i - 1] < 5) return worst;
    const jump = Math.round(((v - volumes[i - 1]) / volumes[i - 1]) * 100);
    return Math.max(worst, jump);
  }, 0);
  if (biggestJump >= 40) {
    out.push({
      title: "Saltos de volume",
      detail: `Houve uma semana ${biggestJump}% maior que a anterior. Subidas acima de ~10% por semana ` +
        `são o caminho mais comum para lesão por sobrecarga.`,
    });
  }

  if (a.longest < a.perWeek * 0.9 && a.perWeek > 8) {
    out.push({
      title: "Falta um longão",
      detail: `Sua maior corrida (${dec(a.longest)} km) é pequena para uma média de ` +
        `${dec(a.perWeek)} km/semana. O longão é a sessão que constrói resistência.`,
    });
  }

  const weeksSinceTest = testAgeWeeks(a.input.tests ?? [], a.today);
  if (weeksSinceTest != null && weeksSinceTest >= 10) {
    out.push({
      title: "Teste desatualizado",
      detail: `Seu último teste de 3 km foi há ${weeksSinceTest} semanas. Ritmos e zonas ainda saem dele — ` +
        `se você evoluiu, está treinando com números antigos.`,
    });
  } else if (weeksSinceTest == null) {
    out.push({
      title: "Sem teste de 3 km",
      detail: `Sem ele os ritmos e as zonas são estimativa. Um esforço de 12 a 14 minutos calibra o plano inteiro.`,
    });
  }

  const lifting = strengthSessions(a.input.activities ?? [], a.fromStr, a.toStr);
  if (lifting === 0) {
    out.push({
      title: "Sem força no período",
      detail: `Nenhuma sessão de musculação registrada. Duas por semana bastam para reduzir risco de lesão ` +
        `sem atrapalhar a corrida.`,
    });
  }

  return out.slice(0, 4);
}

// ─── Supporting reads ────────────────────────────────────────────────────────

function vdotProgress(
  tests: PerformanceTest[], fromStr: string,
): { before: number; after: number; delta: number } | null {
  const withVdot = tests
    .filter(t => typeof t.vdot === "number" && t.vdot > 0)
    .sort((x, y) => x.test_date.localeCompare(y.test_date));
  if (withVdot.length < 2) return null;

  // The most recent test in the window, against the last one before it.
  const after = withVdot[withVdot.length - 1];
  if (after.test_date < fromStr) return null;

  const before = withVdot[withVdot.length - 2];
  return {
    before: before.vdot as number,
    after:  after.vdot as number,
    delta:  (after.vdot as number) - (before.vdot as number),
  };
}

function testAgeWeeks(tests: PerformanceTest[], today: Date): number | null {
  const latest = tests
    .map(t => t.test_date)
    .sort()
    .pop();
  if (!latest) return null;
  const days = (today.getTime() - new Date(`${latest}T12:00:00Z`).getTime()) / dayMs;
  return Math.max(0, Math.floor(days / 7));
}

/** Lifting sessions in the window, one per day at most. */
function strengthSessions(
  activities: Array<{ date: string; sport_type: string }>, fromStr: string, toStr: string,
): number {
  const days = new Set<string>();
  for (const a of activities) {
    if (a.date < fromStr || a.date > toStr) continue;
    // `isStrengthActivity` folds HIIT and CrossFit in, which is what we want:
    // the question is whether the athlete loaded their legs, not what it was called.
    if (isStrengthActivity(a.sport_type) || toSportKey(a.sport_type) === "musculacao") {
      days.add(a.date);
    }
  }
  return days.size;
}
