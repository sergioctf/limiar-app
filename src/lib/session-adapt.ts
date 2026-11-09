/**
 * Adapting a session before it happens — and understanding one that changed.
 *
 * Sérgio, 16/09: the plan said hills, he did 8 × 400 m, and the check-in
 * compared his run against the hill session. He normally tries to preserve the
 * purpose of a session when he swaps it, and he decides the swap before
 * leaving. So the coach takes part in that decision:
 *
 *   1. The athlete says what has to change (time, place, equipment, format).
 *   2. The coach offers two or three alternatives, one recommended, each saying
 *      what it preserves, what it changes and why it fits the restriction —
 *      and says so plainly when nothing preserves the purpose.
 *   3. Or the athlete proposes their own ("8 × 400 m"). The coach reads it,
 *      asks only for what is missing, and judges it: same purpose, part of it,
 *      or a different session. It may disagree; the athlete decides.
 *   4. The accepted version replaces the day, with the original kept inside, and
 *      the post-run feedback compares against what was agreed.
 *
 * Everything here is deterministic: the alternatives come from the same
 * builders that write the plan, and the proposal is parsed, not interpreted by
 * a model. The engine prescribes; nothing in this file guesses.
 */
import { buildEasyRun, buildIntervalRun, buildLongRun, flattenSteps, hrFor, type WeekContext } from "@/lib/workout-builder";
import type { QualityKind } from "@/lib/mesocycle";
import type { TrainingPace } from "@/lib/performance";
import type { StructuredWorkout, WeeklyPlanData, WeeklyPlanDay, WorkoutBlock, WorkoutStep } from "@/types";
import { isRepeatBlock } from "@/types";

// ─── What a session is for ──────────────────────────────────────────────────

export type SessionKind = QualityKind | "easy" | "recovery" | "long_run" | "test" | "race";
export type Family = "power" | "speed" | "vo2" | "threshold" | "aerobic" | "endurance" | "calibration" | "race";

const FAMILY: Record<SessionKind, Family> = {
  hills: "power",
  repetitions: "speed",
  intervals: "vo2",
  intervals_dense: "vo2",
  threshold: "threshold",
  fartlek: "threshold",
  progression: "threshold",
  strides: "aerobic",
  easy: "aerobic",
  recovery: "aerobic",
  long_run: "endurance",
  test: "calibration",
  race: "race",
};

export const FAMILY_LABEL: Record<Family, string> = {
  power: "força e potência em esforços curtos e intensos",
  speed: "velocidade e economia de corrida",
  vo2: "trabalho de VO₂máx (tiros fortes de poucos minutos)",
  threshold: "ritmo de limiar (forte e sustentável)",
  aerobic: "base aeróbica leve",
  endurance: "resistência (tempo em pé)",
  calibration: "calibração dos seus ritmos",
  race: "prova",
};

/** Families close enough that swapping between them keeps part of the purpose. */
const NEIGHBORS: Partial<Record<Family, Family[]>> = {
  power: ["speed"],
  speed: ["power"],
  vo2: ["threshold"],
  threshold: ["vo2"],
};

const MEMBERS: Partial<Record<Family, QualityKind[]>> = {
  power: ["hills"],
  speed: ["repetitions"],
  vo2: ["intervals", "intervals_dense"],
  threshold: ["threshold", "fartlek", "progression"],
};

export function familyOf(kind: SessionKind): Family {
  return FAMILY[kind];
}

/** What kind of session a plan day is — from the tag when present, else from its label. */
export function sessionKindOf(day: WeeklyPlanDay): SessionKind | null {
  if (day.quality) return day.quality;
  if (day.type === "test") return "test";
  if (day.type === "race") return "race";
  if (day.type === "easy" || day.type === "recovery" || day.type === "long_run") return day.type;
  const label = day.label ?? "";
  if (/^Subidas/i.test(label)) return "hills";
  if (/^Tiros curtos/i.test(label)) return "repetitions";
  if (/^Tiro denso/i.test(label)) return "intervals_dense";
  if (/^Tiro/i.test(label)) return "intervals";
  if (/^Tempo/i.test(label)) return "threshold";
  if (/^Fartlek/i.test(label)) return "fartlek";
  if (/^Progressivo/i.test(label)) return "progression";
  if (/^Leve \+/i.test(label)) return "strides";
  if (day.type === "intervals") return "intervals";
  if (day.type === "tempo") return "threshold";
  return null;
}

/** Running sessions the athlete may adapt. Tests and races keep their protocol. */
export function isAdaptable(day: WeeklyPlanDay | null | undefined): boolean {
  if (!day || day.type === "rest" || day.type === "strength" || day.type === "hiit") return false;
  if (day.sport && day.sport !== "corrida") return false;
  const kind = sessionKindOf(day);
  return kind != null && kind !== "test" && kind !== "race";
}

// ─── Reasons ────────────────────────────────────────────────────────────────

export type AdaptReason = "time" | "fatigue" | "place" | "equipment" | "format" | "other";

export const ADAPT_REASONS: Record<AdaptReason, string> = {
  time: "Tenho menos tempo",
  fatigue: "Estou cansado",
  place: "Local inadequado (sem ladeira, pista ou percurso)",
  equipment: "Sem relógio ou GPS para ritmo",
  format: "Prefiro outro formato",
  other: "Outro motivo",
};

// ─── Context and pace helpers ───────────────────────────────────────────────

export type AdaptContext = Pick<WeekContext,
  "weeklyKm" | "paces" | "lthr" | "cycleWeek" | "cycleNumber" | "excludedQuality" | "minRunKm" | "phase">;

type Intensity = NonNullable<WorkoutStep["intensity"]>;
const PACE_NAME: Record<Intensity, TrainingPace["name"]> = {
  E: "easy", M: "marathon", T: "threshold", I: "interval", R: "repetition",
};
/** Only for estimating minutes when the athlete has no test yet. */
const FALLBACK_SEC: Record<Intensity, number> = { E: 390, M: 345, T: 320, I: 300, R: 285 };

