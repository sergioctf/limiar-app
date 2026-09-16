/**
 * Strength training preferences.
 *
 * The athlete configures first — days, muscles, equipment, what they enjoy —
 * and the generator builds from that. The AI only reviews the result and
 * proposes changes the athlete can accept or ignore, the same contract the
 * running plan already uses.
 */
import type { DayKey } from "@/types";
import { exerciseById, type MuscleGroup, type Equipment } from "@/lib/exercises";

export type StrengthGoal = "hipertrofia" | "suporte" | "forca" | "saude";
export type Experience   = "iniciante" | "intermediario" | "avancado";
export type CardioMachine = "esteira" | "escada" | "bike" | "nenhum";
export type StylePreference = "barra" | "halter" | "maquina" | "misto";

export interface CardioAddon {
  machine:  CardioMachine;
  minutes:  number;
  position: "antes" | "depois";
  /** How hard — the builder may lower it to protect the lifting or the legs. */
  intensity?: "recuperacao" | "aerobico" | "tempo" | "intervalado";
}

export interface StrengthDayPlan {
  day:     DayKey;
  muscles: MuscleGroup[];
  cardio?: CardioAddon | null;
  /**
   * The exercises this day actually uses, in order.
   *
   * When the athlete edits a session while logging it — swapping a machine that
   * was occupied, adding the movement they actually did — the result is stored
   * here and the generator uses it from then on. Absent means "choose for me",
   * which is how every day starts.
   *
   * This is what makes the plan converge on the athlete's real gym instead of
   * re-proposing the same substitution every week.
   */
  exercises?: string[];
}

export interface StrengthPrefs {
  goal:        StrengthGoal;
  experience:  Experience;
  equipment:   Equipment[];
  /** How long the athlete wants a session to last, in minutes. */
  sessionMinutes: number;
  style:       StylePreference;
  days:        StrengthDayPlan[];
  favorites:   string[];   // exercise ids to prioritise
  avoid:       string[];   // exercise ids to exclude (injury, dislike)
  limitations: string;     // free text — injuries, restrictions
}

export const GOAL_LABEL: Record<StrengthGoal, { label: string; hint: string }> = {
  hipertrofia: {
    label: "Hipertrofia + corrida",
    hint:  "Ganhar massa mantendo o desempenho na corrida. Mais volume e séries isoladas.",
  },
  suporte: {
    label: "Suporte à corrida",
    hint:  "Economia de corrida e prevenção de lesão. Sessões curtas e cargas altas.",
  },
  forca: {
    label: "Força máxima",
    hint:  "Levantar mais peso. Cargas altas, poucas repetições, descansos longos.",
  },
  saude: {
    label: "Saúde geral",
    hint:  "Consistência e qualidade de movimento, sem foco competitivo.",
  },
};

export const EXPERIENCE_LABEL: Record<Experience, { label: string; hint: string }> = {
  iniciante:     { label: "Iniciante",     hint: "Menos de 6 meses treinando" },
  intermediario: { label: "Intermediário", hint: "6 meses a 2 anos, conhece os movimentos" },
  avancado:      { label: "Avançado",      hint: "Mais de 2 anos treinando consistente" },
};

/**
 * Volume and rep targets per goal — see TRAINING_SCIENCE.md §8.
 * Hypertrophy needs volume; running support needs load, not volume.
 */
export const GOAL_PARAMS: Record<StrengthGoal, {
  setsPerMuscleWeek: [number, number];
  mainReps:  [number, number];
  accessoryReps: [number, number];
  restSeconds: number;
  /** When strength and running collide, which one gives way. */
  priority: "forca" | "corrida";
}> = {
  hipertrofia: { setsPerMuscleWeek: [12, 20], mainReps: [6, 10],  accessoryReps: [10, 15], restSeconds: 90,  priority: "forca" },
  suporte:     { setsPerMuscleWeek: [6, 10],  mainReps: [3, 6],   accessoryReps: [8, 12],  restSeconds: 150, priority: "corrida" },
  forca:       { setsPerMuscleWeek: [10, 16], mainReps: [3, 5],   accessoryReps: [6, 10],  restSeconds: 180, priority: "forca" },
  saude:       { setsPerMuscleWeek: [8, 12],  mainReps: [8, 12],  accessoryReps: [10, 15], restSeconds: 75,  priority: "corrida" },
};

const DAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ALL_MUSCLES: MuscleGroup[] = [
  "peito", "costas", "ombro", "biceps", "triceps",
  "quadriceps", "posterior", "gluteo", "panturrilha", "core",
];

const ALL_EQUIPMENT: Equipment[] = ["academia", "halteres", "elasticos", "peso_corporal"];

export const DEFAULT_STRENGTH_PREFS: StrengthPrefs = {
  goal: "suporte",
  experience: "intermediario",
  equipment: ["academia"],
  sessionMinutes: 60,
  style: "misto",
  days: [],
  favorites: [],
  avoid: [],
  limitations: "",
};

/** Ready-made splits offered as a starting point. */
export const SPLIT_TEMPLATES: Array<{
  id: string; label: string; hint: string;
  build: (days: DayKey[]) => StrengthDayPlan[];
}> = [
  {
    id: "full_body",
    label: "Full body",
    hint: "Corpo todo em cada sessão — melhor custo-benefício para 2-3 dias.",
    build: days => days.map(day => ({
      day, muscles: ["quadriceps", "posterior", "costas", "peito", "core"], cardio: null,
    })),
  },
  {
    id: "upper_lower",
    label: "Superior / Inferior",
    hint: "Alterna membros superiores e inferiores — ideal para 4 dias.",
    build: days => days.map((day, i) => ({
      day,
      muscles: i % 2 === 0
        ? ["quadriceps", "posterior", "gluteo", "panturrilha"]
        : ["peito", "costas", "ombro", "biceps", "triceps"],
      cardio: null,
    })),
  },
  {
    id: "ppl",
    label: "Push / Pull / Legs",
    hint: "Empurrar, puxar e pernas — para 3 ou 6 dias.",
    build: days => days.map((day, i) => ({
      day,
      muscles: i % 3 === 0 ? ["peito", "ombro", "triceps"]
        : i % 3 === 1 ? ["costas", "biceps"]
        : ["quadriceps", "posterior", "gluteo", "panturrilha"],
      cardio: null,
    })),
  },
];

function cleanList<T>(input: unknown, valid: T[]): T[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.filter((v): v is T => valid.includes(v as T))));
}

/** Fill in anything missing so the generator always receives a usable config. */
export function normalizeStrengthPrefs(raw: unknown): StrengthPrefs {
  const p = (raw ?? {}) as Partial<StrengthPrefs>;

  const minutes = Number(p.sessionMinutes);
  const equipment = cleanList<Equipment>(p.equipment, ALL_EQUIPMENT);

  const days: StrengthDayPlan[] = Array.isArray(p.days)
    ? p.days
        .filter(d => d && DAYS.includes(d.day))
        .map(d => ({
          day: d.day,
          muscles: cleanList<MuscleGroup>(d.muscles, ALL_MUSCLES),
          exercises: Array.isArray(d.exercises)
            ? Array.from(new Set(
                d.exercises.filter((v): v is string => typeof v === "string" && !!exerciseById(v)),
              )).slice(0, 15)
            : undefined,
          cardio: d.cardio && d.cardio.machine && d.cardio.machine !== "nenhum"
            ? ({
                machine:  d.cardio.machine,
                minutes:  Math.max(5, Math.min(60, Number(d.cardio.minutes) || 15)),
                position: d.cardio.position === "antes" ? "antes" : "depois",
                intensity: (["recuperacao", "aerobico", "tempo", "intervalado"] as const)
                  .includes(d.cardio.intensity as never)
                  ? d.cardio.intensity : "aerobico",
              } satisfies CardioAddon)
            : null,
        }))
        .filter(d => d.muscles.length > 0)
    : [];

  return {
    goal:       (["hipertrofia", "suporte", "forca", "saude"] as const).includes(p.goal as StrengthGoal)
                  ? p.goal as StrengthGoal : DEFAULT_STRENGTH_PREFS.goal,
    experience: (["iniciante", "intermediario", "avancado"] as const).includes(p.experience as Experience)
                  ? p.experience as Experience : DEFAULT_STRENGTH_PREFS.experience,
    equipment:  equipment.length > 0 ? equipment : DEFAULT_STRENGTH_PREFS.equipment,
    sessionMinutes: Number.isFinite(minutes) && minutes >= 20 && minutes <= 150
                  ? Math.round(minutes) : DEFAULT_STRENGTH_PREFS.sessionMinutes,
    style:      (["barra", "halter", "maquina", "misto"] as const).includes(p.style as StylePreference)
                  ? p.style as StylePreference : DEFAULT_STRENGTH_PREFS.style,
    days,
    favorites:  Array.isArray(p.favorites) ? p.favorites.filter(v => typeof v === "string").slice(0, 30) : [],
    avoid:      Array.isArray(p.avoid)     ? p.avoid.filter(v => typeof v === "string").slice(0, 30) : [],
    limitations: typeof p.limitations === "string" ? p.limitations.slice(0, 500) : "",
  };
}

