/**
 * Imports the public-domain free-exercise-db catalogue into the app's shape.
 *
 *   node scripts/import-exercises.mjs
 *
 * Writes src/lib/exercise-catalog.ts. Re-runnable: the output is deterministic
 * for a given upstream commit, so a diff in the generated file means the source
 * data changed, not that the script is flaky.
 *
 * Why a build step instead of fetching at runtime: the catalogue is data, not
 * content. Vendoring it means no network call in the hot path, no upstream
 * outage taking the exercise picker down, and a reviewable diff when it moves.
 *
 * Source: https://github.com/yuhonas/free-exercise-db (Unlicense / public domain)
 */
import { writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../src/lib/exercise-catalog.ts");
const CURATED = resolve(HERE, "../src/lib/exercises.ts");

const SOURCE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
export const IMAGE_BASE = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises";

// ── Mapping onto the app's vocabulary ───────────────────────────────────────

// `neck` has no counterpart and no place in a running app — those are dropped.
const MUSCLE = {
  chest: "peito",
  lats: "costas", "middle back": "costas", "lower back": "costas", traps: "costas",
  shoulders: "ombro",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "biceps",        // no forearm group; the picker still finds them under bíceps
  quadriceps: "quadriceps",
  hamstrings: "posterior",
  glutes: "gluteo", abductors: "gluteo", adductors: "gluteo",
  calves: "panturrilha",
  abdominals: "core",
};

// Erring towards `academia` is the safe failure: an athlete with a full gym
// sees everything, and one with only dumbbells is never shown a cable machine.
const EQUIPMENT = {
  "body only": "peso_corporal",
  null: "peso_corporal",
  bands: "elasticos",
  dumbbell: "halteres", kettlebells: "halteres", "medicine ball": "halteres",
  "exercise ball": "halteres", "e-z curl bar": "halteres",
  barbell: "academia", machine: "academia", cable: "academia", other: "academia",
};

const DROP_CATEGORY = new Set(["stretching", "cardio", "strongman", "olympic weightlifting"]);
const DROP_EQUIPMENT = new Set(["foam roll"]);

/** Per-muscle quota — breadth by design, so no group ends up with three options. */
const QUOTA = {
  peito: 28, costas: 34, ombro: 26, biceps: 22, triceps: 22,
  quadriceps: 28, posterior: 22, gluteo: 18, panturrilha: 14, core: 30,
};

const UNILATERAL = /\b(one[- ]arm|single[- ]leg|single[- ]arm|one[- ]legged|one[- ]leg|alternating|alternate|unilateral|split squat|lunge|step[- ]up|pistol)\b/i;

// ── Translation ─────────────────────────────────────────────────────────────
// Exercise names are compositional ("Incline Dumbbell Bench Press"), so a
// longest-match-first phrase table covers them without hand-writing 250 strings.
// Anything left in English is reported, not silently shipped.

const PHRASES = [
  // Multi-word movements first — order matters, longest wins.
  ["romanian deadlift", "levantamento terra romeno"],
  ["stiff leg deadlift", "levantamento terra pernas retas"],
  ["straight leg deadlift", "levantamento terra pernas retas"],
  ["sumo deadlift", "levantamento terra sumô"],
  ["rack pull", "rack pull (terra parcial)"],
  ["deadlift", "levantamento terra"],
  ["good morning", "bom dia (good morning)"],
  ["hip thrust", "elevação de quadril"],
  ["glute bridge", "ponte de glúteo"],
  ["bridge", "ponte"],
  ["hyperextension", "hiperextensão lombar"],
  ["back extension", "extensão lombar"],
  ["bench press", "supino"],
  ["floor press", "supino no chão"],
  ["chest press", "supino"],
  ["chest fly", "crucifixo"],
  ["chest dip", "mergulho"],
  ["push[- ]up", "flexão de braço"],
  ["pushup", "flexão de braço"],
  ["press[- ]up", "flexão de braço"],
  ["pull[- ]up", "barra fixa"],
  ["pullup", "barra fixa"],
  ["chin[- ]up", "barra fixa supinada"],
  ["chinup", "barra fixa supinada"],
  ["pulldown", "puxada"],
  ["pull down", "puxada"],
  ["pullover", "pullover"],
  ["lat pull", "puxada"],
  ["upright row", "remada alta"],
  ["bent over row", "remada curvada"],
  ["bent[- ]over row", "remada curvada"],
  ["inverted row", "remada invertida"],
  ["seated row", "remada sentada"],
  ["t[- ]bar row", "remada cavalinho"],
  ["row", "remada"],
  ["shoulder press", "desenvolvimento"],
  ["military press", "desenvolvimento militar"],
  ["overhead press", "desenvolvimento"],
  ["arnold press", "desenvolvimento Arnold"],
  ["push press", "desenvolvimento com impulso"],
  ["lateral raise", "elevação lateral"],
  ["side lateral raise", "elevação lateral"],
  ["front raise", "elevação frontal"],
  ["rear delt", "deltoide posterior"],
  ["reverse fly", "crucifixo inverso"],
  ["reverse flye", "crucifixo inverso"],
  ["face pull", "face pull"],
  ["shrug", "encolhimento de ombros"],
  ["fly", "crucifixo"],
  ["flye", "crucifixo"],
  ["crossover", "crossover"],
  ["cross over", "crossover"],
  ["preacher curl", "rosca scott"],
  ["hammer curl", "rosca martelo"],
  ["concentration curl", "rosca concentrada"],
  ["spider curl", "rosca spider"],
  ["drag curl", "rosca arrasto"],
  ["reverse curl", "rosca inversa"],
  ["wrist curl", "rosca de punho"],
  ["leg curl", "mesa flexora"],
  ["curl", "rosca"],
  ["skull crusher", "tríceps testa"],
  ["lying triceps extension", "tríceps testa"],
  ["triceps extension", "extensão de tríceps"],
  ["tricep extension", "extensão de tríceps"],
  ["triceps pushdown", "tríceps na polia"],
  ["tricep pushdown", "tríceps na polia"],
  ["pushdown", "tríceps na polia"],
  ["kickback", "tríceps coice"],
  ["close[- ]grip", "pegada fechada"],
  ["wide[- ]grip", "pegada aberta"],
  ["reverse grip", "pegada invertida"],
  ["neutral grip", "pegada neutra"],
  ["medium grip", "pegada média"],
  ["leg press", "leg press"],
  ["leg extension", "cadeira extensora"],
  ["hack squat", "hack squat"],
  ["front squat", "agachamento frontal"],
  ["goblet squat", "agachamento goblet"],
  ["overhead squat", "agachamento overhead"],
  ["split squat", "agachamento búlgaro"],
  ["box squat", "agachamento na caixa"],
  ["squat", "agachamento"],
  ["walking lunge", "afundo caminhando"],
  ["reverse lunge", "afundo reverso"],
  ["side lunge", "afundo lateral"],
  ["lunge", "afundo"],
  ["step[- ]up", "step-up"],
  ["calf raise", "panturrilha"],
  ["calf press", "panturrilha no leg press"],
  ["donkey calf", "panturrilha burrinho"],
  ["hip adduction", "adução de quadril"],
  ["hip abduction", "abdução de quadril"],
  ["hip extension", "extensão de quadril"],
  ["hip flexor", "flexor do quadril"],
  ["thigh adductor", "cadeira adutora"],
  ["thigh abductor", "cadeira abdutora"],
  ["kettlebell swing", "swing com kettlebell"],
  ["clean and jerk", "arranco e arremesso"],
  ["clean and press", "clean e desenvolvimento"],
  ["power clean", "clean de potência"],
  ["clean", "clean"],
  ["snatch", "arranco"],
  ["thruster", "thruster"],
  ["burpee", "burpee"],
  ["mountain climber", "escalador"],
  ["jumping jack", "polichinelo"],
  ["box jump", "salto na caixa"],
  ["broad jump", "salto horizontal"],
  ["depth jump", "salto em profundidade"],
  ["squat jump", "agachamento com salto"],
  ["jump rope", "pulo de corda"],
  ["jump", "salto"],
  ["sit[- ]up", "abdominal"],
  ["situp", "abdominal"],
  ["crunch", "abdominal"],
  ["leg raise", "elevação de pernas"],
  ["leg lift", "elevação de pernas"],
  ["knee raise", "elevação de joelhos"],
  ["hanging", "na barra"],
  ["russian twist", "russian twist"],
  ["woodchop", "lenhador"],
  ["wood chop", "lenhador"],
  ["side bend", "flexão lateral de tronco"],
  ["plank", "prancha"],
  ["ab roller", "roda abdominal"],
  ["ab wheel", "roda abdominal"],
  ["v[- ]up", "abdominal em V"],
  ["flutter kick", "tesoura"],
  ["scissor", "tesoura"],
  ["bicycle", "abdominal bicicleta"],
  ["dead bug", "dead bug"],
  ["bird dog", "bird dog"],
  ["superman", "superman"],
  ["dip", "mergulho"],
  ["shoulder tap", "toque no ombro"],
  ["farmer's walk", "caminhada do fazendeiro"],
  ["carry", "caminhada com carga"],
  ["pull[- ]through", "pull-through"],
  ["nordic", "nórdico"],
  ["glute[- ]ham raise", "elevação glúteo-posterior"],
  ["press", "desenvolvimento"],
  ["extension", "extensão"],
  ["raise", "elevação"],
  ["twist", "rotação de tronco"],
  ["pull", "puxada"],
  ["push", "empurrar"],
  ["kick", "chute"],
  ["hold", "isometria"],
  ["walk", "caminhada"],
  ["swing", "swing"],
  ["throw", "arremesso"],
  ["clap", "com palma"],
  ["circle", "circundução"],
  ["rotation", "rotação"],
  ["thrust", "impulsão"],

  // Modifiers.
  ["barbell", "com barra"],
  ["dumbbell", "com halteres"],
  ["kettlebell", "com kettlebell"],
  ["cable", "no cabo"],
  ["machine", "na máquina"],
  ["smith machine", "no smith"],
  ["smith", "no smith"],
  ["band", "com elástico"],
  ["bands", "com elástico"],
  ["resistance band", "com elástico"],
  ["exercise ball", "na bola"],
  ["stability ball", "na bola"],
  ["swiss ball", "na bola"],
  ["medicine ball", "com medicine ball"],
  ["e[- ]z curl bar", "com barra W"],
  ["ez bar", "com barra W"],
  ["bodyweight", "peso corporal"],
  ["body[- ]only", "peso corporal"],
  ["weighted", "com carga"],
  ["incline", "inclinado"],
  ["decline", "declinado"],
  ["flat", "reto"],
  ["seated", "sentado"],
  ["standing", "em pé"],
  ["lying", "deitado"],
  ["kneeling", "ajoelhado"],
  ["bent[- ]over", "curvado"],
  ["bent over", "curvado"],
  ["one arm", "unilateral"],
  ["one[- ]arm", "unilateral"],
  ["single arm", "unilateral"],
  ["single[- ]arm", "unilateral"],
  ["one leg", "unilateral"],
  ["one[- ]leg", "unilateral"],
  ["one[- ]legged", "unilateral"],
  ["single leg", "unilateral"],
  ["single[- ]leg", "unilateral"],
  ["alternating", "alternado"],
  ["alternate", "alternado"],
  ["reverse", "inverso"],
  ["wide", "aberto"],
  ["narrow", "fechado"],
  ["close", "fechado"],
  ["front", "frontal"],
  ["rear", "posterior"],
  ["side", "lateral"],
  ["lateral", "lateral"],
  ["overhead", "acima da cabeça"],
  ["behind the neck", "por trás da nuca"],
  ["behind neck", "por trás da nuca"],
  ["to the front", "à frente"],
  ["on the floor", "no chão"],
  ["floor", "no chão"],
  ["bench", "no banco"],
  ["chair", "na cadeira"],
  ["wall", "na parede"],
  ["stair", "na escada"],
  ["box", "na caixa"],
  ["with", ""],
  ["and", ""],
  ["on", ""],
  ["to", ""],
  ["the", ""],
  ["version", "versão"],
  ["variation", "variação"],
  ["partial", "parcial"],
  ["full", "completo"],
  ["assisted", "assistido"],
  ["explosive", "explosivo"],
  ["isometric", "isométrico"],
  ["eccentric", "excêntrico"],
  ["negative", "negativo"],
  ["static", "estático"],
  ["dynamic", "dinâmico"],
  ["heel", "calcanhar"],
  ["toe", "ponta do pé"],
  ["knee", "joelho"],
  ["hip", "quadril"],
  ["chest", "peito"],
  ["back", "costas"],
  ["shoulder", "ombro"],
  ["biceps", "bíceps"],
  ["bicep", "bíceps"],
  ["triceps", "tríceps"],
  ["tricep", "tríceps"],
  ["forearm", "antebraço"],
  ["glute", "glúteo"],
  ["hamstring", "posterior de coxa"],
  ["quad", "quadríceps"],
  ["calf", "panturrilha"],
  ["ab", "abdominal"],
  ["abs", "abdominal"],
  ["oblique", "oblíquo"],
  ["core", "core"],
  ["leg", "perna"],
  ["arm", "braço"],
  ["upper", "superior"],
  ["lower", "inferior"],
  ["middle", "médio"],
  ["high", "alto"],
  ["low", "baixo"],
  ["grip", "pegada"],
  ["stance", "base"],
  ["wide stance", "base aberta"],
  ["neutral", "neutra"],
  ["pronated", "pronada"],
  ["supinated", "supinada"],

  // Second pass — the words the first run reported as blocking an import.
  ["around the world", "elevação circular"],
  ["palms down", "pegada pronada"],
  ["palms up", "pegada supinada"],
  ["palms in", "pegada neutra"],
  ["two[- ]arm", "com os dois braços"],
  ["external rotation", "rotação externa"],
  ["internal rotation", "rotação interna"],
  ["rope attachment", "com corda"],
  ["straight arm", "braço estendido"],
  ["straight leg", "pernas retas"],
  ["bent arm", "braço flexionado"],
  ["butt lift", "elevação de quadril deitado"],
  ["hang clean", "clean do alto"],
  ["with chains", "com correntes"],
  ["leverage", "máquina articulada"],
  ["suspended", "suspenso"],
  ["windmill", "windmill"],
  ["rollout", "roda abdominal"],
  ["elevated", "elevado"],
  ["without", "sem"],
  ["against", "contra"],
  ["straight", "reto"],
  ["external", "externa"],
  ["internal", "interna"],
  ["supine", "deitado"],
  ["double", "duplo"],
  ["single", "unilateral"],
  ["linear", "linear"],
  ["behind", "atrás"],
  ["weight", "carga"],
  ["chain", "corrente"],
  ["plate", "anilha"],
  ["stiff", "rígido"],
  ["inner", "interno"],
  ["outer", "externo"],
  ["hang", "pendurado"],
  ["jerk", "arremesso"],
  ["sled", "trenó"],
  ["long", "longo"],
  ["palm", "palma"],
  ["head", "cabeça"],
  ["body", ""],
  ["butt", "glúteo"],
  ["ball", "bola"],
  ["hand", "mão"],
  ["foot", "pé"],
  ["feet", "pés"],
  ["cone", "cone"],
  ["chin", "queixo"],
  ["down", "para baixo"],
  ["lift", "elevação"],
  ["hop", "salto curto"],
  ["bent", "flexionado"],
  ["two", "duplo"],
  ["bar", ""],
  ["ez", "barra W"],
  ["in", ""],
  ["from", ""],
];

/** English that Brazilian gyms say in English. Leaving these alone is correct. */
const KEEP_EN = new Set([
  "press", "leg", "lat", "pulldown", "pulley", "crossover", "pallof", "hack",
  "smith", "drop", "set", "good", "morning", "step", "up", "box", "jump",
  "burpee", "swing", "clean", "kettlebell", "core", "bug", "dead", "bird",
  "dog", "superman", "sprint", "drill", "cross", "over", "face", "pull",
  "russian", "twist", "rope", "landmine", "sumo", "front", "rack",
]);

/**
 * Everything from "barbell" onwards in the table qualifies a movement rather
 * than being one, bar these. Without the split, "Body-Up" resolves its head to
 * "corpo" and the athlete gets an exercise called "Abdominal corpo".
 */
const MOVEMENT_TOO = new Set([
  "around the world", "external rotation", "internal rotation", "butt lift",
  "hang clean", "windmill", "rollout", "lift", "hop",
]);
const MOD_FROM = PHRASES.findIndex(([en]) => en === "barbell");
const IS_MOD = new Set(
  PHRASES.slice(MOD_FROM).map(([en]) => en).filter(en => !MOVEMENT_TOO.has(en))
);

// Longest phrase first so "bench press" never gets eaten by "press".
const SORTED = [...PHRASES].sort((a, b) => b[0].length - a[0].length);

/** Kit, not movement — these always land at the end of the name. */
const EQ_PT = new Set([
  "com barra", "com halteres", "com kettlebell", "no cabo", "na máquina",
  "no smith", "com elástico", "na bola", "com medicine ball", "com barra W",
  "peso corporal", "máquina articulada", "com corda", "com correntes",
  "com carga", "com anilha", "no trenó", "com os dois braços",
]);

/**
 * Turns an English name into a Portuguese one, or reports why it could not.
 *
 * Word-for-word substitution produces "Com barra agachamento" — English word
 * order wearing Portuguese words. So the parts are recomposed instead:
 * Portuguese puts the movement first and its qualifiers after, English does the
 * reverse, which means the head noun is the *last* phrase matched. Equipment is
 * pulled out separately because it belongs at the end either way.
 *
 * The residual is exact rather than guessed: translated text is parked behind
 * sentinels, so anything still in the open at the end is English the table did
 * not cover. That is the difference between shipping "Supino com halteres" and
 * shipping "Bradford supino com halteres".
 */
function translate(name) {
  // A trailing "- Medium Grip" is a qualifier, not the head of the phrase.
  const [main, ...tail] = name.split(/\s+-\s+/);
  const slots = [];
  let s = ` ${main.toLowerCase()} `;

  for (const [en, pt] of SORTED) {
    // Absorb plurals so "curls" and "rows" do not fall through as English.
    const re = new RegExp(`(?<=[^a-z])${en}(?:e?s)?(?=[^a-z])`, "gi");
    s = s.replace(re, () => {
      slots.push({ pt, en });
      return `  ${slots.length - 1}  `;
    });
  }

  // Everything still outside a sentinel is English the table missed.
  const residual = (s.replace(/ \d+ /g, " ").match(/[a-z]{2,}/g) ?? [])
    .filter(w => !KEEP_EN.has(w));

  const order = [...s.matchAll(/ (\d+) /g)]
    .map(m => slots[Number(m[1])])
    .filter(x => x.pt);

  const equip = order.filter(x => EQ_PT.has(x.pt)).map(x => x.pt);
  const rest  = order.filter(x => !EQ_PT.has(x.pt));
  // The head is the last movement; English puts it last, Portuguese wants it first.
  const headAt = rest.map(x => IS_MOD.has(x.en)).lastIndexOf(false);
  const head = headAt >= 0 ? rest.splice(headAt, 1)[0].pt : null;
  const parts = [head, ...rest.map(x => x.pt), ...equip].filter(Boolean);

  // "Agachamento com com halteres" — the same word arriving from two phrases.
  // "Leg press panturrilha no leg press" — the same word arriving twice.
  const text = parts
    .filter((w, i) => parts.indexOf(w) === i)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const qualifier = tail.length ? translate(tail.join(" - ")) : null;
  if (qualifier?.residual.length) residual.push(...qualifier.residual);

  if (!head) residual.push("<sem movimento>");

  return {
    text: qualifier?.text ? `${text} (${qualifier.text})` : text,
    residual,
  };
}

const capitalise = s => s.charAt(0).toUpperCase() + s.slice(1);

function slug(name) {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Selection ───────────────────────────────────────────────────────────────

function score(e) {
  let s = 0;
  if (e.level === "beginner") s += 2; else if (e.level === "intermediate") s += 1;
  if (["barbell", "dumbbell", "machine", "cable", "body only", null].includes(e.equipment)) s += 2;
  if (e.mechanic === "compound") s += 1;
  if (e.secondaryMuscles?.length) s += 1;
  return s;
}

function repsFor(category) {
  return { pliometrico: [3, 6], composto: [6, 12], unilateral: [8, 12], isolado: [10, 15], core: [10, 20] }[category];
}

async function main() {
  const raw = await (await fetch(SOURCE)).json();

  const mappable = raw.filter(e =>
    !DROP_CATEGORY.has(e.category) &&
    !DROP_EQUIPMENT.has(e.equipment) &&
    e.images?.length &&
    e.primaryMuscles?.length &&
    e.primaryMuscles.every(m => MUSCLE[m]) &&
    (e.equipment === null || EQUIPMENT[e.equipment])
  );

  // Translation quality gates selection instead of being reported afterwards.
  // An exercise the phrase table cannot fully render is simply not imported —
  // the next-ranked candidate takes its slot, and the quota still fills.
  const missed = new Map();
  // Seeded with the curated names: an imported "Prancha" alongside the curated
  // one gives the athlete two identical rows and no way to tell them apart.
  const seenName = new Set(
    [...readFileSync(CURATED, "utf8").matchAll(/name: "([^"]+)"/g)].map(m => m[1].toLowerCase())
  );
  let collisions = 0;
  const usable = [];
  for (const e of mappable) {
    const { text, residual } = translate(e.name);
    if (residual.length) {
      for (const w of residual) missed.set(w, (missed.get(w) ?? 0) + 1);
      continue;
    }
    const pt = capitalise(text);
    if (seenName.has(pt.toLowerCase())) { collisions++; continue; }
    seenName.add(pt.toLowerCase());
    usable.push({ ...e, pt });
  }

  const ranked = [...usable].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));

  // Quota per muscle rather than a global top-N: a global cut fills up with
  // whatever muscle happens to have the most entries upstream.
  const taken = new Set();
  const counts = Object.fromEntries(Object.keys(QUOTA).map(k => [k, 0]));
  const picked = [];
  for (const e of ranked) {
    const groups = Array.from(new Set(e.primaryMuscles.map(m => MUSCLE[m])));
    if (taken.has(e.id)) continue;
    if (!groups.some(g => counts[g] < QUOTA[g])) continue;
    taken.add(e.id);
    for (const g of groups) counts[g]++;
    picked.push(e);
  }

  const out = [];
  const seenId = new Set();

  for (const e of picked.sort((a, b) => a.pt.localeCompare(b.pt, "pt-BR"))) {
    const primary = Array.from(new Set(e.primaryMuscles.map(m => MUSCLE[m])));
    const secondary = Array.from(new Set((e.secondaryMuscles ?? []).map(m => MUSCLE[m]).filter(Boolean)))
      .filter(m => !primary.includes(m));
    const equipment = EQUIPMENT[e.equipment ?? "null"] ?? "academia";
    const unilateral = UNILATERAL.test(e.name);

    let category;
    if (e.category === "plyometrics") category = "pliometrico";
    else if (primary.length === 1 && primary[0] === "core") category = "core";
    else if (unilateral) category = "unilateral";
    else if (e.mechanic === "isolation") category = "isolado";
    else category = "composto";

    let id = `c-${slug(e.name)}`;
    if (seenId.has(id)) id = `${id}-${out.length}`;
    seenId.add(id);

    out.push({
      id, name: e.pt, primary, secondary, category, equipment, unilateral,
      reps: repsFor(category),
      image: e.images[0],
      level: e.level ?? "intermediate",
      force: e.force ?? null,
    });
  }

  const body = out.map(e =>
    `  { id: ${JSON.stringify(e.id)}, name: ${JSON.stringify(e.name)},\n` +
    `    primary: ${JSON.stringify(e.primary)}, secondary: ${JSON.stringify(e.secondary)},\n` +
    `    category: ${JSON.stringify(e.category)}, equipment: ${JSON.stringify(e.equipment)}, ` +
    `unilateral: ${e.unilateral}, reps: [${e.reps[0]}, ${e.reps[1]}],\n` +
    `    image: ${JSON.stringify(e.image)}, level: ${JSON.stringify(e.level)} },`
  ).join("\n");

  writeFileSync(OUT, `/**
 * Extended exercise catalogue — GENERATED, do not edit by hand.
 *
 * Run \`node scripts/import-exercises.mjs\` to regenerate.
 *
 * These are search-only: the session builder picks from the curated list in
 * exercises.ts, which carries the runner-specific judgement (runnerValue, cue)
 * that no public dataset has. This file exists so that when the athlete wants
 * an exercise the coach did not prescribe, it is already there — with a photo.
 *
 * Source: https://github.com/yuhonas/free-exercise-db (Unlicense, public domain)
 */
import type { Exercise } from "@/lib/exercises";

export const CATALOG_IMAGE_BASE = ${JSON.stringify(IMAGE_BASE)};

export interface CatalogExercise extends Omit<Exercise, "runnerValue" | "cue"> {
  /** Relative path under CATALOG_IMAGE_BASE. */
  image: string;
  level: "beginner" | "intermediate" | "expert";
}

export const CATALOG: CatalogExercise[] = [
${body}
];
`);

  console.log(`selected ${out.length} of ${usable.length} translatable ` +
              `(${mappable.length} mappable, ${raw.length} upstream)`);
  console.log("per muscle:", counts);
  console.log(`${collisions} dropped as duplicate names`);

  // Not a failure — just the shortlist for growing the phrase table next time.
  const left = [...missed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  if (left.length) {
    console.log(`\ndropped for untranslated words (${missed.size} distinct, top 40):`);
    console.log(left.map(([w, n]) => `${w}(${n})`).join(" "));
  }
}

main();
