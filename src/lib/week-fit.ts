/**
 * Fitting the week into the athlete's agenda.
 *
 * "Esta semana só consigo treinar terça, quinta e sábado." Adapting one session
 * solves one day; this reorganises the week around the days the athlete
 * actually has, says what it prioritised, and waits for a yes.
 *
 * What it protects, in order (Daniels, and Sérgio's own structure):
 *
 *   1. The long run, then the quality session, then easy runs. When the days
 *      run out, easy runs go first — nothing is squeezed in to make up the km.
 *   2. No two hard days back to back. A quality session that could only sit the
 *      day before the long run is dropped rather than stacked.
 *   3. Leve → tiro → longão: an easy run opens the week when there is one.
 *   4. The athlete's long-run day when it is available, and as little moving as
 *      possible otherwise.
 *
 * It does not guess the order: it scores every way the week could be laid out
 * (there are at most a few thousand) and keeps the best one. Sessions move
 * whole — content, structure, quality tag, any adaptation — and the lifting on
 * each day stays where it was.
 *
 * Deterministic. The proposal changes nothing until the athlete confirms.
 */
import { sessionKindOf } from "@/lib/session-adapt";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

type DayKey = WeeklyPlanDay["day"];
export const DAY_ORDER: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_PT: Record<DayKey, string> = {
  Mon: "segunda", Tue: "terça", Wed: "quarta", Thu: "quinta", Fri: "sexta", Sat: "sábado", Sun: "domingo",
};
const onDay = (d: DayKey) => `${d === "Sat" || d === "Sun" ? "no" : "na"} ${DAY_PT[d]}`;
const idx = (d: DayKey) => DAY_ORDER.indexOf(d);
const km = (n: number) => `${Number(n.toFixed(1)).toString().replace(".", ",")} km`;

type Role = "long" | "quality" | "test" | "easy";
const QUALITY = new Set(["hills", "repetitions", "intervals", "intervals_dense", "threshold", "fartlek", "progression"]);
const VALUE: Record<Role, number> = { long: 100, test: 90, quality: 40, easy: 10 };
const HARD: ReadonlySet<Role> = new Set<Role>(["long", "quality", "test"]);

/** Two hard days back to back cost more than a quality session is worth. */
const PENALTY_STACKED = 50;
const PENALTY_NOT_LONG_DAY = 8;
const PENALTY_ORDER = 5;
const PENALTY_PER_DAY_MOVED = 0.5;

export interface WeekRearrangement {
  at: string;
  available: DayKey[];
  fromDay: DayKey;
  /** The week's days as they were, restored by "desfazer". */
  original: WeeklyPlanDay[];
}

export interface FitSession {
  role: Role;
  label: string;
  km: number;
  from: DayKey;
}

export interface FitProposal {
  plan: WeeklyPlanData;
  placed: Array<FitSession & { to: DayKey }>;
  dropped: FitSession[];
  explanation: string[];
  beforeKm: number;
  afterKm: number;
  unchanged: boolean;
}

const isRun = (d: WeeklyPlanDay) =>
  d.type !== "rest" && d.type !== "strength" && (d.sport == null || d.sport === "corrida");

function roleOf(day: WeeklyPlanDay): Role | "race" {
  if (day.type === "race") return "race";
  if (day.type === "test") return "test";
  const kind = sessionKindOf(day.adaptation?.original ?? day);
  if (kind === "long_run" || day.type === "long_run") return "long";
  if (kind && QUALITY.has(kind)) return "quality";
  return "easy";
}

/** The part of a day that is the run — everything that moves with it. */
function runPart(d: WeeklyPlanDay): Partial<WeeklyPlanDay> {
  const tail = d.description.indexOf(" Depois (idealmente");
  return {
    type: d.type, sport: d.sport, label: d.label, distance_km: d.distance_km, duration_min: d.duration_min,
    pace: d.pace, structure: d.structure, quality: d.quality, adaptation: d.adaptation,
    // The note about lifting later that day belongs to the day it was written for.
    description: tail >= 0 ? d.description.slice(0, tail) : d.description,
  };
}