const LOWER_BODY: MuscleGroup[] = ["quadriceps", "posterior", "gluteo", "panturrilha"];

/**
 * Reconcile the day chips in the training-preferences card with the detailed
 * per-day muscle configuration.
 *
 * These were two independent stores: the card wrote `training_prefs.strengthDays`
 * and the generator read `strength_prefs.days`. An athlete could tick five days
 * on screen, watch them light up, and receive four — the fifth silently became
 * a rest day. Now ticking a day creates a real entry for it, and unticking
 * removes it.
 *
 * A new day gets muscles that balance what is already configured; the point is
 * that the day exists and is trainable, and the athlete can refine it after.
 */
export function syncStrengthDays(prefs: StrengthPrefs, days: DayKey[]): StrengthPrefs {
  const wanted = new Set(days);
  const kept = prefs.days.filter(d => wanted.has(d.day));
  const added = days.filter(d => !prefs.days.some(x => x.day === d));

  if (added.length === 0 && kept.length === prefs.days.length) return prefs;

  const isLower = (d: StrengthDayPlan) => d.muscles.some(m => LOWER_BODY.includes(m));

  for (const day of added) {
    const i = DAYS.indexOf(day);
    const neighbour = (offset: number) =>
      kept.find(d => d.day === DAYS[(i + offset + 7) % 7]);

    // Two leg days back to back is the one arrangement worth avoiding by
    // default — it is also what lands legs the day before a long run.
    const nextToLegs = [neighbour(-1), neighbour(1)].some(d => d && isLower(d));
    const lower = kept.filter(isLower).length;

    const muscles: MuscleGroup[] = !nextToLegs && lower * 2 <= kept.length
      ? ["quadriceps", "posterior", "gluteo"]
      : ["peito", "costas", "ombro"];

    kept.push({ day, muscles, cardio: null });
    kept.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
  }

  kept.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
  return { ...prefs, days: kept };
}

/**
 * Advisory notes about a configuration. Never blocks — the athlete's choice
 * stands; these feed the "here's what could be better" suggestions.
 */
export function reviewStrengthPrefs(prefs: StrengthPrefs): string[] {
  const notes: string[] = [];
  if (prefs.days.length === 0) return ["Nenhum dia de musculação configurado."];

  // Frequency per muscle: twice a week beats once (TRAINING_SCIENCE §8.3).
  const count = new Map<MuscleGroup, number>();
  for (const d of prefs.days) for (const m of d.muscles) count.set(m, (count.get(m) ?? 0) + 1);

  const onceOnly: MuscleGroup[] = [];
  count.forEach((n, m) => { if (n === 1) onceOnly.push(m); });
  if (onceOnly.length > 0 && prefs.goal === "hipertrofia") {
    notes.push(
      `Treinado 1×/semana: ${onceOnly.join(", ")}. Duas vezes rende mais para hipertrofia.`,
    );
  }

  if (prefs.days.length >= 6) {
    notes.push("6+ dias de musculação junto com corrida acumula fadiga rápido — observe o sono e a disposição.");
  }

  const bigDays = prefs.days.filter(d => d.muscles.length >= 6);
  if (bigDays.length > 0) {
    notes.push("Alguns dias têm muitos grupos musculares — o estímulo por sessão tem teto (~15 séries úteis).");
  }

  return notes;
}
