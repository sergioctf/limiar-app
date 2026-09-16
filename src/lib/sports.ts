/**
 * Sport taxonomy for Limiar.
 *
 * Four practiced sports, grouped into two categories:
 *   • força  → musculação (inclui HIIT)
 *   • cárdio → corrida, natação, ciclismo   (sub-categorias mantidas separadas)
 *
 * This module is framework-agnostic (no React/icon imports) so it can be used
 * both server-side (plan generation, APIs) and client-side (UI).
 */

/**
 * The four the coach periodises, exports to a watch, and prescribes paces for.
 * Adding to this list means teaching the engine to plan that sport.
 */
export type PrimarySport = "musculacao" | "corrida" | "natacao" | "ciclismo";

/**
 * Everything else the athlete actually does.
 *
 * Named rather than lumped into one bucket: "Vôlei" and "Yoga" cost very
 * different amounts and mean different things on a training week, and an app
 * that shows both as "Outros" is throwing away what the athlete told it. They
 * are tracked, counted and costed — just not planned.
 */
export type SecondarySport =
  | "bike_indoor" | "caminhada" | "trilha" | "yoga" | "pilates" | "alongamento"
  | "funcional" | "crossfit" | "eliptico" | "escada" | "remo"
  | "volei" | "futebol" | "basquete" | "tenis" | "beach_tennis" | "padel"
  | "escalada" | "luta" | "danca" | "skate" | "surf" | "patins" | "outro";

export type SportKey = PrimarySport | SecondarySport;
export type SportCategory = "forca" | "cardio" | "outros";

export interface SportMeta {
  key:      SportKey;
  label:    string;          // "Musculação"
  category: SportCategory;
  emoji:    string;
  /** Primary metric a session of this sport is measured by. */
  unit:     "distance" | "duration";
}

export const SPORTS: Record<SportKey, SportMeta> = {
  musculacao: { key: "musculacao", label: "Musculação", category: "forca",  emoji: "🏋️", unit: "duration" },
  corrida:    { key: "corrida",    label: "Corrida",    category: "cardio", emoji: "🏃", unit: "distance" },
  natacao:    { key: "natacao",    label: "Natação",    category: "cardio", emoji: "🏊", unit: "distance" },
  ciclismo:   { key: "ciclismo",   label: "Ciclismo",   category: "cardio", emoji: "🚴", unit: "distance" },
  // ── Tier 2 ────────────────────────────────────────────────────────────────
  // Tracked, costed and counted as training days; never periodised. Before they
  // existed these sessions classified as nothing at all: they burned no
  // calories and counted towards no training day, so the athlete trained and
  // the app saw an empty afternoon.
  bike_indoor: { key: "bike_indoor", label: "Bike indoor", category: "outros", emoji: "🚲", unit: "duration" },
  caminhada:   { key: "caminhada",   label: "Caminhada",   category: "outros", emoji: "🚶", unit: "distance" },
  trilha:      { key: "trilha",      label: "Trilha",      category: "outros", emoji: "🥾", unit: "distance" },
  yoga:        { key: "yoga",        label: "Yoga",        category: "outros", emoji: "🧘", unit: "duration" },
  pilates:     { key: "pilates",     label: "Pilates",     category: "outros", emoji: "🤸", unit: "duration" },
  alongamento: { key: "alongamento", label: "Alongamento", category: "outros", emoji: "🧎", unit: "duration" },
  funcional:   { key: "funcional",   label: "Funcional",   category: "outros", emoji: "🏋️", unit: "duration" },
  crossfit:    { key: "crossfit",    label: "CrossFit",    category: "outros", emoji: "🪀", unit: "duration" },
  eliptico:    { key: "eliptico",    label: "Elíptico",    category: "outros", emoji: "🏃", unit: "duration" },
  escada:      { key: "escada",      label: "Escada",      category: "outros", emoji: "🪜", unit: "duration" },
  remo:        { key: "remo",        label: "Remo",        category: "outros", emoji: "🚣", unit: "duration" },
  volei:       { key: "volei",       label: "Vôlei",       category: "outros", emoji: "🏐", unit: "duration" },
  futebol:     { key: "futebol",     label: "Futebol",     category: "outros", emoji: "⚽", unit: "duration" },
  basquete:    { key: "basquete",    label: "Basquete",    category: "outros", emoji: "🏀", unit: "duration" },
  tenis:       { key: "tenis",       label: "Tênis",       category: "outros", emoji: "🎾", unit: "duration" },
  beach_tennis:{ key: "beach_tennis",label: "Beach tennis",category: "outros", emoji: "🏖️", unit: "duration" },
  padel:       { key: "padel",       label: "Padel",       category: "outros", emoji: "🎾", unit: "duration" },
  escalada:    { key: "escalada",    label: "Escalada",    category: "outros", emoji: "🧗", unit: "duration" },
  luta:        { key: "luta",        label: "Luta",        category: "outros", emoji: "🥊", unit: "duration" },
  danca:       { key: "danca",       label: "Dança",       category: "outros", emoji: "💃", unit: "duration" },
  skate:       { key: "skate",       label: "Skate",       category: "outros", emoji: "🛹", unit: "duration" },
  surf:        { key: "surf",        label: "Surf",        category: "outros", emoji: "🏄", unit: "duration" },
  patins:      { key: "patins",      label: "Patins",      category: "outros", emoji: "⛸️", unit: "duration" },
  outro:       { key: "outro",       label: "Outros",      category: "outros", emoji: "🤾", unit: "duration" },
};