/** What a day is once its run has gone: the lifting, if any, else rest. */
function withoutRun(d: WeeklyPlanDay): WeeklyPlanDay {
  if (d.strength) {
    return {
      day: d.day, dayPt: d.dayPt, type: "strength", sport: "musculacao", label: "Musculação",
      duration_min: d.strength.estimatedMinutes, description: `${d.strength.exercises.length} exercícios.`,
      strength: d.strength,
    };
  }
  return { day: d.day, dayPt: d.dayPt, type: "rest", label: "Descanso", description: "Descanso completo. É quando a adaptação acontece." };
}

function permutations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest, k - 1)) out.push([item, ...p]);
  });
  return out;
}

function subsets<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 0; mask < 1 << items.length; mask++) out.push(items.filter((_, i) => mask & (1 << i)));
  return out;
}

interface Layout { sessions: FitSession[]; slots: DayKey[]; score: number }

function scoreLayout(sessions: FitSession[], slots: DayKey[], fixedHard: DayKey[], longRunDay: DayKey | null, available: DayKey[]): number {
  let score = 0;
  const at = new Map<DayKey, Role>();
  sessions.forEach((s, i) => { at.set(slots[i], s.role); score += VALUE[s.role] + (s.role === "easy" ? s.km * 0.2 : 0); });
  for (const d of fixedHard) at.set(d, "quality");

  // Hard days back to back.
  for (let i = 0; i < DAY_ORDER.length - 1; i++) {
    const a = at.get(DAY_ORDER[i]), b = at.get(DAY_ORDER[i + 1]);
    if (a && b && HARD.has(a) && HARD.has(b)) score -= PENALTY_STACKED;
  }

  // The long run on the athlete's day when it is on offer, else the last run of the week.
  const longIdx = sessions.findIndex(s => s.role === "long");
  if (longIdx >= 0) {
    const longDay = slots[longIdx];
    const wanted = longRunDay && available.includes(longRunDay) ? longRunDay : null;
    if (wanted ? longDay !== wanted : slots.some(d => idx(d) > idx(longDay))) score -= PENALTY_NOT_LONG_DAY;
  }

  // Leve → tiro → longão: the first run of the week is easy when there is an easy run.
  if (sessions.some(s => s.role === "easy")) {
    const first = sessions[slots.indexOf([...slots].sort((a, b) => idx(a) - idx(b))[0])];
    if (first && first.role !== "easy") score -= PENALTY_ORDER;
  }

  // Stability: move as little as possible.
  sessions.forEach((s, i) => { score -= Math.abs(idx(slots[i]) - idx(s.from)) * PENALTY_PER_DAY_MOVED; });
  return score;
}

export function fitWeek(plan: WeeklyPlanData, input: {
  available: DayKey[];
  /** First day that may change — today, for the week in progress. */
  fromDay?: DayKey;
  /** Days whose run is already done: they stay as they are. */
  doneDays?: DayKey[];
  longRunDay?: DayKey | null;
  now?: Date;
}): FitProposal | { error: string } {
  const fromDay = input.fromDay ?? "Mon";
  const done = new Set(input.doneDays ?? []);
  const open = (d: DayKey) => idx(d) >= idx(fromDay) && !done.has(d);
  const available = DAY_ORDER.filter(d => input.available.includes(d) && open(d));

  const movable = plan.days.filter(d => open(d.day) && isRun(d) && roleOf(d) !== "race");
  if (movable.some(d => d.swap)) {
    return { error: "Hoje já foi trocado pela recuperação. Desfaça a troca antes de reorganizar a semana." };
  }
  // A race keeps its day; it counts as a hard day for spacing.
  const raceDays = plan.days.filter(d => open(d.day) && isRun(d) && roleOf(d) === "race").map(d => d.day);
  const slotsFree = available.filter(d => !raceDays.includes(d));

  const sessions: FitSession[] = movable.map(d => ({
    role: roleOf(d) as Role, label: d.label, km: d.distance_km ?? 0, from: d.day,
  }));
  const beforeKm = sessions.reduce((s, x) => s + x.km, 0);

  // Every subset of sessions that fits, in every order across the free days.
  let best: Layout | null = null;
  for (const chosen of subsets(sessions)) {
    if (chosen.length > slotsFree.length) continue;
    for (const slots of permutations(slotsFree, chosen.length)) {
      const score = scoreLayout(chosen, slots, raceDays, input.longRunDay ?? null, slotsFree);
      if (!best || score > best.score + 1e-9) best = { sessions: chosen, slots, score };
    }
  }
  const layout = best ?? { sessions: [], slots: [], score: 0 };

  // Build the proposed week: every movable run leaves its day, then lands where it was placed.
  const byDay = new Map(plan.days.map(d => [d.day, d]));
  const days = plan.days.map(d => (movable.includes(d) ? withoutRun(d) : { ...d }));
  const placed: FitProposal["placed"] = [];
  layout.sessions.forEach((s, i) => {
    const to = layout.slots[i];
    const source = byDay.get(s.from)!;
    const k = days.findIndex(d => d.day === to);
    const target = days[k];
    days[k] = {
      ...target,
      ...runPart(source),
      day: target.day, dayPt: target.dayPt,
      ...(target.strength ? { strength: target.strength } : {}),
      ...(to !== s.from ? { movedFrom: source.dayPt } : {}),
    } as WeeklyPlanDay;
    placed.push({ ...s, to });
  });
  const dropped = sessions.filter(s => !layout.sessions.includes(s));
  const afterKm = layout.sessions.reduce((s, x) => s + x.km, 0);
  const unchanged = dropped.length === 0 && placed.every(p => p.to === p.from);

  const rearrangement: WeekRearrangement = {
    at: (input.now ?? new Date()).toISOString(),
    available: input.available,
    fromDay,
    original: plan.rearrangement?.original ?? plan.days,
  };

  return {
    plan: { ...plan, days, rearrangement },
    placed, dropped, beforeKm, afterKm, unchanged,
    explanation: explain(placed, dropped, available, beforeKm, afterKm, sessions),
  };
}