const round05 = (n: number) => Math.round(n * 2) / 2;

function paceSec(paces: TrainingPace[] | null, intensity: Intensity): number {
  const p = paces?.find(x => x.name === PACE_NAME[intensity]);
  return p ? Math.round((p.pace_min_sec + p.pace_max_sec) / 2) : FALLBACK_SEC[intensity];
}

function paceRange(paces: TrainingPace[] | null, name: TrainingPace["name"]): string | undefined {
  const p = paces?.find(x => x.name === name);
  if (!p) return undefined;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  return `${fmt(p.pace_max_sec)}–${fmt(p.pace_min_sec)}/km`;
}

/** Minutes a session takes, from its structure. */
export function estimateMinutes(day: WeeklyPlanDay, paces: TrainingPace[] | null): number {
  if (!day.structure) return Math.round(((day.distance_km ?? 0) * paceSec(paces, "E")) / 60);
  let seconds = 0;
  for (const step of flattenSteps(day.structure)) {
    if (step.duration_min != null) seconds += step.duration_min * 60;
    else if (step.distance_km != null) seconds += step.distance_km * paceSec(paces, step.intensity ?? "E");
  }
  return Math.round(seconds / 60);
}

// ─── Building alternatives ──────────────────────────────────────────────────

const strengthTail = (d: WeeklyPlanDay) => {
  const i = d.description.indexOf(" Depois (idealmente");
  return i >= 0 ? d.description.slice(i) : "";
};

/** A built session on the planned day, keeping the lifting session that shares it. */
function compose(planned: WeeklyPlanDay, built: { day: Partial<WeeklyPlanDay>; structure: StructuredWorkout }): WeeklyPlanDay {
  return {
    day: planned.day,
    dayPt: planned.dayPt,
    sport: planned.sport ?? "corrida",
    type: built.day.type ?? planned.type,
    label: built.day.label ?? planned.label,
    distance_km: built.day.distance_km,
    duration_min: built.day.duration_min,
    pace: built.day.pace,
    description: `${built.day.description ?? ""}${strengthTail(planned)}`,
    structure: built.structure,
    ...(built.day.quality ? { quality: built.day.quality } : {}),
    ...(planned.strength ? { strength: planned.strength } : {}),
  };
}

function qualitySession(planned: WeeklyPlanDay, ctx: AdaptContext, kind: QualityKind, scale = 1): WeeklyPlanDay {
  return compose(planned, buildIntervalRun({ ...ctx, weeklyKm: Math.max(8, ctx.weeklyKm * scale), forceQuality: kind, testDue: false }));
}

/** Fewest reps a short version keeps before it stops being the same session. */
const SHORT_MIN_REPS: Partial<Record<QualityKind, number>> = {
  hills: 4, repetitions: 4, intervals: 2, intervals_dense: 2, threshold: 2, fartlek: 3,
};

/**
 * The planned session itself, cut down to fit less time.
 *
 * Rebuilding from a smaller weekly volume does not work at low volume: the
 * builder's floors (three reps, a 1,5 km warm-up) already bind, and "shorter"
 * came back identical. An athlete with 30 minutes accepts four hill reps
 * instead of six; the stimulus is the same, only less of it.
 */
function shortenQuality(base: WeeklyPlanDay, kind: QualityKind, ctx: AdaptContext): WeeklyPlanDay | null {
  if (!base.structure) return null;
  let repsFrom: number | null = null;
  let repsTo: number | null = null;
  const blocks: WorkoutBlock[] = base.structure.blocks.map(b => {
    if (isRepeatBlock(b)) {
      const next = Math.max(SHORT_MIN_REPS[kind] ?? 2, Math.round(b.repeat * 0.6));
      repsFrom = b.repeat; repsTo = Math.min(b.repeat, next);
      return { ...b, repeat: repsTo };
    }
    if (b.kind === "warmup" && b.distance_km != null) return { ...b, distance_km: Math.max(1, round05(b.distance_km * 0.7)) };
    if (b.kind === "cooldown" && b.distance_km != null) return { ...b, distance_km: Math.max(0.5, round05(b.distance_km * 0.6)) };
    if (b.kind === "run" && b.distance_km != null) return { ...b, distance_km: round05(b.distance_km * 0.7) };
    return b;
  });
  const draft: WeeklyPlanDay = { ...base, structure: { blocks } };
  delete draft.adaptation;
  // Both sides measured the same way (timed steps converted at their pace), then
  // scaled onto the plan's own distance convention, which leaves jog recoveries out.
  const covered = (s: StructuredWorkout) => flattenSteps(s).reduce((sum, st) =>
    sum + (st.distance_km ?? ((st.duration_min ?? 0) * 60) / paceSec(ctx.paces, st.intensity ?? "E")), 0);
  const before = covered(base.structure);
  const after = covered(draft.structure!);
  if (!(before > 0) || after >= before - 0.05) return null;
  const distance = round05((base.distance_km ?? before) * (after / before));
  const label = repsFrom != null && repsTo != null && repsTo < repsFrom
    ? base.label.replace(`${repsFrom}×`, `${repsTo}×`)
    : base.label.replace(/\d+(?:[.,]\d+)?\s*km/, `${String(distance).replace(".", ",")} km`);
  const day = {
    ...draft,
    label: label === base.label ? `${base.label} (versão curta)` : label,
    distance_km: distance,
    description: `Versão curta da sessão planejada, para caber em menos tempo. ${base.description}`,
  };
  return { ...day, duration_min: estimateMinutes(day, ctx.paces) };
}

