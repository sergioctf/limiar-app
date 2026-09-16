/**
 * Deterministic edits to a weekly plan.
 *
 * The chat used to hand the whole seven-day plan to a language model and ask it
 * to return a rewritten one. When the model wrote *"Atualizado o longão de
 * sábado para 8 km"* but returned no plan, the app said the change was made and
 * nothing changed — the worst failure a coach can have, because the athlete
 * trains on a plan the app told them was different.
 *
 * So the model no longer edits anything. It translates a sentence into the
 * structured edits below, this module applies them, and the reply is written
 * from the edits that actually landed. If none did, the app says so.
 */
import type { WeeklyPlanData, WeeklyPlanDay, StructuredWorkout, WorkoutBlock } from "@/types";
import { isRepeatBlock } from "@/types";
import { isRunSession } from "@/lib/sports";

const DAY_ORDER: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_PT: Record<string, string> = {
  Mon: "segunda", Tue: "terça", Wed: "quarta", Thu: "quinta",
  Fri: "sexta", Sat: "sábado", Sun: "domingo",
};

export type PlanEdit =
  /** Change the distance of one day's run. */
  | { kind: "set_distance"; day: WeeklyPlanDay["day"]; km: number }
  /** Turn a day into rest. */
  | { kind: "set_rest"; day: WeeklyPlanDay["day"] }
  /** Exchange what two days contain. */
  | { kind: "swap_days"; a: WeeklyPlanDay["day"]; b: WeeklyPlanDay["day"] }
  /**
   * Move ONE session to another day, leaving the rest of both days alone.
   *
   * Life is the reason this exists: the run was in the morning and the lifting
   * in the afternoon, the athlete slept through the run and did the lifting.
   * Swapping the whole day would drag the lifting along with it; what they want
   * is the run on Tuesday and everything else where it was.
   */
  | { kind: "move_session"; from: WeeklyPlanDay["day"]; to: WeeklyPlanDay["day"]; session: "corrida" | "musculacao" }
  /** Scale every running distance in the week. */
  | { kind: "scale_week"; factor: number };

export interface PlanEditResult {
  plan: WeeklyPlanData;
  /** One line per edit that actually changed something. */
  changes: string[];
  /** Edits that were understood but could not be applied, and why. */
  rejected: string[];
}

const round05 = (n: number) => Math.round(n * 2) / 2;

function isDay(v: unknown): v is WeeklyPlanDay["day"] {
  return typeof v === "string" && DAY_ORDER.includes(v as WeeklyPlanDay["day"]);
}

/** Accept only well-formed edits; anything else is dropped rather than guessed at. */
export function normalizePlanEdits(raw: unknown): PlanEdit[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanEdit[] = [];

  for (const e of raw.slice(0, 8)) {
    if (!e || typeof e !== "object") continue;
    const kind = (e as { kind?: unknown }).kind;

    if (kind === "set_distance") {
      const { day, km } = e as { day?: unknown; km?: unknown };
      const n = Number(km);
      // A plausible single session: nobody edits their plan to a 90 km Tuesday.
      if (isDay(day) && Number.isFinite(n) && n > 0 && n <= 60) {
        out.push({ kind: "set_distance", day, km: round05(n) });
      }
    } else if (kind === "set_rest") {
      const { day } = e as { day?: unknown };
      if (isDay(day)) out.push({ kind: "set_rest", day });
    } else if (kind === "swap_days") {
      const { a, b } = e as { a?: unknown; b?: unknown };
      if (isDay(a) && isDay(b) && a !== b) out.push({ kind: "swap_days", a, b });
    } else if (kind === "move_session") {
      const { from, to, session } = e as { from?: unknown; to?: unknown; session?: unknown };
      if (isDay(from) && isDay(to) && from !== to
          && (session === "corrida" || session === "musculacao")) {
        out.push({ kind: "move_session", from, to, session });
      }
    } else if (kind === "scale_week") {
      const f = Number((e as { factor?: unknown }).factor);
      if (Number.isFinite(f) && f >= 0.5 && f <= 2) out.push({ kind: "scale_week", factor: f });
    }
  }
  return out;
}

/**
 * Scale a session's structure to a new total distance.
 *
 * Without this the km-by-km table and the .FIT export keep describing the old
 * session — the header says 8 km and the watch still guides 5.
 */
function scaleStructure(structure: StructuredWorkout, factor: number): StructuredWorkout {
  const scaleBlock = (b: WorkoutBlock): WorkoutBlock => {
    if (isRepeatBlock(b)) {
      return { ...b, steps: b.steps.map(s => scaleBlock(s) as typeof s) };
    }
    return b.distance_km != null
      ? { ...b, distance_km: Math.round(b.distance_km * factor * 100) / 100 }
      : b;   // time-based steps (jog recoveries) keep their duration
  };
  return { ...structure, blocks: structure.blocks.map(scaleBlock) };
}

