/**
 * Which shoe for which session, and when the shoe is finished.
 *
 * Deterministic, like the rest of the engine. The rules come from how the shoes
 * are actually built, not from taste:
 *
 *   • A carbon plate returns energy and wears out fast doing it. Its foam is
 *     tuned for a handful of hard efforts, not for a Tuesday. Racing in it is
 *     the point; training in it spends the races you have left.
 *   • An easy run is the one that should feel like nothing. Maximum cushioning,
 *     maximum comfort — the shoe you would wear all day.
 *   • Quality sessions sit between: firm enough to return something at pace,
 *     durable enough to do it twice a week.
 *
 * Rotation is not a preference either. Alternating pairs lets the foam recover
 * between runs and is one of the few habits with real evidence behind it for
 * reducing running injuries, so within a category the freshest pair wins.
 */

export type ShoeCategory = "placa" | "tempo" | "rodagem" | "trail";

export interface Shoe {
  id:         string;
  name:       string;
  brand?:     string | null;
  category:   ShoeCategory;
  /** Kilometres already on the shoe when it was registered. */
  initial_km: number;
  retired:    boolean;
  notes?:     string | null;
}

export interface ShoeMeta {
  label:  string;
  /** One line the athlete can act on. */
  hint:   string;
  emoji:  string;
  /** Kilometres at which the shoe should be replaced. */
  lifespanKm: number;
}

export const SHOE_CATEGORIES: ShoeCategory[] = ["rodagem", "tempo", "placa", "trail"];

export const SHOE_META: Record<ShoeCategory, ShoeMeta> = {
  rodagem: {
    label: "Rodagem",
    hint:  "O mais confortável. Rodagem, regenerativo e longão — onde você passa mais tempo em pé.",
    emoji: "🛋️",
    // Modern daily trainers hold up well; the foam, not the outsole, is the limit.
    lifespanKm: 700,
  },
  tempo: {
    label: "Ritmo",
    hint:  "Conforto com retorno. Tiro e limiar, sem gastar a placa.",
    emoji: "⚡",
    lifespanKm: 500,
  },
  placa: {
    label: "Placa",
    hint:  "Prova, pré-prova e teste de 3 km. Só isso — cada quilômetro aqui é um que falta no dia que importa.",
    emoji: "🏅",
    // Super-shoe foam degrades far faster than a trainer's. Racing only is what
    // keeps a pair alive for a season instead of two months.
    lifespanKm: 250,
  },
  trail: {
    label: "Trail",
    hint:  "Terra, pedra e trilha. Grip que no asfalto só atrapalha.",
    emoji: "🥾",
    lifespanKm: 700,
  },
};

// ─── Which category a session wants ──────────────────────────────────────────

/** The plan-day shape this module needs — kept structural so it also accepts runs. */
export interface SessionLike {
  type?:  string | null;
  sport?: string | null;
  label?: string | null;
}

export interface ShoeContext {
  /** Days until the athlete's next race, when there is one. */
  daysToRace?: number | null;
  /** Periodization phase, so a taper can be recognised without a race date. */
  phase?: "base" | "build" | "peak" | "taper" | "race" | null;
}

/**
 * The category a session ideally calls for, or null when shoes are beside the
 * point (rest, lifting, swimming).
 */
export function idealCategory(session: SessionLike, ctx: ShoeContext = {}): ShoeCategory | null {
  const type = (session.type ?? "").toLowerCase();

  // Not a run at all.
  if (type === "rest" || type === "strength") return null;
  if (session.sport && session.sport !== "corrida") {
    return session.sport === "trilha" ? "trail" : null;
  }

  // Race day and the 3 km test are the same thing to a shoe: an all-out effort
  // whose result the athlete will compare against other all-out efforts. Racing
  // one in a plate and the other in a trainer makes the comparison a lie.
  if (type === "race" || type === "test") return "placa";

  const quality = type === "intervals" || type === "tempo";

  // Pré-prova: the sharpening session inside the taper is the rehearsal. It is
  // the one training run worth spending plate mileage on — better to discover a
  // hot spot now than at kilometre 30.
  if (quality && isRaceWeekish(ctx)) return "placa";

  if (quality) return "tempo";

  // easy, recovery, long_run, steady, progression — comfort wins.
  return "rodagem";
}

/** Inside the two weeks where sessions are rehearsals rather than stimulus. */
function isRaceWeekish(ctx: ShoeContext): boolean {
  if (ctx.daysToRace != null && ctx.daysToRace >= 0 && ctx.daysToRace <= 14) return true;
  return ctx.phase === "taper" || ctx.phase === "race";
}

// ─── Mileage and wear ────────────────────────────────────────────────────────

export interface RunLike {
  shoe_id?:     string | null;
  distance_km?: number | null;
}

/** Total kilometres on a shoe: what it arrived with, plus what it has run here. */
export function shoeMileage(shoe: Shoe, runs: RunLike[]): number {
  const logged = runs
    .filter(r => r.shoe_id === shoe.id)
    .reduce((total, r) => total + (r.distance_km ?? 0), 0);
  return Math.round((Number(shoe.initial_km ?? 0) + logged) * 10) / 10;
}

export type WearStatus = "novo" | "rodando" | "atencao" | "trocar";

export interface Wear {
  km:       number;
  lifespan: number;
  /** 0–1+, where 1 means the shoe has reached its expected lifespan. */
  ratio:    number;
  status:   WearStatus;
  note:     string;
}