/**
 * The sports the coach plans for.
 *
 * `outro` is deliberately absent: it is a classification bucket, not something
 * anyone periodises or exports a workout file for. Adding it here would put
 * "Outros" in the sport picker and ask the engine to build a plan for tennis.
 */
export const ALL_SPORTS: PrimarySport[] = ["musculacao", "corrida", "natacao", "ciclismo"];

/** Tier 2, in the order they are offered. Most common first. */
export const SECONDARY_SPORTS: SecondarySport[] = [
  "bike_indoor", "caminhada", "trilha", "funcional", "crossfit",
  "yoga", "pilates", "alongamento", "eliptico", "escada", "remo",
  "volei", "futebol", "basquete", "tenis", "beach_tennis", "padel",
  "escalada", "luta", "danca", "skate", "surf", "patins", "outro",
];

/** Every key, for classification and display. */
export const EVERY_SPORT: SportKey[] = [...ALL_SPORTS, ...SECONDARY_SPORTS];

/** Sports enabled by default (matches the app's original running + strength focus). */
export const DEFAULT_SPORTS: PrimarySport[] = ["corrida", "musculacao"];

export function isPrimarySport(key: unknown): key is PrimarySport {
  return ALL_SPORTS.includes(key as PrimarySport);
}

export function isSecondarySport(key: unknown): key is SecondarySport {
  return SECONDARY_SPORTS.includes(key as SecondarySport);
}

/**
 * How long a tier-2 session typically lasts, in minutes.
 *
 * The athlete is not asked: a yoga class is an hour and a stretching session is
 * fifteen minutes, and making someone type that for every sport they practise
 * is a worse answer than a sensible default. It only feeds the plan's display
 * and the calorie estimate — a logged session always overrides it.
 */
const SESSION_MINUTES: Partial<Record<SecondarySport, number>> = {
  alongamento: 20,
  caminhada:   45,
  escada:      30,
  eliptico:    40,
  remo:        30,
  crossfit:    60,
  trilha:      90,
  futebol:     90,
  surf:        90,
  escalada:    90,
};

const DEFAULT_SESSION_MINUTES = 60;

export function sessionMinutes(key: SecondarySport): number {
  return SESSION_MINUTES[key] ?? DEFAULT_SESSION_MINUTES;
}

export const CATEGORY_LABEL: Record<SportCategory, string> = {
  forca:  "Força",
  cardio: "Cárdio",
  outros: "Outros",
};

/**
 * Map any raw activity/run type (Strava sport_type, our RunType, gym labels)
 * onto the four-sport taxonomy. HIIT/Crossfit/Workout all fold into musculação.
 * Returns null when it can't be classified.
 */
