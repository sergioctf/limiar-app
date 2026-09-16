/**
 * Who to suggest as a friend, and why.
 *
 * Same contract as the training engines: this is a pure function over data the
 * caller already loaded. No AI writes the reason — a suggestion that says
 * "vocês treinam nos mesmos dias" has to be true, and the only way to guarantee
 * that is to compute it.
 *
 * The reason matters as much as the person. "Talvez você conheça" is noise;
 * "3 amigos em comum" is a decision the athlete can actually make.
 */

export type SuggestionKind = "amigos_em_comum" | "novo_no_app" | "perfil_parecido" | "descobrir";

export interface SuggestionCandidate {
  id:         string;
  name:       string | null;
  username:   string | null;
  createdAt:  string | null;
  sports?:    string[] | null;
  runDays?:   string[] | null;
  birthDate?: string | null;
  /** Weekly running volume, when known — a rough proxy for training level. */
  weeklyKm?:  number | null;
}

export interface FriendSuggestion {
  userId:   string;
  name:     string | null;
  username: string | null;
  kind:     SuggestionKind;
  /** Shown to the athlete. Always a fact, never a guess. */
  reason:   string;
  /** Mutual friends, when that is what drove the suggestion. */
  mutuals:  number;
  score:    number;
}

export interface Edge { a: string; b: string; accepted: boolean }

/** How recently someone must have joined to count as new. */
export const NEW_USER_WEEKS = 4;

const DAY_PT: Record<string, string> = {
  Mon: "segunda", Tue: "terça", Wed: "quarta", Thu: "quinta",
  Fri: "sexta", Sat: "sábado", Sun: "domingo",
};

function weeksBetween(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  return (b - a) / (7 * 86_400_000);
}

function ageFrom(birthDate: string | null | undefined, today: string): number | null {
  if (!birthDate) return null;
  const years = weeksBetween(birthDate, today) / 52.18;
  return Number.isFinite(years) && years > 5 && years < 110 ? years : null;
}

/**
 * A small deterministic hash, used to rotate the order week by week.
 *
 * The alternative — a random shuffle — would reorder the list on every page
 * load, so an athlete could never come back to someone they meant to add.
 * Seeding on the week keeps it stable until Monday, then moves it.
 */
function seededRank(userId: string, candidateId: string, weekStart: string): number {
  const s = `${userId}:${candidateId}:${weekStart}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Rank candidates for one athlete.
 *
 * `edges` carries every friendship the caller could see — accepted ones build
 * the mutual-friend graph, pending ones only exist to be excluded. Anyone
 * already connected or already asked never appears.
 */
export function suggestFriends(
  me: { id: string; sports?: string[] | null; runDays?: string[] | null; birthDate?: string | null; weeklyKm?: number | null },
  candidates: SuggestionCandidate[],
  edges: Edge[],
  opts: { weekStart: string; today?: string; limit?: number } = { weekStart: "1970-01-05" },
): FriendSuggestion[] {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const limit = opts.limit ?? 5;

  // Everyone I am connected to or have already asked — including requests sent
  // to me. Suggesting someone whose invitation is sitting in my inbox is the
  // fastest way to look broken.
  const connected = new Set<string>([me.id]);
  const friendsOf = new Map<string, Set<string>>();

  for (const e of edges) {
    if (e.a === me.id) connected.add(e.b);
    if (e.b === me.id) connected.add(e.a);
    if (!e.accepted) continue;
    for (const [x, y] of [[e.a, e.b], [e.b, e.a]] as const) {
      const set = friendsOf.get(x) ?? new Set<string>();
      set.add(y);
      friendsOf.set(x, set);
    }
  }

  const myFriends = friendsOf.get(me.id) ?? new Set<string>();
  const mySports  = new Set(me.sports ?? []);
  const myDays    = new Set(me.runDays ?? []);
  const myAge     = ageFrom(me.birthDate, today);

  const out: FriendSuggestion[] = [];

  for (const c of candidates) {
    if (connected.has(c.id)) continue;

    const theirFriends = friendsOf.get(c.id) ?? new Set<string>();
    const mutuals = Array.from(myFriends).filter(f => theirFriends.has(f)).length;

    const joinedWeeks = c.createdAt ? weeksBetween(c.createdAt, today) : Infinity;
    const isNew = joinedWeeks <= NEW_USER_WEEKS;

    const sharedSports = (c.sports ?? []).filter(s => mySports.has(s));
    const sharedDays   = (c.runDays ?? []).filter(d => myDays.has(d));
    const theirAge     = ageFrom(c.birthDate, today);
    const closeAge     = myAge != null && theirAge != null && Math.abs(myAge - theirAge) <= 6;
    const closeVolume  = me.weeklyKm != null && c.weeklyKm != null && me.weeklyKm > 0 && c.weeklyKm > 0
      && Math.abs(me.weeklyKm - c.weeklyKm) / Math.max(me.weeklyKm, c.weeklyKm) <= 0.35;

    let kind: SuggestionKind;
    let reason: string;
    let score: number;

    if (mutuals > 0) {
      kind = "amigos_em_comum";
      reason = mutuals === 1 ? "1 amigo em comum" : `${mutuals} amigos em comum`;
      score = 100 + mutuals * 10;
    } else if (isNew) {
      kind = "novo_no_app";
      const w = Math.max(0, Math.round(joinedWeeks));
      reason = w <= 0 ? "Entrou esta semana no Limiar"
        : w === 1 ? "Entrou há 1 semana no Limiar"
        : `Entrou há ${w} semanas no Limiar`;
      score = 70;
    } else if (sharedSports.length > 0 || sharedDays.length >= 2 || closeAge || closeVolume) {
      kind = "perfil_parecido";
      // The most concrete fact wins — a shared training day is more convincing
      // than "similar age", and far more convincing than nothing.
      reason =
        sharedDays.length >= 2
          ? `Também treina ${sharedDays.slice(0, 2).map(d => DAY_PT[d] ?? d).join(" e ")}`
          : closeVolume
            ? `Volume semanal parecido com o seu (~${Math.round(c.weeklyKm!)} km)`
            : sharedSports.length > 0
              ? `Também pratica ${sharedSports[0]}`
              : "Idade parecida com a sua";
      score = 40 + sharedDays.length * 3 + sharedSports.length * 2 + (closeVolume ? 5 : 0);
    } else {
      kind = "descobrir";
      reason = "Está no Limiar";
      score = 10;
    }

    out.push({ userId: c.id, name: c.name, username: c.username, kind, reason, mutuals, score });
  }

  // Rotate within a score band rather than across it: mutual friends always
  // outrank a stranger, but two strangers swap places from one week to the next
  // so the list does not calcify.
  return out
    .sort((a, b) =>
      b.score - a.score ||
      seededRank(me.id, a.userId, opts.weekStart) - seededRank(me.id, b.userId, opts.weekStart) ||
      a.userId.localeCompare(b.userId))
    .slice(0, limit);
}

/**
 * Why the list is short, when it is.
 *
 * With a handful of accounts there is nothing to suggest, and saying so plainly
 * beats an empty panel that reads as a bug.
 */
export function shortfallNote(shown: number, wanted: number, totalOthers: number): string | null {
  if (shown >= wanted) return null;
  if (totalOthers === 0) return "Ninguém mais por aqui ainda — você é dos primeiros.";
  if (shown === 0) return "Você já se conectou com todo mundo que está no app.";
  return "Por enquanto é isso: o Limiar ainda tem poucos usuários.";
}