export function wearOf(shoe: Shoe, runs: RunLike[]): Wear {
  const km = shoeMileage(shoe, runs);
  const lifespan = SHOE_META[shoe.category].lifespanKm;
  const ratio = lifespan > 0 ? km / lifespan : 0;

  const status: WearStatus =
    ratio >= 1    ? "trocar"
    : ratio >= 0.8 ? "atencao"
    : ratio >= 0.1 ? "rodando"
    : "novo";

  const remaining = Math.max(0, Math.round(lifespan - km));
  const note =
    status === "trocar"  ? `Passou dos ${lifespan} km. A espuma já devolveu o que tinha — é hora de aposentar.`
    : status === "atencao" ? `Faltam ~${remaining} km. Vale começar a procurar o substituto antes que acabe no meio de um bloco.`
    : status === "novo"    ? "Praticamente novo."
    : `Faltam ~${remaining} km até a troca.`;

  return { km, lifespan, ratio, status, note };
}

// ─── The suggestion ──────────────────────────────────────────────────────────

export interface ShoeSuggestion {
  shoe:   Shoe;
  /** The category the session actually wanted. */
  wanted: ShoeCategory;
  /** True when no shoe of the wanted category was available. */
  substitute: boolean;
  /** One sentence explaining the choice, ready to render. */
  reason: string;
}

/**
 * When the ideal category is empty, what to reach for instead.
 *
 * Ordered by how little the compromise costs. Note that `tempo` falls back to
 * `rodagem` before `placa`: running a tiro in a cushioned trainer costs a bit of
 * sharpness, while running it in the race shoe costs a race.
 */
const FALLBACK: Record<ShoeCategory, ShoeCategory[]> = {
  placa:   ["tempo", "rodagem"],
  tempo:   ["rodagem", "placa"],
  rodagem: ["tempo", "placa"],
  trail:   ["rodagem", "tempo"],
};

export function suggestShoe(
  session: SessionLike,
  shoes: Shoe[],
  runs: RunLike[] = [],
  ctx: ShoeContext = {},
): ShoeSuggestion | null {
  const wanted = idealCategory(session, ctx);
  if (!wanted) return null;

  const available = shoes.filter(s => !s.retired);
  if (available.length === 0) return null;

  const exact = freshest(available.filter(s => s.category === wanted), runs);
  if (exact) {
    return { shoe: exact, wanted, substitute: false, reason: reasonFor(wanted, session, ctx) };
  }

  for (const alt of FALLBACK[wanted]) {
    const pick = freshest(available.filter(s => s.category === alt), runs);
    if (!pick) continue;
    return {
      shoe: pick,
      wanted,
      substitute: true,
      reason:
        `Esta sessão pediria um tênis de ${SHOE_META[wanted].label.toLowerCase()}, ` +
        `e você não tem nenhum cadastrado. ${SHOE_META[alt].label} é o que chega mais perto.`,
    };
  }

  return null;
}

/**
 * The least-used pair in a category.
 *
 * Ties break by name so the same week always produces the same answer — a
 * suggestion that changes on refresh is not a suggestion.
 */
function freshest(candidates: Shoe[], runs: RunLike[]): Shoe | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const diff = shoeMileage(a, runs) - shoeMileage(b, runs);
    return diff !== 0 ? diff : a.name.localeCompare(b.name, "pt-BR");
  })[0];
}

function reasonFor(category: ShoeCategory, session: SessionLike, ctx: ShoeContext): string {
  const type = (session.type ?? "").toLowerCase();

  if (category === "placa") {
    if (type === "race") return "Dia de prova — é exatamente para isto que a placa existe.";
    if (type === "test")  return "Teste de 3 km é esforço máximo: com a placa o resultado é comparável ao da prova.";
    return "Sessão de pré-prova: rodar com a placa agora é o ensaio, e é onde você descobre qualquer incômodo a tempo.";
  }

  if (category === "tempo") {
    return "Treino forte: retorno no ritmo sem gastar a placa, que fica guardada para a prova.";
  }

  if (category === "trail") {
    return "Terreno irregular pede grip — o solado de asfalto escorrega onde este segura.";
  }

  return type === "long_run"
    ? "Longão é onde você passa mais tempo em pé: vá no mais confortável, não no mais rápido."
    : "Rodagem tranquila: conforto acima de tudo, este é o tênis que não deve te lembrar que existe.";
}

// ─── Input hygiene ───────────────────────────────────────────────────────────

export function isShoeCategory(value: unknown): value is ShoeCategory {
  return SHOE_CATEGORIES.includes(value as ShoeCategory);
}

/** Clean a shoe coming off a form or an API body. Returns null when unusable. */
export function normalizeShoeInput(raw: unknown): {
  name: string; brand: string | null; category: ShoeCategory;
  initial_km: number; retired: boolean; notes: string | null;
} | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (name.length === 0) return null;

  const km = Number(r.initial_km);

  return {
    name: name.slice(0, 80),
    brand: typeof r.brand === "string" && r.brand.trim() ? r.brand.trim().slice(0, 40) : null,
    category: isShoeCategory(r.category) ? r.category : "rodagem",
    // Negative or absurd mileage is a typo, not a preference.
    initial_km: Number.isFinite(km) && km > 0 ? Math.min(Math.round(km * 10) / 10, 5000) : 0,
    retired: r.retired === true,
    notes: typeof r.notes === "string" && r.notes.trim() ? r.notes.trim().slice(0, 300) : null,
  };
}