function setDistance(day: WeeklyPlanDay, km: number): WeeklyPlanDay {
  const previous = day.distance_km ?? 0;
  const next: WeeklyPlanDay = { ...day, distance_km: km };

  if (day.structure && previous > 0) {
    next.structure = scaleStructure(day.structure, km / previous);
  }
  // The description quotes the old distance; rewrite the number rather than
  // leaving a paragraph that contradicts the header.
  if (previous > 0) {
    next.description = day.description.replace(
      new RegExp(`\\b${previous.toString().replace(".", "[.,]")}\\s*km`, "gi"),
      `${km} km`,
    );
  }
  return next;
}

export function applyPlanEdits(plan: WeeklyPlanData, edits: PlanEdit[]): PlanEditResult {
  let days = plan.days.map(d => ({ ...d }));
  const changes: string[] = [];
  const rejected: string[] = [];

  const find = (key: WeeklyPlanDay["day"]) => days.findIndex(d => d.day === key);

  for (const edit of edits) {
    switch (edit.kind) {
      case "set_distance": {
        const i = find(edit.day);
        if (i < 0) { rejected.push(`${DAY_PT[edit.day]} não existe no plano.`); break; }
        const current = days[i];
        if (current.type === "rest" || current.distance_km == null) {
          rejected.push(`${DAY_PT[edit.day]} não é um dia de corrida — não há distância para ajustar.`);
          break;
        }
        if (current.distance_km === edit.km) {
          rejected.push(`${DAY_PT[edit.day]} já está com ${edit.km} km.`);
          break;
        }
        changes.push(`${current.label} de ${DAY_PT[edit.day]}: ${current.distance_km} km → ${edit.km} km`);
        days[i] = setDistance(current, edit.km);
        break;
      }

      case "set_rest": {
        const i = find(edit.day);
        if (i < 0) break;
        if (days[i].type === "rest") { rejected.push(`${DAY_PT[edit.day]} já era descanso.`); break; }
        changes.push(`${DAY_PT[edit.day]}: ${days[i].label} removido, agora é descanso`);
        days[i] = {
          day: days[i].day, dayPt: days[i].dayPt, type: "rest", label: "Descanso",
          description: "Descanso completo. É quando a adaptação acontece.",
        };
        break;
      }

      case "swap_days": {
        const ia = find(edit.a), ib = find(edit.b);
        if (ia < 0 || ib < 0) break;
        const a = days[ia], b = days[ib];
        changes.push(`${a.label} e ${b.label} trocaram de dia (${DAY_PT[edit.a]} ↔ ${DAY_PT[edit.b]})`);
        days[ia] = { ...b, day: a.day, dayPt: a.dayPt };
        days[ib] = { ...a, day: b.day, dayPt: b.dayPt };
        break;
      }

      case "move_session": {
        const iFrom = find(edit.from), iTo = find(edit.to);
        if (iFrom < 0 || iTo < 0) break;
        const src = days[iFrom], dst = days[iTo];

        if (edit.session === "musculacao") {
          if (!src.strength) { rejected.push(`Não há musculação ${DAY_PT[edit.from]}.`); break; }
          if (dst.strength)  { rejected.push(`${DAY_PT[edit.to]} já tem musculação.`); break; }

          changes.push(`Musculação: ${DAY_PT[edit.from]} → ${DAY_PT[edit.to]}`);

          /*
           * The destination has to become a lifting day, not merely acquire a
           * lifting session.
           *
           * Copying `strength` onto the day and keeping its type left rows that
           * said `type: "rest", label: "Descanso"` while carrying four
           * exercises. Everything that reads `type` — the push notification
           * above all — then announced a rest day, while everything that reads
           * `strength` drew a dumbbell on the same square. The athlete was told
           * on Friday night that Saturday was off, with a session sitting in it.
           *
           * A day that already holds a run keeps the run's identity: the run
           * owns the day and the lifting rides along, which is exactly how the
           * generator builds a shared day.
           */
          days[iTo] = isRunSession(dst)
            ? { ...dst, strength: src.strength }
            : {
                day: dst.day, dayPt: dst.dayPt,
                type: "strength", sport: "musculacao", label: "Musculação",
                duration_min: src.strength.estimatedMinutes,
                description: `${src.strength.exercises.length} exercícios.`,
                strength: src.strength,
              };

          days[iFrom] = { ...src, strength: undefined };
          // A day with nothing left in it is a rest day.
          if (days[iFrom].type === "rest" || days[iFrom].distance_km == null) {
            days[iFrom] = {
              day: src.day, dayPt: src.dayPt, type: "rest", label: "Descanso",
              description: "Descanso completo. É quando a adaptação acontece.",
            };
          }
          break;
        }

        // Moving the run.
        const srcHasRun = src.type !== "rest" && src.type !== "strength";
        if (!srcHasRun) { rejected.push(`Não há corrida ${DAY_PT[edit.from]}.`); break; }

        const runPart = {
          type: src.type, sport: src.sport, label: src.label,
          distance_km: src.distance_km, duration_min: src.duration_min,
          pace: src.pace, description: src.description, structure: src.structure,
        };
        const dstHasRun = dst.type !== "rest" && dst.type !== "strength";

        if (dstHasRun) {
          // Two runs: exchange them rather than overwrite one.
          changes.push(`${src.label} (${DAY_PT[edit.from]}) e ${dst.label} (${DAY_PT[edit.to]}) trocaram de dia`);
          days[iFrom] = {
            ...src, type: dst.type, sport: dst.sport, label: dst.label,
            distance_km: dst.distance_km, duration_min: dst.duration_min,
            pace: dst.pace, description: dst.description, structure: dst.structure,
          };
          days[iTo] = { ...dst, ...runPart };
          break;
        }

        changes.push(`${src.label}: ${DAY_PT[edit.from]} → ${DAY_PT[edit.to]}`);
        days[iTo] = { ...dst, ...runPart };
        // What stays behind: the lifting session if there was one, else rest.
        days[iFrom] = src.strength
          ? {
              day: src.day, dayPt: src.dayPt, type: "strength", sport: "musculacao",
              label: "Musculação", duration_min: src.strength.estimatedMinutes,
              description: `${src.strength.exercises.length} exercícios.`,
              strength: src.strength,
            }
          : {
              day: src.day, dayPt: src.dayPt, type: "rest", label: "Descanso",
              description: "Descanso completo. É quando a adaptação acontece.",
            };
        break;
      }

      case "scale_week": {
        const runDays = days.filter(d => d.distance_km != null && d.distance_km > 0);
        if (runDays.length === 0) { rejected.push("Não há corridas para ajustar."); break; }
        const before = runDays.reduce((s, d) => s + (d.distance_km ?? 0), 0);
        days = days.map(d =>
          d.distance_km != null && d.distance_km > 0
            ? setDistance(d, round05(d.distance_km * edit.factor))
            : d);
        const after = days.reduce((s, d) => s + (d.distance_km ?? 0), 0);
        changes.push(`Volume da semana: ${round05(before)} km → ${round05(after)} km`);
        break;
      }
    }
  }

  return {
    plan: { ...plan, days, generated_at: new Date().toISOString() },
    changes,
    rejected,
  };
}

