/**
 * Curated exercise library.
 *
 * Hand-picked rather than model-generated: an AI inventing exercise names and
 * rep ranges produces plausible nonsense, and this is the data every session is
 * built from. Each entry carries what the generator needs to reason — muscles,
 * equipment, whether it's unilateral, and how much it matters for a runner.
 *
 * See TRAINING_SCIENCE.md §8 for the evidence behind the selection.
 */

import { CATALOG, CATALOG_IMAGE_BASE } from "@/lib/exercise-catalog";

export { CATALOG, CATALOG_IMAGE_BASE };

export type MuscleGroup =
  | "peito" | "costas" | "ombro" | "biceps" | "triceps"
  | "quadriceps" | "posterior" | "gluteo" | "panturrilha" | "core";

export type ExerciseCategory =
  | "composto"    // multi-joint, heavy — the backbone of a session
  | "unilateral"  // one leg/arm at a time — mirrors running
  | "isolado"     // single-joint accessory
  | "pliometrico" // jump work
  | "core";

export type Equipment = "academia" | "halteres" | "elasticos" | "peso_corporal";

export interface Exercise {
  id:         string;
  name:       string;
  primary:    MuscleGroup[];
  secondary:  MuscleGroup[];
  category:   ExerciseCategory;
  /** Minimum equipment needed. */
  equipment:  Equipment;
  unilateral: boolean;
  /** How much this earns its place for a runner (1 = optional, 5 = essential). */
  runnerValue: 1 | 2 | 3 | 4 | 5;
  /** Sensible rep range when nothing else dictates it. */
  reps:       [number, number];
  /** One practical execution cue — what actually goes wrong. */
  cue:        string;
  /**
   * Demonstration photo, relative to CATALOG_IMAGE_BASE. Optional because two
   * of the curated movements have no upstream equivalent, and a photo of the
   * wrong exercise is worse than no photo.
   */
  image?:     string;
}

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  peito: "Peito", costas: "Costas", ombro: "Ombro", biceps: "Bíceps", triceps: "Tríceps",
  quadriceps: "Quadríceps", posterior: "Posterior", gluteo: "Glúteo",
  panturrilha: "Panturrilha", core: "Core",
};

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  academia: "Academia completa",
  halteres: "Halteres em casa",
  elasticos: "Elásticos",
  peso_corporal: "Só peso corporal",
};

/** Equipment tiers — anything at or below the athlete's access is usable. */
/**
 * How much a setup contains, so "can I do this here?" is an index comparison.
 * A full gym covers everything below it; dumbbells do not conjure a cable.
 */
export const EQUIPMENT_RANK: Record<Equipment, number> = {
  peso_corporal: 0, elasticos: 1, halteres: 2, academia: 3,
};

