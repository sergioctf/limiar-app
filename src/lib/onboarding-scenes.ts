/**
 * The example athlete the onboarding scenes are built from.
 *
 * Deliberately a full, healthy history rather than a blank slate: an empty
 * dashboard demonstrates nothing and sells nothing. Someone deciding whether
 * this app is worth their time needs to see it doing the work, not see where
 * their data would eventually go.
 *
 * Numbers are internally consistent — the VDOT, the paces, the zones and the
 * race predictions all follow from the same 3 km test — so nothing here would
 * embarrass us if a runner did the arithmetic.
 */

/** 3 km in 13:12 — a plausible, unremarkable club runner. */
export const DEMO_TEST = {
  distanceKm: 3,
  timeLabel:  "13:12",
  vdot:       46.1,
  lthr:       171,
  hrMax:      186,
};

export const DEMO_PACES: Array<{ label: string; range: string; dot: string }> = [
  { label: "Regenerativo", range: "7:25 – 6:55", dot: "bg-blue-500" },
  { label: "Rodagem",      range: "6:41 – 5:47", dot: "bg-green-500" },
  { label: "Maratona",     range: "5:20 – 5:01", dot: "bg-teal-500" },
  { label: "Limiar",       range: "4:54 – 4:43", dot: "bg-yellow-500" },
  { label: "Intervalo",    range: "4:23 – 4:09", dot: "bg-amber-500" },
  { label: "Repetição",    range: "3:58 – 3:44", dot: "bg-red-500" },
];

export const DEMO_ZONES: Array<{ zone: string; name: string; range: string; bar: string }> = [
  { zone: "Z1", name: "Recuperação",  range: "até 138",  bar: "bg-blue-500" },
  { zone: "Z2", name: "Base aeróbica", range: "139–152", bar: "bg-green-500" },
  { zone: "Z3", name: "Moderado",      range: "153–159", bar: "bg-yellow-500" },
  { zone: "Z4", name: "Limiar",        range: "160–170", bar: "bg-amber-500" },
  { zone: "Z5", name: "VO₂max",        range: "171+",    bar: "bg-red-500" },
];

export const DEMO_PREDICTIONS: Array<{ label: string; time: string; pace: string }> = [
  { label: "5 km",     time: "22:38", pace: "4:32/km" },
  { label: "10 km",    time: "47:10", pace: "4:43/km" },
  { label: "Meia",     time: "1:44:07", pace: "4:56/km" },
  { label: "Maratona", time: "3:36:52", pace: "5:08/km" },
];

/** A Tuesday interval session, block by block. */
export const DEMO_WORKOUT = {
  title: "Tiro 5×1000 m",
  totalKm: 10.5,
  blocks: [
    { kind: "Aquecimento", detail: "2 km",     pace: "6:41 – 5:47", hr: "139–152", zone: "Z2", tint: "bg-green-500" },
    { kind: "5× 1000 m",   detail: "1 km cada", pace: "4:23 – 4:09", hr: "171–181", zone: "Z5", tint: "bg-red-500" },
    { kind: "Recuperação", detail: "400 m",     pace: "7:25 – 6:55", hr: "139–152", zone: "Z2", tint: "bg-blue-500" },
    { kind: "Desaquecimento", detail: "1.5 km", pace: "6:41 – 5:47", hr: "139–152", zone: "Z2", tint: "bg-green-500" },
  ],
};

/** Real ids from the curated catalogue, so the photos actually resolve. */
export const DEMO_EXERCISES = [
  { id: "agachamento-livre", name: "Agachamento livre",  image: "Barbell_Full_Squat/0.jpg",  sets: "4 × 6", load: "72 kg" },
  { id: "rdl",               name: "Stiff / RDL",         image: "Romanian_Deadlift/0.jpg",   sets: "3 × 8", load: "55 kg" },
  { id: "bulgaro",           name: "Agachamento búlgaro", image: "Split_Squat_with_Dumbbells/0.jpg", sets: "3 × 10", load: "18 kg" },
  { id: "nordico",           name: "Nórdico",             image: "Natural_Glute_Ham_Raise/0.jpg", sets: "3 × 5", load: "corpo" },
];

/** Weekly volume for the load chart — a build block with a recovery week. */
export const DEMO_LOAD = {
  ctl: 47, atl: 39, tsb: 8,
  series: [28, 32, 36, 26, 38, 42, 46, 34, 48, 52, 55, 41],
};

export const DEMO_RUN_ANALYSIS = {
  title: "Longão de sábado",
  distanceKm: 18,
  time: "1:33:40",
  pace: "5:12/km",
  hr: 148,
  elevation: 186,
  splits: [5.14, 5.09, 5.16, 5.10, 5.05, 5.02],
  verdict:
    "Segunda metade 8 s/km mais rápida que a primeira. Negative split num longão " +
    "de 18 km é exatamente o controle que a prova vai exigir.",
};

export const DEMO_ADVISOR = [
  {
    severity: "alta" as const,
    title: "Quinta pesada antes do tiro de sexta",
    body:  "Agachamento e leg press na véspera do treino de qualidade. Pernas pesadas custam mais no tiro do que a musculação entrega.",
  },
  {
    severity: "media" as const,
    title: "Supino parado há 5 semanas",
    body:  "Mesma carga e mesmas repetições desde 28/06. Subir 2,5 kg ou fechar uma repetição a mais.",
  },
];

export const DEMO_FRIENDS = [
  { name: "Manoela L.", days: 6, initial: "M" },
  { name: "Você",       days: 5, initial: "V", me: true },
  { name: "Pedro M.",   days: 4, initial: "P" },
  { name: "Ana S.",     days: 3, initial: "A" },
];

export const DEMO_RACE = {
  name: "Meia de São Paulo",
  date: "12 de outubro",
  weeksAway: 9,
  target: "1:45",
  phase: "Construção",
};

/** Week strip for the dashboard scene. */
export const DEMO_WEEK: Array<{ day: string; label: string; km: number | null; strength: boolean }> = [
  { day: "Seg", label: "Rodagem leve",   km: 8,  strength: true },
  { day: "Ter", label: "Musculação",     km: null, strength: true },
  { day: "Qua", label: "Tiro 5×1000 m",  km: 10.5, strength: true },
  { day: "Qui", label: "Musculação",     km: null, strength: true },
  { day: "Sex", label: "Rodagem",        km: 8,  strength: true },
  { day: "Sáb", label: "Longão",         km: 18, strength: false },
  { day: "Dom", label: "Descanso",       km: null, strength: false },
];