function describe(s: FitSession): string {
  return s.role === "long" ? `O longão (${km(s.km)})`
    : s.role === "quality" ? `O treino forte (${s.label})`
      : s.role === "test" ? `O teste (${s.label})`
        : `A rodagem leve de ${km(s.km)}`;
}

function explain(
  placed: FitProposal["placed"], dropped: FitSession[], available: DayKey[],
  beforeKm: number, afterKm: number, sessions: FitSession[],
): string[] {
  const lines: string[] = [];
  const order: Role[] = ["long", "test", "quality", "easy"];
  for (const p of [...placed].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))) {
    lines.push(p.to === p.from ? `${describe(p)} fica ${onDay(p.to)}.` : `${describe(p)} vai para ${DAY_PT[p.to]}.`);
  }
  for (const d of dropped) {
    const why = d.role === "quality" && placed.some(p => p.role === "long")
      ? "ficaria colado em outro dia forte, e dois dias fortes seguidos cobram mais do que rendem"
      : d.role === "easy" ? `com ${available.length} ${available.length === 1 ? "dia" : "dias"}, o longão e o treino forte vêm primeiro`
        : "não coube nos dias disponíveis";
    lines.push(`${describe(d)} de ${DAY_PT[d.from]} sai: ${why}.`);
  }
  if (dropped.length > 0) {
    lines.push(`Volume da semana: ${km(beforeKm)} → ${km(afterKm)}. Não tentamos compensar os quilômetros que saíram.`);
  }
  if (sessions.length === 0) lines.push("Não há corridas a reorganizar a partir de hoje.");
  return lines;
}

/** Put the week back exactly as it was before it was reorganised. */
export function undoFit(plan: WeeklyPlanData): { plan: WeeklyPlanData } | { error: string } {
  const r = plan.rearrangement;
  if (!r) return { error: "Esta semana não foi reorganizada." };
  const { rearrangement: _dropped, ...rest } = plan;
  void _dropped;
  return { plan: { ...rest, days: r.original } };
}

/**
 * The athlete's running days for a week, when they told the coach their agenda.
 *
 * Used when a week is generated after the agenda was given: the engine lays the
 * sessions on these days instead of the usual ones, and the long run stays on
 * its day only if that day is still free.
 */
export function prefsForAgenda<P extends { runDays: DayKey[]; longRunDay?: DayKey | null }>(prefs: P, agenda: DayKey[] | null | undefined): P {
  const days = (agenda ?? []).filter(d => DAY_ORDER.includes(d));
  if (days.length === 0) return prefs;
  const sorted = [...days].sort((a, b) => idx(a) - idx(b));
  return {
    ...prefs,
    runDays: sorted,
    longRunDay: prefs.longRunDay && sorted.includes(prefs.longRunDay) ? prefs.longRunDay : null,
  };
}