export const EXERCISES: Exercise[] = [
  // ── Lower body: compound ───────────────────────────────────────────────────
  {
    id: "agachamento-livre", name: "Agachamento livre",
    image: "Barbell_Full_Squat/0.jpg",
    primary: ["quadriceps"], secondary: ["gluteo", "core"],
    category: "composto", equipment: "academia", unilateral: false,
    runnerValue: 5, reps: [4, 8],
    cue: "Joelho acompanha a ponta do pé; desça até a coxa passar da paralela sem soltar a lombar.",
  },
  {
    id: "levantamento-terra", name: "Levantamento terra",
    image: "Barbell_Deadlift/0.jpg",
    primary: ["posterior", "gluteo"], secondary: ["costas", "core"],
    category: "composto", equipment: "academia", unilateral: false,
    runnerValue: 5, reps: [3, 6],
    cue: "Barra rente à canela, lombar neutra. Empurre o chão em vez de puxar a barra.",
  },
  {
    id: "rdl", name: "Stiff / RDL",
    image: "Romanian_Deadlift/0.jpg",
    primary: ["posterior"], secondary: ["gluteo", "costas"],
    category: "composto", equipment: "halteres", unilateral: false,
    runnerValue: 5, reps: [6, 10],
    cue: "Quadril para trás, joelho quase fixo. Pare quando a lombar começar a arredondar.",
  },
  {
    id: "leg-press", name: "Leg press",
    image: "Leg_Press/0.jpg",
    primary: ["quadriceps"], secondary: ["gluteo"],
    category: "composto", equipment: "academia", unilateral: false,
    runnerValue: 3, reps: [8, 12],
    cue: "Não deixe a lombar descolar do banco no fundo do movimento.",
  },
  {
    id: "hip-thrust", name: "Elevação de quadril (hip thrust)",
    image: "Barbell_Hip_Thrust/0.jpg",
    primary: ["gluteo"], secondary: ["posterior"],
    category: "composto", equipment: "halteres", unilateral: false,
    runnerValue: 4, reps: [8, 12],
    cue: "Costela para baixo, extensão vem do glúteo — não da lombar.",
  },

  // ── Lower body: unilateral (running is a one-legged sport) ────────────────
  {
    id: "bulgaro", name: "Agachamento búlgaro",
    image: "Split_Squat_with_Dumbbells/0.jpg",
    primary: ["quadriceps", "gluteo"], secondary: ["core"],
    category: "unilateral", equipment: "halteres", unilateral: true,
    runnerValue: 5, reps: [6, 10],
    cue: "Tronco levemente à frente para pegar mais glúteo; joelho estável, sem cair para dentro.",
  },
  {
    id: "afundo", name: "Afundo / passada",
    image: "Barbell_Lunge/0.jpg",
    primary: ["quadriceps", "gluteo"], secondary: ["core"],
    category: "unilateral", equipment: "halteres", unilateral: true,
    runnerValue: 4, reps: [8, 12],
    cue: "Passo longo o bastante para o joelho de trás descer sem o da frente passar muito do pé.",
  },
  {
    id: "rdl-unilateral", name: "RDL unilateral",
    image: "Kettlebell_One-Legged_Deadlift/0.jpg",
    primary: ["posterior", "gluteo"], secondary: ["core"],
    category: "unilateral", equipment: "halteres", unilateral: true,
    runnerValue: 5, reps: [8, 12],
    cue: "Quadril fecha como uma dobradiça; o pé de trás aponta para o chão, sem abrir o quadril.",
  },
  {
    id: "step-up", name: "Step-up (subida no banco)",
    image: "Step-up_with_Knee_Raise/0.jpg",
    primary: ["quadriceps", "gluteo"], secondary: ["panturrilha"],
    category: "unilateral", equipment: "peso_corporal", unilateral: true,
    runnerValue: 4, reps: [8, 12],
    cue: "Suba empurrando com a perna de cima; não impulsione com a de baixo.",
  },

  // ── Posterior chain & lower leg — injury prevention ────────────────────────
  {
    id: "nordico", name: "Nórdico (flexão nórdica)",
    image: "Natural_Glute_Ham_Raise/0.jpg",
    primary: ["posterior"], secondary: [],
    category: "isolado", equipment: "peso_corporal", unilateral: false,
    runnerValue: 5, reps: [4, 6],
    cue: "Desça o mais devagar que conseguir; use as mãos só no fim. 2 séries por semana já protegem.",
  },
  {
    id: "panturrilha-em-pe", name: "Panturrilha em pé",
    image: "Standing_Calf_Raises/0.jpg",
    primary: ["panturrilha"], secondary: [],
    category: "isolado", equipment: "peso_corporal", unilateral: false,
    runnerValue: 5, reps: [8, 15],
    cue: "Amplitude total: desça até alongar, suba até o topo. Ênfase na descida (3 s).",
  },
  {
    id: "panturrilha-sentado", name: "Panturrilha sentado",
    image: "Seated_Calf_Raise/0.jpg",
    primary: ["panturrilha"], secondary: [],
    category: "isolado", equipment: "academia", unilateral: false,
    runnerValue: 4, reps: [10, 15],
    cue: "Pega o sóleo, o músculo que sustenta o ritmo em corrida longa.",
  },
  {
    id: "abducao-quadril", name: "Abdução de quadril com banda",
    image: "Thigh_Abductor/0.jpg",
    primary: ["gluteo"], secondary: [],
    category: "isolado", equipment: "elasticos", unilateral: false,
    runnerValue: 4, reps: [12, 20],
    cue: "Estabiliza a pelve na corrida — o que evita o joelho cair para dentro.",
  },
  {
    id: "mesa-flexora", name: "Mesa flexora",
    image: "Lying_Leg_Curls/0.jpg",
    primary: ["posterior"], secondary: [],
    category: "isolado", equipment: "academia", unilateral: false,
    runnerValue: 3, reps: [8, 12],
    cue: "Controle a volta; é na fase excêntrica que o posterior ganha resiliência.",
  },
  {
    id: "cadeira-extensora", name: "Cadeira extensora",
    image: "Leg_Extensions/0.jpg",
    primary: ["quadriceps"], secondary: [],
    category: "isolado", equipment: "academia", unilateral: false,
    runnerValue: 2, reps: [10, 15],
    cue: "Bom acessório de volume, mas não substitui agachamento nem unilateral.",
  },

  // ── Upper body: push ──────────────────────────────────────────────────────
  {
    id: "supino-reto", name: "Supino reto",
    image: "Barbell_Bench_Press_-_Medium_Grip/0.jpg",
    primary: ["peito"], secondary: ["triceps", "ombro"],
    category: "composto", equipment: "academia", unilateral: false,
    runnerValue: 2, reps: [5, 10],
    cue: "Escápulas retraídas e pés firmes no chão; barra desce na linha do mamilo.",
  },
  {
    id: "supino-inclinado", name: "Supino inclinado com halteres",
    image: "Incline_Dumbbell_Press/0.jpg",
    primary: ["peito"], secondary: ["ombro", "triceps"],
    category: "composto", equipment: "halteres", unilateral: false,
    runnerValue: 2, reps: [8, 12],
    cue: "Banco a 30-45°; mais que isso vira treino de ombro.",
  },
  {
    id: "flexao", name: "Flexão de braço",
    image: "Pushups/0.jpg",
    primary: ["peito"], secondary: ["triceps", "core"],
    category: "composto", equipment: "peso_corporal", unilateral: false,
    runnerValue: 3, reps: [8, 20],
    cue: "Corpo em prancha do calcanhar à cabeça; quadril não afunda.",
  },
  {
    id: "desenvolvimento", name: "Desenvolvimento de ombro",
    image: "Dumbbell_Shoulder_Press/0.jpg",
    primary: ["ombro"], secondary: ["triceps"],
    category: "composto", equipment: "halteres", unilateral: false,
    runnerValue: 2, reps: [6, 12],
    cue: "Costela para baixo — não compense estendendo a lombar.",
  },
  {
    id: "elevacao-lateral", name: "Elevação lateral",
    image: "Side_Lateral_Raise/0.jpg",
    primary: ["ombro"], secondary: [],
    category: "isolado", equipment: "halteres", unilateral: false,
    runnerValue: 1, reps: [12, 20],
    cue: "Suba até a linha do ombro; peso leve resolve, não precisa balançar.",
  },
  {
    id: "triceps-corda", name: "Tríceps na corda",
    image: "Triceps_Pushdown_-_Rope_Attachment/0.jpg",
    primary: ["triceps"], secondary: [],
    category: "isolado", equipment: "academia", unilateral: false,
    runnerValue: 1, reps: [10, 15],
    cue: "Cotovelo fixo ao lado do corpo; só o antebraço se move.",
  },
  {
    id: "paralelas", name: "Mergulho / paralelas",
    image: "Dips_-_Triceps_Version/0.jpg",
    primary: ["triceps"], secondary: ["peito", "ombro"],
    category: "composto", equipment: "peso_corporal", unilateral: false,
    runnerValue: 2, reps: [6, 12],
    cue: "Desça até o cotovelo a 90°; tronco levemente à frente pega mais peito.",
  },

  // ── Upper body: pull ──────────────────────────────────────────────────────
  {
    id: "barra-fixa", name: "Barra fixa",
    image: "Pullups/0.jpg",
    primary: ["costas"], secondary: ["biceps"],
    category: "composto", equipment: "peso_corporal", unilateral: false,
    runnerValue: 3, reps: [4, 10],
    cue: "Puxe o cotovelo para o bolso; peito em direção à barra, sem balançar.",
  },
  {
    id: "puxada-alta", name: "Puxada alta (pulley)",
    image: "Wide-Grip_Lat_Pulldown/0.jpg",
    primary: ["costas"], secondary: ["biceps"],
    category: "composto", equipment: "academia", unilateral: false,
    runnerValue: 2, reps: [8, 12],
    cue: "Sem jogar o tronco para trás; a barra desce até a clavícula.",
  },
  {
    id: "remada-curvada", name: "Remada curvada",
    image: "Bent_Over_Barbell_Row/0.jpg",
    primary: ["costas"], secondary: ["biceps", "core"],
    category: "composto", equipment: "halteres", unilateral: false,
    runnerValue: 3, reps: [6, 12],
    cue: "Tronco quase paralelo ao chão, lombar neutra. Puxe para o umbigo.",
  },
  {
    id: "remada-unilateral", name: "Remada unilateral com halter",
    image: "One-Arm_Dumbbell_Row/0.jpg",
    primary: ["costas"], secondary: ["biceps"],
    category: "unilateral", equipment: "halteres", unilateral: true,
    runnerValue: 3, reps: [8, 12],
    cue: "Sem torcer o tronco para ganhar amplitude — o movimento é da escápula.",
  },
  {
    id: "face-pull", name: "Face pull",
    image: "Face_Pull/0.jpg",
    primary: ["ombro"], secondary: ["costas"],
    category: "isolado", equipment: "elasticos", unilateral: false,
    runnerValue: 3, reps: [12, 20],
    cue: "Puxa para a altura dos olhos; ótimo para postura de quem corre curvado no fim.",
  },
  {
    id: "rosca-direta", name: "Rosca direta",
    image: "Barbell_Curl/0.jpg",
    primary: ["biceps"], secondary: [],
    category: "isolado", equipment: "halteres", unilateral: false,
    runnerValue: 1, reps: [8, 15],
    cue: "Cotovelo parado ao lado do corpo; sem impulso de quadril.",
  },

  // ── Core ──────────────────────────────────────────────────────────────────
  {
    id: "prancha", name: "Prancha",
    image: "Plank/0.jpg",
    primary: ["core"], secondary: ["ombro"],
    category: "core", equipment: "peso_corporal", unilateral: false,
    runnerValue: 4, reps: [30, 60],
    cue: "Glúteo e abdômen contraídos; qualidade acima de tempo — 40 s firmes valem mais que 2 min moles.",
  },
  {
    id: "prancha-lateral", name: "Prancha lateral",
    image: "Side_Bridge/0.jpg",
    primary: ["core"], secondary: ["gluteo"],
    category: "core", equipment: "peso_corporal", unilateral: true,
    runnerValue: 4, reps: [20, 45],
    cue: "Quadril alto e alinhado; trabalha a estabilidade lateral que a corrida exige.",
  },
  {
    id: "dead-bug", name: "Dead bug",
    image: "Dead_Bug/0.jpg",
    primary: ["core"], secondary: [],
    category: "core", equipment: "peso_corporal", unilateral: false,
    runnerValue: 3, reps: [8, 12],
    cue: "Lombar colada no chão o tempo todo; se descolar, reduza a amplitude.",
  },
  {
    id: "pallof", name: "Pallof press",
    image: "Pallof_Press/0.jpg",
    primary: ["core"], secondary: [],
    category: "core", equipment: "elasticos", unilateral: false,
    runnerValue: 4, reps: [10, 15],
    cue: "Resista à rotação — é exatamente o que o tronco faz a cada passada.",
  },

  // ── Plyometrics ───────────────────────────────────────────────────────────
  {
    id: "salto-caixa", name: "Salto na caixa",
    image: "Front_Box_Jump/0.jpg",
    primary: ["quadriceps", "gluteo"], secondary: ["panturrilha"],
    category: "pliometrico", equipment: "peso_corporal", unilateral: false,
    runnerValue: 4, reps: [3, 6],
    cue: "Suba explosivo, desça andando. Poucas repetições, qualidade máxima.",
  },
  {
    id: "pulo-corda", name: "Pulo de corda",
    image: "Rope_Jumping/0.jpg",
    primary: ["panturrilha"], secondary: ["core"],
    category: "pliometrico", equipment: "peso_corporal", unilateral: false,
    runnerValue: 3, reps: [30, 60],
    cue: "Contato curto com o chão; treina a rigidez elástica que economiza energia correndo.",
  },
  {
    id: "skipping", name: "Skipping alto",
    image: "Fast_Skipping/0.jpg",
    primary: ["panturrilha", "quadriceps"], secondary: ["core"],
    category: "pliometrico", equipment: "peso_corporal", unilateral: true,
    runnerValue: 4, reps: [20, 30],
    cue: "Joelho alto e contato rápido; é técnica de corrida além de força.",
  },
];