/** The same session by time instead of distance — for any route, or without GPS. */
export function toTimeBased(planned: WeeklyPlanDay, paces: TrainingPace[] | null): WeeklyPlanDay | null {
  if (!planned.structure) return null;
  let changed = false;
  const convert = (step: WorkoutStep): WorkoutStep => {
    if (step.distance_km == null) return step;
    changed = true;
    const minutes = Math.max(0.5, round05((step.distance_km * paceSec(paces, step.intensity ?? "E")) / 60));
    const { distance_km: _km, ...rest } = step;
    return { ...rest, duration_min: minutes };
  };
  const blocks: WorkoutBlock[] = planned.structure.blocks.map(b =>
    isRepeatBlock(b) ? { ...b, steps: b.steps.map(convert) } : convert(b));
  if (!changed) return null;
  const adapted: WeeklyPlanDay = {
    ...planned,
    label: `${planned.label} (por tempo)`,
    structure: { blocks },
    description: `A mesma sessão guiada por tempo e esforço, para fazer em qualquer percurso ou sem GPS. ${planned.description}`,
  };
  delete adapted.adaptation;
  return { ...adapted, duration_min: estimateMinutes(adapted, paces) };
}

export interface AdaptOption {
  id: string;
  recommended: boolean;
  day: WeeklyPlanDay;
  estimatedMin: number;
  preserves: string;
  changes: string;
  why: string;
}

const km = (n: number | undefined) => `${Number((n ?? 0).toFixed(1)).toString().replace(".", ",")} km`;

/**
 * Two or three alternatives for a restriction, the first recommended.
 *
 * Never padded: when only one option preserves the purpose, only one is shown,
 * and when none does, the limitation is said instead of inventing a fake swap.
 */
export function adaptOptions(planned: WeeklyPlanDay, reason: AdaptReason, ctx: AdaptContext): { options: AdaptOption[]; limitation?: string } {
  const kind = sessionKindOf(planned);
  if (!kind || !isAdaptable(planned)) {
    return { options: [], limitation: kind === "test"
      ? "O teste de 3 km precisa ser feito como está: é ele que calibra seus ritmos. Se hoje não dá, faça em outro dia da semana."
      : "Esta sessão não tem adaptação: só corridas podem ser adaptadas aqui." };
  }
  const base = planned.adaptation?.original ?? planned;
  const family = familyOf(kind);
  const excluded = ctx.excludedQuality ?? [];
  const allowed = (k: QualityKind) => !excluded.includes(k);
  const out: AdaptOption[] = [];
  const push = (id: string, day: WeeklyPlanDay | null, preserves: string, changes: string, why: string) => {
    // Same name is not the same session: a shorter "Tiro 3×400 m" keeps the
    // reps and trims the warm-up. Only label *and* distance make a duplicate.
    const same = (a: WeeklyPlanDay) => a.label === day?.label && a.distance_km === day?.distance_km;
    if (!day || out.some(o => same(o.day)) || same(base)) return;
    out.push({ id, recommended: out.length === 0, day, estimatedMin: estimateMinutes(day, ctx.paces), preserves, changes, why });
  };
  const isQuality = MEMBERS[family] !== undefined;

  // Tired and short of time ask for the same thing first: the session, smaller.
  if (reason === "time" || reason === "fatigue") {
    if (isQuality) {
      const shorter = shortenQuality(base, kind as QualityKind, ctx);
      if (shorter) {
        push("shorter", shorter, `Mantém ${FAMILY_LABEL[family]}.`,
          `Mais curto: cerca de ${estimateMinutes(base, ctx.paces)} → ${estimateMinutes(shorter, ctx.paces)} min, com menos repetições e aquecimento menor.`,
          "O estímulo continua o mesmo; só o volume cai para caber no seu tempo.");
      }
      const sibling = (MEMBERS[family] ?? []).find(k => k !== kind && allowed(k));
      if (sibling) {
        const alt = qualitySession(base, ctx, sibling, 0.6);
        push(`shorter-${sibling}`, alt, `Mantém ${FAMILY_LABEL[family]}.`,
          `Outro formato do mesmo estímulo (${alt.label}), em ${km(alt.distance_km)}.`,
          sibling === "intervals_dense" ? "Menos trote entre os tiros: rende mais estímulo por minuto." : "Formato mais compacto do mesmo tipo de trabalho.");
      }
    } else if (kind === "long_run") {
      const shorter = compose(base, buildLongRun({ ...ctx, phase: ctx.phase ?? "base" }, round05(Math.max(5, (base.distance_km ?? 10) * 0.75))));
      push("shorter", shorter, "Mantém resistência, com menos tempo em pé.",
        `Longão menor: ${km(base.distance_km)} → ${km(shorter.distance_km)}.`,
        "Melhor um longão mais curto do que perder o longão da semana.");
    } else {
      const shorter = compose(base, buildEasyRun(ctx, Math.max(3, round05((base.distance_km ?? 5) * 0.6))));
      push("shorter", shorter, "Mantém a base aeróbica leve.",
        `Rodagem menor: ${km(base.distance_km)} → ${km(shorter.distance_km)}.`,
        "Um leve curto ainda soma volume sem custo de recuperação.");
    }
  } else if (reason === "place" || reason === "equipment") {
    const noGps = reason === "equipment";
    if (kind === "hills" && !noGps) {
      if (allowed("repetitions")) {
        push("repetitions", qualitySession(base, ctx, "repetitions"), "Mantém esforços curtos e intensos (parte do estímulo de força).",
          "No plano, sem inclinação: menos força específica, mais velocidade de pernas.",
          "É o que mais se aproxima de uma subida curta quando não há ladeira.");
      }
      if (allowed("fartlek")) {
        push("fartlek", qualitySession(base, ctx, "fartlek"), "Mantém um treino de qualidade.",
          "Vira trabalho de limiar com trocas de ritmo, em qualquer percurso.",
          "Não depende de terreno nem de pista.");
      }
    } else if (kind === "fartlek" || kind === "strides") {
      return { options: [], limitation: "Esta sessão já é guiada por tempo e funciona em qualquer percurso — não precisa de adaptação por local ou GPS." };
    } else {
      const timed = toTimeBased(base, ctx.paces);
      push("time-based", timed, `Mantém ${FAMILY_LABEL[family]}.`,
        "Por tempo em vez de distância.",
        noGps ? "Sem GPS, o tempo e o esforço guiam cada bloco." : "Funciona em qualquer percurso, sem precisar medir distância.");
      if (isQuality && allowed("fartlek") && family !== "aerobic") {
        push("fartlek", qualitySession(base, ctx, "fartlek"),
          family === "threshold" ? `Mantém ${FAMILY_LABEL.threshold}.` : "Mantém um treino de qualidade.",
          "Trocas de ritmo por tempo, sem parar.",
          "Não depende de terreno, pista nem distância medida.");
      }
    }
  } else {
    if (!isQuality) {
      const timed = toTimeBased(base, ctx.paces);
      push("time-based", timed, family === "endurance" ? "Mantém resistência." : "Mantém a base aeróbica leve.",
        "Por tempo em vez de distância.", "Muda a forma de guiar, não o objetivo.");
      return {
        options: out,
        limitation: family === "endurance"
          ? "Longão não tem outro formato que preserve o objetivo; dá para guiá-lo por tempo."
          : "Rodagem leve não tem outro formato que preserve o objetivo; dá para guiá-la por tempo.",
      };
    }
    const same = (MEMBERS[family] ?? []).filter(k => k !== kind && allowed(k));
    const near = (NEIGHBORS[family] ?? []).flatMap(f => MEMBERS[f] ?? []).filter(allowed);
    for (const k of same) {
      push(k, qualitySession(base, ctx, k), `Mantém ${FAMILY_LABEL[family]}.`,
        `Outro formato do mesmo estímulo.`, "Troca a forma, não o objetivo.");
    }
    for (const k of near) {
      if (out.length >= 3) break;
      const f = familyOf(k);
      push(k, qualitySession(base, ctx, k), "Mantém um treino de qualidade, mas desloca o foco.",
        `De ${FAMILY_LABEL[family]} para ${FAMILY_LABEL[f]}.`, "É o estímulo mais próximo que muda o formato.");
    }
  }

  return out.length > 0
    ? { options: out.slice(0, 3) }
    : { options: [], limitation: "Não há uma alternativa que preserve o objetivo desta sessão para essa restrição. Se preferir, descreva o que pretende fazer e o treinador avalia." };
}