export function toSportKey(raw: string | null | undefined): SportKey | null {
  const t = (raw ?? "").toLowerCase().trim();
  if (!t) return null;

  // Cárdio — running (includes our RunType session names)
  if (
    t.includes("run") || t.includes("trail") || t === "treadmill" ||
    ["easy", "tempo", "intervals", "long_run", "recovery", "test", "race"].includes(t)
  ) return "corrida";

  // Note: every Ride variant — including VirtualRide from Zwift — stays
  // `ciclismo`. Indoor riding is still the sport being trained, and moving it to
  // tier 2 would take a cyclist's trainer sessions out of the volume their plan
  // is built from. `bike_indoor` exists for a spin class logged by hand, which
  // is cross-training rather than cycling.

  // Cárdio — swimming
  if (t.includes("swim")) return "natacao";

  // Cárdio — cycling
  if (t.includes("ride") || t.includes("bike") || t.includes("cycl") || t.includes("velo") || t.includes("spinning")) {
    return "ciclismo";
  }

  // Força — strength & HIIT bucket
  if (
    t.includes("weight") || t.includes("strength") || t.includes("gym") ||
    t.includes("workout") || t.includes("crossfit") ||
    // Strava sends the full name "HighIntensityIntervalTraining"; matching only
    // the acronym left every HIIT session unclassified, so it counted towards
    // no sport at all.
    t.includes("hiit") || t.includes("hitt") ||
    t.includes("highintensity") || t.includes("intervaltraining")
  ) return "musculacao";

  // ── Tier 2, most specific first ───────────────────────────────────────────
  // Order matters: "beach tennis" must be tested before "tennis", and indoor
  // cycling before anything that merely mentions a bike.
  if (t.includes("beach") && t.includes("tennis")) return "beach_tennis";
  if (t.includes("virtualride") || t.includes("indoorcycl") || t.includes("spinning")
      || (t.includes("ride") && t.includes("virtual"))) return "bike_indoor";
  if (t.includes("hike") || t.includes("trilha") || t.includes("trail")) return "trilha";
  if (t.includes("walk") || t.includes("caminh")) return "caminhada";
  if (t.includes("yoga")) return "yoga";
  if (t.includes("pilates")) return "pilates";
  if (t.includes("stretch") || t.includes("along")) return "alongamento";
  if (t.includes("crossfit")) return "crossfit";
  if (t.includes("elliptical") || t.includes("eliptic")) return "eliptico";
  if (t.includes("stair") || t.includes("escada")) return "escada";
  if (t.includes("rowing") || t.includes("kayak") || t.includes("canoe")
      || t.includes("remo")) return "remo";
  if (t.includes("volley") || t.includes("volei") || t.includes("vôlei")) return "volei";
  if (t.includes("soccer") || t.includes("futebol")) return "futebol";
  if (t.includes("basketball") || t.includes("basquete")) return "basquete";
  if (t.includes("padel") || t.includes("pickleball")) return "padel";
  if (t.includes("tennis") || t.includes("tenis") || t.includes("squash")
      || t.includes("badminton") || t.includes("racquet")) return "tenis";
  if (t.includes("climb") || t.includes("escalada")) return "escalada";
  if (t.includes("boxing") || t.includes("martial") || t.includes("luta")
      || t.includes("jiu") || t.includes("muay")) return "luta";
  if (t.includes("dance") || t.includes("danc")) return "danca";
  if (t.includes("skate")) return "skate";
  if (t.includes("surf") || t.includes("windsurf") || t.includes("kitesurf")) return "surf";
  if (t.includes("inlineskate") || t.includes("patins")) return "patins";
  if (t.includes("functional") || t.includes("funcional")) return "funcional";

  // Recognisably a workout, but not one we name. Better a generic bucket than
  // nothing at all: it still burns calories and still counts as a training day.
  if (
    t.includes("walk") || t.includes("hike") || t.includes("caminh") ||
    t.includes("yoga") || t.includes("pilates") || t.includes("stretch") ||
    t.includes("stair") || t.includes("elliptical") || t.includes("rowing") ||
    t.includes("row") || t.includes("tennis") || t.includes("pickleball") ||
    t.includes("soccer") || t.includes("football") || t.includes("basketball") ||
    t.includes("volleyball") || t.includes("golf") || t.includes("skate") ||
    t.includes("surf") || t.includes("climb") || t.includes("boxing") ||
    t.includes("martial") || t.includes("dance") || t.includes("ski") ||
    t.includes("snowboard") || t.includes("kayak") || t.includes("canoe") ||
    t.includes("paddle") || t.includes("handcycle") || t.includes("wheelchair") ||
    t.includes("sail") || t.includes("windsurf") || t.includes("kitesurf") ||
    t.includes("workout") || t.includes("training") || t.includes("sport") ||
    t.includes("golf") || t.includes("ski") || t.includes("snowboard") ||
    t.includes("sail") || t.includes("paddle") || t.includes("handcycle") ||
    t.includes("wheelchair") || t.includes("velomobile")
  ) return "outro";

  return null;
}

/**
 * True when a plan day is a *running* session.
 *
 * `type` alone cannot answer this. A cross-training day is typed `easy` — it is
 * a light session, and the alternative was inventing a plan-day type that every
 * switch in the app would have to learn. So the athlete's Wednesday pedal, and
 * now their Tuesday pilates, both looked like runs to anything that asked
 * `type !== "rest"`: the advisor reasoned about tired legs before a yoga class,
 * and the plan card offered to move the "corrida" that was a swim.
 *
 * Days with no sport at all are runs: plans generated before the field existed
 * were running plans.
 *
 * Structurally typed rather than importing `WeeklyPlanDay` — `@/types` imports
 * this module, and the cycle would be real.
 */
export function isRunSession(day: { type?: string | null; sport?: string | null }): boolean {
  if (day.type === "rest" || day.type === "strength") return false;
  return !day.sport || day.sport === "corrida";
}

/** Category (força / cárdio) for any raw activity type. */
export function sportCategory(raw: string | null | undefined): SportCategory | null {
  const key = toSportKey(raw);
  return key ? SPORTS[key].category : null;
}