/** Exercises the athlete can actually perform with the equipment they have. */
export function availableExercises(equipment: Equipment[]): Exercise[] {
  const best = Math.max(...equipment.map(e => EQUIPMENT_RANK[e] ?? 0), 0);
  return EXERCISES.filter(ex => EQUIPMENT_RANK[ex.equipment] <= best);
}

/** Exercises that train a given muscle (as primary or secondary). */
export function exercisesForMuscle(muscle: MuscleGroup, pool: Exercise[] = EXERCISES): Exercise[] {
  return pool.filter(e => e.primary.includes(muscle) || e.secondary.includes(muscle));
}

/**
 * Resolves an id against the curated list first, then the imported catalogue.
 *
 * The two lists are deliberately asymmetric. `EXERCISES` is what the session
 * builder chooses from — every entry there was picked for a runner and carries
 * a cue written for one. `CATALOG` is what the athlete can reach for when the
 * gym, the injury, or the mood says otherwise; those entries have a photo and
 * correct muscle data but no coaching opinion, so they get `runnerValue: 1` and
 * an empty cue rather than a fabricated one.
 *
 * Everything downstream — logging, progression, the advisor — goes through this
 * function, which is why a catalogue exercise added to a roster behaves exactly
 * like a curated one from that point on.
 */