// ─── The athlete's own proposal ─────────────────────────────────────────────

export interface ParsedSession {
  kind: SessionKind | null;
  reps?: number;
  repKm?: number;
  repMin?: number;
  recoveryMin?: number;
  warmupKm?: number;
  cooldownKm?: number;
  continuousKm?: number;
  continuousMin?: number;
  intensity?: Intensity;
  /** What must be asked before the session can be judged. */
  missing: string[];
}

const num = (s: string) => Number(s.replace(",", "."));

/**
 * Reads the way runners write sessions: "8x400m", "8 × 400 m com 2 min de
 * trote", "6x1km", "5x1000", "6x3min", "20 min em limiar", "10 km leve",
 * "2 km de aquecimento". Anything it cannot read becomes a question, not a guess.
 */
export function parseProposal(text: string): ParsedSession {
  let t = ` ${text.toLowerCase().replace(/×/g, "x").replace(/\s+/g, " ")} `;
  const out: ParsedSession = { kind: null, missing: [] };

  const takeKm = (value: string, unit?: string) => {
    const n = num(value);
    if (unit === "km" || unit === "k") return n;
    if (unit === "m") return n / 1000;
    return undefined;
  };

  // Cool-down first: "desaquecimento" contains "aquec".
  const cool = t.match(/(\d+(?:[.,]\d+)?)\s*(km|k|m)\s*(?:de\s*)?desaquec\w*/) ?? t.match(/desaquec\w*\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(km|k|m)/);
  if (cool) { out.cooldownKm = takeKm(cool[1], cool[2]); t = t.replace(cool[0], " "); }
  const warm = t.match(/(\d+(?:[.,]\d+)?)\s*(km|k|m)\s*(?:de\s*)?aquec\w*/) ?? t.match(/aquec\w*\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(km|k|m)/);
  if (warm) { out.warmupKm = takeKm(warm[1], warm[2]); t = t.replace(warm[0], " "); }

  // Units longest-first: "min" must not be read as "m", nor "seg" as "s".
  const recovery = t.match(/(\d+(?:[.,]\d+)?)\s*(minutos?|min|segundos?|seg|s|")\s*(?:de\s*)?(?:trote|rec\w*|pausa|descanso|intervalo)/)
    ?? t.match(/(?:trote|rec\w*|pausa|descanso|intervalo)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(minutos?|min|segundos?|seg|s|")/);
  if (recovery) {
    const n = num(recovery[1]);
    out.recoveryMin = /^(s|seg|segundos?|")$/.test(recovery[2]) ? n / 60 : n;
    t = t.replace(recovery[0], " ");
  }

  if (/subida|ladeira/.test(t)) out.kind = "hills";
  if (/fartlek/.test(t)) out.kind = "fartlek";
  const word: Intensity | undefined = /limiar|tempo run|\btempo\b/.test(t) ? "T"
    : /velocidade|repeti|sprint|r[aá]pido/.test(t) ? "R"
      : /forte|tiro|vo2/.test(t) ? "I"
        : /leve|f[aá]cil|rodagem|regenerativ/.test(t) ? "E" : undefined;

  const reps = t.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(minutos?|min|segundos?|seg|km|k|m|s|")?(?![a-z])/);
  if (reps) {
    out.reps = Number(reps[1]);
    const value = num(reps[2]);
    const unit = reps[3];
    if (unit === "km" || unit === "k") out.repKm = value;
    else if (unit === "m" || (!unit && value >= 100)) out.repKm = value / 1000;
    else if (unit && /^min/.test(unit)) out.repMin = value;
    else if (unit && /^(s|seg|segundos?|")$/.test(unit)) out.repMin = value / 60;
    else out.missing.push("a unidade de cada repetição (metros, km, minutos ou segundos)");

    if (!out.kind) {
      if (word === "T") out.kind = "threshold";
      else if (word === "R") out.kind = "repetitions";
      else if (out.repKm != null) out.kind = out.repKm <= 0.3 ? "repetitions" : out.repKm <= 1.2 ? "intervals" : "threshold";
      else if (out.repMin != null) out.kind = out.repMin <= 1 ? "repetitions" : out.repMin <= 5 ? "intervals" : "threshold";
    }
    out.intensity = out.kind === "threshold" || out.kind === "fartlek" ? "T" : out.kind === "repetitions" ? "R" : "I";
    return out;
  }

  const continuous = t.match(/(\d+(?:[.,]\d+)?)\s*(km|k|min|minutos?)\b/);
  if (continuous) {
    const value = num(continuous[1]);
    if (/^min/.test(continuous[2])) out.continuousMin = value; else out.continuousKm = value;
    if (!word) {
      out.missing.push("a intensidade (leve, limiar ou forte)");
      return out;
    }
    out.intensity = word;
    out.kind = word === "T" ? "threshold" : word === "E" ? "easy" : word === "R" ? "repetitions" : "intervals";
    return out;
  }

  out.missing.push("o formato do treino (por exemplo: 8 × 400 m, 20 min em limiar ou 10 km leve)");
  return out;
}

const DEFAULT_RECOVERY_MIN: Partial<Record<SessionKind, number>> = {
  repetitions: 2, hills: 2, intervals: 2, intervals_dense: 1, threshold: 1, fartlek: 2,
};
const MIN_REPS: Partial<Record<SessionKind, number>> = { repetitions: 6, hills: 6, intervals: 3, intervals_dense: 3, threshold: 2, fartlek: 4 };

function repLabel(p: ParsedSession): string {
  if (p.repKm != null) return p.repKm >= 1 ? `${String(p.repKm).replace(".", ",")} km` : `${Math.round(p.repKm * 1000)} m`;
  if (p.repMin != null) return p.repMin < 1 ? `${Math.round(p.repMin * 60)} s` : `${String(p.repMin).replace(".", ",")} min`;
  return "";
}

/** A plan day from a parsed proposal, filling only what is safe to assume — and saying what was. */
export function buildFromParsed(
  parsed: ParsedSession, planned: WeeklyPlanDay, ctx: AdaptContext, repsOverride?: number,
): { day: WeeklyPlanDay; assumptions: string[] } | null {
  if (!parsed.kind || parsed.missing.length > 0) return null;
  const assumptions: string[] = [];
  const paces = ctx.paces;
  const intensity = parsed.intensity ?? "E";
  const hr = hrFor(intensity, ctx.lthr);
  const hrE = hrFor("E", ctx.lthr);
  const easy = paceRange(paces, "easy");
  const main = paceRange(paces, PACE_NAME[intensity]);
  const plannedWarm = planned.structure?.blocks.find(b => !isRepeatBlock(b) && b.kind === "warmup") as WorkoutStep | undefined;
  const plannedCool = [...(planned.structure?.blocks ?? [])].reverse().find(b => !isRepeatBlock(b) && b.kind === "cooldown") as WorkoutStep | undefined;
  const isQuality = parsed.kind !== "easy" && parsed.kind !== "long_run" && parsed.kind !== "recovery";

  const warmupKm = parsed.warmupKm ?? (isQuality ? plannedWarm?.distance_km ?? Math.max(1.5, round05(ctx.weeklyKm * 0.06)) : undefined);
  const cooldownKm = parsed.cooldownKm ?? (isQuality ? plannedCool?.distance_km ?? Math.max(1, round05(ctx.weeklyKm * 0.04)) : undefined);
  if (isQuality && parsed.warmupKm == null) assumptions.push(`aquecimento de ${km(warmupKm)}`);
  if (isQuality && parsed.cooldownKm == null) assumptions.push(`desaquecimento de ${km(cooldownKm)}`);

  const blocks: WorkoutBlock[] = [];
  if (warmupKm) blocks.push({ kind: "warmup", distance_km: warmupKm, pace: easy, hr: hrE, intensity: "E" });

  let label: string;
  let workKm = 0;
  let type: WeeklyPlanDay["type"];
  if (parsed.reps != null) {
    const reps = repsOverride ?? parsed.reps;
    const recoveryMin = parsed.recoveryMin ?? DEFAULT_RECOVERY_MIN[parsed.kind] ?? 2;
    if (parsed.recoveryMin == null) assumptions.push(`${String(recoveryMin).replace(".", ",")} min de trote entre as repetições`);
    const step: WorkoutStep = parsed.repKm != null
      ? { kind: "run", distance_km: parsed.repKm, pace: main, hr, intensity }
      : { kind: "run", duration_min: parsed.repMin, pace: main, hr, intensity };
    blocks.push({ repeat: reps, steps: [step, { kind: "recovery", duration_min: recoveryMin, pace: paceRange(paces, "recovery") ?? easy, hr: hrE, intensity: "E" }] });
    if (cooldownKm) blocks.push({ kind: "cooldown", distance_km: cooldownKm, pace: easy, hr: hrE, intensity: "E" });
    const repKm = parsed.repKm ?? ((parsed.repMin ?? 0) * 60) / paceSec(paces, intensity);
    workKm = reps * repKm;
    const recoveryKmTotal = reps * ((recoveryMin * 60) / paceSec(paces, "E"));
    label = `${reps}×${repLabel(parsed)}${parsed.kind === "hills" ? " em subida" : ""}`;
    type = intensity === "T" ? "tempo" : "intervals";
    const total = (warmupKm ?? 0) + workKm + recoveryKmTotal + (cooldownKm ?? 0);
    const day = finish(planned, { type, label, distance_km: round05(total), pace: main, blocks, kind: parsed.kind, paces });
    return { day, assumptions };
  }

  const contKm = parsed.continuousKm ?? ((parsed.continuousMin ?? 0) * 60) / paceSec(paces, intensity);
  blocks.push(parsed.continuousKm != null
    ? { kind: "run", distance_km: parsed.continuousKm, pace: main, hr, intensity }
    : { kind: "run", duration_min: parsed.continuousMin, pace: main, hr, intensity });
  workKm = contKm;
  const longish = planned.type === "long_run" || contKm >= Math.max(10, ctx.weeklyKm * 0.26);
  type = parsed.kind === "easy" ? (longish ? "long_run" : "easy") : intensity === "T" ? "tempo" : "intervals";
  label = parsed.continuousKm != null
    ? `${km(parsed.continuousKm)} ${intensity === "E" ? "leve" : intensity === "T" ? "em limiar" : "forte"}`
    : `${String(parsed.continuousMin).replace(".", ",")} min ${intensity === "E" ? "leve" : intensity === "T" ? "em limiar" : "forte"}`;
  if (cooldownKm) blocks.push({ kind: "cooldown", distance_km: cooldownKm, pace: easy, hr: hrE, intensity: "E" });
  const total = (warmupKm ?? 0) + contKm + (cooldownKm ?? 0);
  const kind = parsed.kind === "easy" && longish ? "long_run" : parsed.kind;
  return { day: finish(planned, { type, label, distance_km: round05(total), pace: main, blocks, kind, paces }), assumptions };
}

function finish(planned: WeeklyPlanDay, s: {
  type: WeeklyPlanDay["type"]; label: string; distance_km: number; pace?: string;
  blocks: WorkoutBlock[]; kind: SessionKind; paces: TrainingPace[] | null;
}): WeeklyPlanDay {
  const blocks = s.blocks;
  const quality = MEMBERS[familyOf(s.kind)] && s.kind !== "strides" ? s.kind as QualityKind : undefined;
  const day: WeeklyPlanDay = {
    day: planned.day,
    dayPt: planned.dayPt,
    sport: planned.sport ?? "corrida",
    type: s.type,
    label: s.label,
    distance_km: s.distance_km,
    pace: s.pace,
    description: `Sua proposta: ${s.label}.${strengthTail(planned)}`,
    structure: { blocks },
    ...(quality ? { quality } : {}),
    ...(planned.strength ? { strength: planned.strength } : {}),
  };
  return { ...day, duration_min: estimateMinutes(day, s.paces) };
}

export type Verdict = "equivalent" | "partial" | "different";

export const VERDICT_LABEL: Record<Verdict, string> = {
  equivalent: "Mantém o objetivo",
  partial: "Mantém parte do objetivo",
  different: "Muda o objetivo",
};

export interface ProposalEvaluation {
  understood: boolean;
  missing: string[];
  summary: string;
  day?: WeeklyPlanDay;
  assumptions: string[];
  verdict?: Verdict;
  preserves?: string;
  changes?: string;
  message?: string;
  /** The coach's suggested correction, when the proposal is sound but too big for the week. */
  adjusted?: { day: WeeklyPlanDay; why: string };
}

export interface SessionWork {
  /** Kilometres at threshold, interval or repetition intensity. */
  workKm: number;
  reps: number | null;
  /** Average jog between repetitions, in minutes. */
  recoveryMinPerRep: number | null;
}

const HARD_INTENSITY: Intensity[] = ["T", "I", "R"];

/**
 * How much hard work a session actually contains, and how much rest between it.
 *
 * Belonging to the same family is not enough to call two sessions equivalent:
 * 3 × 400 m and 10 × 400 m are both VO₂máx work and are not the same session,
 * and the same reps with half the jog is a harder session than the one written.
 */
export function sessionWork(day: WeeklyPlanDay, paces: TrainingPace[] | null): SessionWork {
  if (!day.structure) return { workKm: 0, reps: null, recoveryMinPerRep: null };
  let workKm = 0;
  let reps: number | null = null;
  let recoveryMin = 0;
  let recoveryCount = 0;
  const asKm = (step: WorkoutStep) => step.distance_km
    ?? ((step.duration_min ?? 0) * 60) / paceSec(paces, step.intensity ?? "E");
  for (const block of day.structure.blocks) {
    if (isRepeatBlock(block)) {
      reps = (reps ?? 0) + block.repeat;
      for (const step of block.steps) {
        if (step.kind === "recovery") {
          const minutes = step.duration_min ?? ((step.distance_km ?? 0) * paceSec(paces, "E")) / 60;
          recoveryMin += minutes * block.repeat;
          recoveryCount += block.repeat;
        } else if (HARD_INTENSITY.includes(step.intensity ?? "E")) {
          workKm += asKm(step) * block.repeat;
        }
      }
    } else if (HARD_INTENSITY.includes(block.intensity ?? "E")) {
      workKm += asKm(block);
    }
  }
  return {
    workKm: Math.round(workKm * 100) / 100,
    reps,
    recoveryMinPerRep: recoveryCount > 0 ? Math.round((recoveryMin / recoveryCount) * 100) / 100 : null,
  };
}

const fmtKm = (n: number) => `${Number(n.toFixed(1)).toString().replace(".", ",")} km`;
const fmtMin = (n: number) => n < 1
  ? `${Math.round(n * 60)} s`
  : `${Number(n.toFixed(1)).toString().replace(".", ",")} min`;

/** How far the dose may drift before the same stimulus stops being the same session. */
const DOSE_LOW = 0.6;
const DOSE_HIGH = 1.6;
/** Half the jog is a harder session; half again is an easier one. Both are worth saying. */
const RECOVERY_LOW = 0.6;
const RECOVERY_HIGH = 1.5;

/**
 * Does another session keep the purpose of the planned one?
 *
 * Same family keeps it; a neighbouring family keeps part of it; anything else
 * changes it. When the work volume of both is known, family is not the last
 * word: the same stimulus at half or double the hard kilometres is a different
 * session, and says so.
 *
 * Shared by the adaptation before a run and by the check-in after one, so the
 * coach judges a swap the same way on both sides of the session.
 */
export function compareSessions(
  planned: WeeklyPlanDay, kind: SessionKind, label: string,
  work?: { planned: SessionWork; proposal: SessionWork },
): {
  verdict: Verdict; preserves: string; changes: string; message: string;
} {
  const base = planned.adaptation?.original ?? planned;
  const plannedKind = sessionKindOf(base);
  const pf = plannedKind ? familyOf(plannedKind) : "aerobic";
  const qf = familyOf(kind);
  const sameFamily = pf === qf;
  let verdict: Verdict = sameFamily ? "equivalent" : (NEIGHBORS[pf] ?? []).includes(qf) ? "partial" : "different";

  // Same stimulus in a very different dose is not the same session: 3 × 400 m
  // and 10 × 400 m are both VO₂máx and only one of them is the training week.
  const plannedKm = work?.planned.workKm ?? 0;
  const proposalKm = work?.proposal.workKm ?? 0;
  const ratio = plannedKm > 0.3 && proposalKm > 0.3 ? proposalKm / plannedKm : null;
  const bigger = ratio != null && ratio > 1;
  const dose = ratio != null && (ratio < DOSE_LOW || ratio > DOSE_HIGH)
    ? `Volume forte: ${fmtKm(plannedKm)} previstos contra ${fmtKm(proposalKm)} — ${bigger ? "bem mais" : "bem menos"} trabalho.`
    : null;
  if (dose && verdict === "equivalent") verdict = "partial";

  const plannedRec = work?.planned.recoveryMinPerRep ?? null;
  const proposalRec = work?.proposal.recoveryMinPerRep ?? null;
  const recRatio = plannedRec != null && proposalRec != null && plannedRec > 0 ? proposalRec / plannedRec : null;
  const recovery = recRatio != null && plannedRec != null && proposalRec != null
    && (recRatio <= RECOVERY_LOW || recRatio >= RECOVERY_HIGH)
    ? `Recuperação entre repetições: ${fmtMin(plannedRec)} previstos contra ${fmtMin(proposalRec)} — ${proposalRec < plannedRec ? "menos" : "mais"} pausa muda o esforço.`
    : null;

  const changes = [
    sameFamily ? `Estrutura diferente: ${base.label} → ${label}.` : `De ${FAMILY_LABEL[pf]} para ${FAMILY_LABEL[qf]}.`,
    dose, recovery,
  ].filter(Boolean).join(" ");

  return {
    verdict,
    preserves: sameFamily ? `Mantém ${FAMILY_LABEL[pf]}.`
      : verdict === "partial" ? "Mantém um treino de qualidade, mas desloca o foco."
        : "Nada do estímulo original — é outro tipo de treino.",
    changes,
    message: sameFamily
      ? (dose
        ? (bigger
          ? "Mesmo estímulo, dose bem maior: o objetivo se mantém, mas o treino fica mais duro do que o previsto."
          : "Mesmo estímulo em dose bem menor: serve como sessão, mas não entrega o treino desta semana.")
        : "Boa troca: mantém o objetivo da sessão.")
      : verdict === "partial" ? "Serve, mas muda parte do objetivo desta sessão."
        : pf === "aerobic" || pf === "endurance"
          ? "Não é um substituto equivalente: trocaria um dia leve por um treino forte. Você pode usar mesmo assim, mas a carga da semana muda."
          : "Não é um substituto equivalente: o estímulo da semana muda. Você pode usar mesmo assim.",
  };
}

/** A short, unit-aware name for a parsed session: "8×400 m", "20 min em limiar". */
export function parsedLabel(parsed: ParsedSession): string | null {
  if (!parsed.kind || parsed.missing.length > 0) return null;
  const where = parsed.kind === "hills" ? " em subida" : "";
  if (parsed.reps != null) return `${parsed.reps}×${repLabel(parsed)}${where}`;
  const what = parsed.intensity === "E" ? "leve" : parsed.intensity === "T" ? "em limiar" : "forte";
  if (parsed.continuousKm != null) return `${String(parsed.continuousKm).replace(".", ",")} km ${what}`;
  if (parsed.continuousMin != null) return `${String(parsed.continuousMin).replace(".", ",")} min ${what}`;
  return null;
}

/** Work volume ceilings, as the engine itself applies them (Daniels). */
function workCap(family: Family, weeklyKm: number): number | null {
  if (family === "vo2" || family === "power") return Math.min(weeklyKm * 0.08, 10);
  if (family === "speed") return Math.min(weeklyKm * 0.05, 8);
  if (family === "threshold") return weeklyKm * 0.10;
  return null;
}

export function evaluateProposal(text: string, planned: WeeklyPlanDay, ctx: AdaptContext): ProposalEvaluation {
  const parsed = parseProposal(text);
  if (!parsed.kind || parsed.missing.length > 0) {
    return { understood: false, missing: parsed.missing, summary: "", assumptions: [] };
  }
  const built = buildFromParsed(parsed, planned, ctx);
  if (!built) return { understood: false, missing: ["o formato do treino"], summary: "", assumptions: [] };
  const day = built.day;

  const proposalWork = sessionWork(day, ctx.paces);
  const { verdict, preserves, changes, message } = compareSessions(planned, parsed.kind, day.label, {
    planned: sessionWork(planned.adaptation?.original ?? planned, ctx.paces),
    // The jog between repetitions only counts when the athlete said what it is.
    // Comparing the plan against our own default would be arguing with an
    // assumption we just made on their behalf.
    proposal: parsed.recoveryMin == null ? { ...proposalWork, recoveryMinPerRep: null } : proposalWork,
  });
  const qf = familyOf(parsed.kind);

  const result: ProposalEvaluation = {
    understood: true, missing: [], summary: day.label, day,
    assumptions: built.assumptions, verdict, preserves, changes, message,
  };

  // Sound idea, too much of it: the coach proposes the same session within the
  // ceilings the plan itself respects.
  const cap = workCap(qf, ctx.weeklyKm);
  if (parsed.reps != null && cap != null) {
    const perRep = parsed.repKm ?? ((parsed.repMin ?? 0) * 60) / paceSec(ctx.paces, parsed.intensity ?? "I");
    const work = parsed.reps * perRep;
    if (perRep > 0 && work > cap * 1.15) {
      const reps = Math.max(MIN_REPS[parsed.kind] ?? 3, Math.floor(cap / perRep));
      if (reps < parsed.reps) {
        const smaller = buildFromParsed(parsed, planned, ctx, reps);
        if (smaller) {
          result.adjusted = {
            day: smaller.day,
            why: `${parsed.reps} × ${repLabel(parsed)} somam ${km(work)} de trabalho forte. Com ${km(ctx.weeklyKm)} na semana, o teto recomendado é ${km(cap)}. Sugestão: ${reps} × ${repLabel(parsed)}.`,
          };
        }
      }
    }
  }
  return result;
}

// ─── Recording the decision on the plan ─────────────────────────────────────

export interface SessionAdaptation {
  /** Decided before the session, or declared afterwards in the check-in. */
  when: "before" | "after";
  at: string;
  reason: AdaptReason | null;
  source: "option" | "custom" | "other_workout";
  text?: string | null;
  preserves: string;
  changes: string;
  verdict?: Verdict;
  /**
   * Declared after the session: what was actually done, kept *beside* the
   * prescription and never written over it. The day goes on saying what was
   * asked for; these two say what happened.
   */
  doneLabel?: string | null;
  doneKm?: number | null;
  runId?: string;
  /** The prescription as it was, kept for history. */
  original: WeeklyPlanDay;
}

const DAY_ORDER: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Record, after the fact, that the session was not the one prescribed.
 *
 * Planned, agreed and executed are three different things, and only the first
 * two belong in the plan. What was planned stays on the day; what was done is
 * written beside it. Writing the executed distance over `distance_km` — as this
 * did at first — rewrites the prescription after the fact: the week's volume,
 * the ratchet that carries it into next week and the adherence all read that
 * field, so a substitution recorded there would make the plan look like
 * whatever happened and count as the plan followed.
 */
export function recordExecuted(
  plan: WeeklyPlanData,
  dayKey: WeeklyPlanDay["day"],
  input: {
    execution: "adapted" | "other";
    label?: string | null;
    text?: string | null;
    km: number;
    runId?: string;
    compared?: { preserves: string; changes: string; verdict?: Verdict } | null;
  },
  now: Date = new Date(),
): { plan: WeeklyPlanData } | { error: string } {
  const current = plan.days?.find(d => d.day === dayKey);
  if (!current) return { error: "Não há sessão neste dia." };
  // What was agreed before the run already describes the session.
  if (current.adaptation?.when === "before") return { error: "Este treino já foi adaptado antes da sessão." };
  const base = current.adaptation?.original ?? current;
  const label = input.label?.trim() || null;
  return applyAdaptation(plan, dayKey, base, {
    when: "after",
    reason: null,
    source: input.execution === "other" ? "other_workout" : "custom",
    text: input.text?.trim() || null,
    preserves: input.compared?.preserves ?? "",
    changes: input.compared?.changes ?? "",
    verdict: input.compared?.verdict,
    doneLabel: input.execution === "other"
      ? `Outro treino${label ? `: ${label}` : ""}`
      : `Adaptado${label ? `: ${label}` : ""}`,
    doneKm: Math.round(Number(input.km || 0) * 10) / 10,
    ...(input.runId ? { runId: input.runId } : {}),
  }, now);
}

export function applyAdaptation(
  plan: WeeklyPlanData,
  dayKey: WeeklyPlanDay["day"],
  adapted: WeeklyPlanDay,
  meta: Omit<SessionAdaptation, "original" | "at">,
  now: Date = new Date(),
): { plan: WeeklyPlanData } | { error: string } {
  if (!DAY_ORDER.includes(dayKey)) return { error: "Dia inválido." };
  const current = plan.days.find(d => d.day === dayKey);
  if (!current) return { error: "Não há sessão neste dia." };
  if (current.swap) return { error: "Este treino já foi trocado pela recuperação. Desfaça a troca antes de adaptar." };
  if (meta.when === "before" && !isAdaptable(current.adaptation?.original ?? current)) {
    return { error: "Só corridas do plano podem ser adaptadas." };
  }
  // Adapting twice keeps the true original, not the first adaptation.
  const original = current.adaptation?.original ?? current;
  const day: WeeklyPlanDay = {
    ...adapted,
    day: current.day,
    dayPt: current.dayPt,
    adaptation: { ...meta, at: now.toISOString(), original },
  };
  return { plan: { ...plan, days: plan.days.map(d => d.day === dayKey ? day : d) } };
}

export function undoAdaptation(plan: WeeklyPlanData, dayKey: WeeklyPlanDay["day"]): { plan: WeeklyPlanData } | { error: string } {
  const current = plan.days.find(d => d.day === dayKey);
  if (!current?.adaptation) return { error: "Este treino não foi adaptado." };
  // The session goes back to the slot it is in now: a week reorganised around the
  // athlete's agenda may have moved it since it was adapted.
  const restored = { ...current.adaptation.original, day: current.day, dayPt: current.dayPt };
  return { plan: { ...plan, days: plan.days.map(d => d.day === dayKey ? restored : d) } };
}

// ─── After the session: was it the planned one? ─────────────────────────────

/**
 * A difference big enough that the coach should ask what was done before
 * judging it. Most runs never trigger this: only a distance far from the plan,
 * or an "easy" run clearly run as a workout.
 */
export function executionDiffers(
  planned: WeeklyPlanDay | null,
  run: { distance_km: number; avg_pace_seconds_per_km: number | null },
  paces: TrainingPace[] | null = null,
): boolean {
  if (!planned || planned.adaptation) return false;
  const target = planned.distance_km ?? 0;
  if (target > 0) {
    const ratio = run.distance_km / target;
    if (ratio < 0.75 || ratio > 1.3) return true;
  }
  if ((planned.type === "easy" || planned.type === "recovery" || planned.type === "long_run") && run.avg_pace_seconds_per_km) {
    const easyFast = paces?.find(p => p.name === "easy")?.pace_max_sec ?? null;
    if (easyFast && run.avg_pace_seconds_per_km < easyFast - 30) return true;
  }
  return false;
}