/** True when the activity belongs to the força bucket (musculação + HIIT). */
export function isStrengthActivity(raw: string | null | undefined): boolean {
  return sportCategory(raw) === "forca";
}

/** True when the activity belongs to the cárdio bucket (corrida/natação/ciclismo). */
export function isCardioActivity(raw: string | null | undefined): boolean {
  return sportCategory(raw) === "cardio";
}

/**
 * Approximate MET values per sport (compendium of physical activities,
 * moderate-effort entries). Used only to fill in missing calorie data.
 */
const MET_BY_SPORT: Record<SportKey, number> = {
  musculacao: 5.0,   // resistance training, vigorous
  corrida:    9.8,   // ~8 km/h
  natacao:    7.0,   // freestyle, moderate
  ciclismo:   7.5,   // 19-22 km/h
  // Compendium of Physical Activities, moderate-effort entries.
  bike_indoor: 7.0,
  caminhada:   3.5,
  trilha:      6.0,
  yoga:        3.0,
  pilates:     3.0,
  alongamento: 2.3,
  funcional:   6.0,
  crossfit:    8.0,
  eliptico:    5.0,
  escada:      8.0,
  remo:        7.0,
  volei:       6.0,
  futebol:     7.0,
  basquete:    6.5,
  tenis:       7.3,
  beach_tennis:6.0,
  padel:       6.0,
  escalada:    8.0,
  luta:        9.0,
  danca:       5.0,
  skate:       5.0,
  surf:        5.0,
  patins:      7.0,
  // Middling on purpose: whatever landed here is unknown by definition.
  outro:       4.5,
};

/** Higher-intensity variants that the generic sport MET underestimates. */
/**
 * Variants the sport's own MET underestimates.
 *
 * Short list by design: now that every sport carries its own value, an override
 * only earns its place when the same sport has genuinely different costs.
 */
const MET_OVERRIDES: Array<[RegExp, number]> = [
  [/hiit|hitt/i, 8.0],
];

const DEFAULT_WEIGHT_KG = 70;

/**
 * Estimate calories burned for an activity that has no recorded value.
 * kcal ≈ MET × weight(kg) × hours. Returns 0 when duration is unknown, so
 * callers can safely add it to a total.
 */
export function estimateActivityCalories(
  rawSportType: string | null | undefined,
  durationSeconds: number | null | undefined,
  weightKg?: number | null,
): number {
  if (!durationSeconds || durationSeconds <= 0) return 0;
  const key = toSportKey(rawSportType);
  if (!key) return 0;

  const override = MET_OVERRIDES.find(([re]) => re.test(rawSportType ?? ""))?.[1];
  const met      = override ?? MET_BY_SPORT[key];
  const weight   = weightKg && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG;

  return Math.round(met * weight * (durationSeconds / 3600));
}

/** Recorded calories when present, otherwise a MET-based estimate. */
export function activityCalories(
  activity: { sport_type?: string | null; duration_seconds?: number | null; calories?: number | null },
  weightKg?: number | null,
): number {
  if (activity.calories && activity.calories > 0) return activity.calories;
  return estimateActivityCalories(activity.sport_type, activity.duration_seconds, weightKg);
}

/** Sanitize a stored/received sports list, falling back to the default set. */
export function normalizeSports(input: unknown): PrimarySport[] {
  if (!Array.isArray(input)) return [...DEFAULT_SPORTS];
  // Only the plannable four: this list drives what the coach builds a plan for.
  const valid = input.filter((s): s is PrimarySport => ALL_SPORTS.includes(s as PrimarySport));
  const deduped = Array.from(new Set(valid));
  return deduped.length > 0 ? deduped : [...DEFAULT_SPORTS];
}

/**
 * Everything the athlete says they practise — the four plannable sports plus
 * whichever tier-2 ones they picked.
 *
 * Deliberately separate from `normalizeSports`: the engine must keep receiving
 * only the sports it knows how to periodise, or `buildWeekPlan` would be asked
 * to prescribe paces for pilates. This is the list the *interface* works from —
 * what to tick, what to schedule, what two athletes have in common.
 *
 * At least one primary always survives, so an athlete cannot end up with a week
 * made entirely of yoga and no plan at all.
 */
export function normalizePracticedSports(input: unknown): SportKey[] {
  if (!Array.isArray(input)) return [...DEFAULT_SPORTS];

  const valid = Array.from(new Set(
    input.filter((s): s is SportKey => isPrimarySport(s) || isSecondarySport(s)),
  ));
  const primary = valid.filter(isPrimarySport);
  const secondary = valid.filter(isSecondarySport);

  return [...(primary.length > 0 ? primary : DEFAULT_SPORTS), ...secondary];
}