export function exerciseById(id: string): Exercise | undefined {
  const curated = EXERCISES.find(e => e.id === id);
  if (curated) return curated;

  const found = CATALOG.find(e => e.id === id);
  return found ? { ...found, runnerValue: 1, cue: "" } : undefined;
}

/** Curated list plus catalogue, for search and pickers. Never for auto-selection. */
export function allExercises(): Exercise[] {
  return [...EXERCISES, ...CATALOG.map(e => ({ ...e, runnerValue: 1 as const, cue: "" }))];
}

/** Absolute URL for a demonstration photo, or null when there is none. */
export function exerciseImageUrl(ex: { image?: string } | undefined): string | null {
  return ex?.image ? `${CATALOG_IMAGE_BASE}/${ex.image}` : null;
}

/**
 * The two frames of the movement: start position and end position.
 *
 * Every entry upstream ships exactly two numbered photos, and a single frame
 * does not tell you what the exercise *is* — "Puxada pegada aberta" at the top
 * and at the bottom are different enough that one of them is misleading alone.
 *
 * The second frame is derived rather than stored: the numbering is part of the
 * source schema, and duplicating it 240 times would double the file for nothing.
 */
export function exerciseFrames(ex: { image?: string } | undefined): string[] {
  const first = exerciseImageUrl(ex);
  return first ? [first, first.replace(/\/0\.jpg$/, "/1.jpg")] : [];
}