/**
 * What actually differs between two versions of a week.
 *
 * Used to confirm the reply against the plan that was really saved, rather than
 * against what the model said it would do.
 */
export function diffPlans(before: WeeklyPlanData, after: WeeklyPlanData): string[] {
  const out: string[] = [];
  for (const b of before.days) {
    const a = after.days.find(d => d.day === b.day);
    if (!a) continue;
    if (a.type !== b.type) {
      out.push(`${DAY_PT[b.day]}: ${b.label} → ${a.label}`);
    } else if ((a.distance_km ?? 0) !== (b.distance_km ?? 0)) {
      out.push(`${DAY_PT[b.day]}: ${b.distance_km ?? 0} km → ${a.distance_km ?? 0} km`);
    }
  }
  return out;
}

/** Sessions that can be shortened without rewriting what the session is. */
const LIGHTENABLE: WeeklyPlanDay["type"][] = ["easy", "recovery", "long_run"];

/**
 * The athlete said a session was too heavy and asked for the next ones to be
 * a little lighter.
 *
 * Only runs after `afterDay` change, and only the ones that can be shortened
 * honestly: easy runs, recovery runs and the long run lose about 15 per cent
 * (never below 3 km), with their structure and description rescaled together.
 * Quality sessions keep their shape — scaling 800 m repeats by 0.85 produces
 * 680 m repeats nobody would ever prescribe — and tests and races are never
 * touched. A day already swapped or already lightened is left alone, so asking
 * twice does not shrink the week twice.
 */
export function lightenUpcomingRuns(
  plan: WeeklyPlanData,
  afterDay: WeeklyPlanDay["day"],
  factor = 0.85,
): PlanEditResult {
  const from = DAY_ORDER.indexOf(afterDay);
  const changes: string[] = [];
  const days = plan.days.map(d => {
    if (DAY_ORDER.indexOf(d.day) <= from) return d;
    if (!LIGHTENABLE.includes(d.type) || d.swap || d.lightenedFrom != null) return d;
    const km = d.distance_km ?? 0;
    if (km <= 3) return d;
    const next = Math.max(3, round05(km * factor));
    if (next >= km) return d;
    changes.push(`${d.dayPt}: ${d.label} ${km} km → ${next} km`);
    return { ...setDistance(d, next), lightenedFrom: km };
  });
  return {
    plan: changes.length > 0 ? { ...plan, days } : plan,
    changes,
    rejected: changes.length > 0 ? [] : ["Não há corridas leves ou longão restantes nesta semana para aliviar."],
  };
}
