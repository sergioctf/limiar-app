/**
 * Who an athlete is, as far as the app is concerned: a first name, a surname,
 * and a handle.
 *
 * This is not paperwork. Every social surface — suggestions, leaderboard, feed,
 * kudos — shows a person to another person, and "pedro" with no surname next to
 * "Sérgio Carmelo" reads as a broken account rather than a teammate. The friend
 * search needs a handle that resolves, and a handle nobody chose ends up being
 * derived from an e-mail prefix, which leaks the address.
 *
 * Names are validated, never invented. The one thing this module will not do is
 * fabricate a surname for someone who has not given one.
 */

export interface Identity {
  firstName: string;
  lastName:  string;
  username:  string;
}

export interface IdentityProblems {
  firstName?: string;
  lastName?:  string;
  username?:  string;
}

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Reserved so a handle can never shadow a route or impersonate the app. */
const RESERVED = new Set([
  "admin", "api", "app", "limiar", "suporte", "support", "root", "system",
  "settings", "coach", "runs", "friends", "goals", "races", "health", "me",
  "new", "null", "undefined", "login", "signup", "logout", "auth",
]);

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Title case that leaves Portuguese connectives alone: "Ana de Souza". */
function titleCase(part: string): string {
  const small = new Set(["de", "da", "do", "das", "dos", "e", "di", "del", "van", "von"]);
  return part
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      const lower = w.toLocaleLowerCase("pt-BR");
      if (i > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
    })
    .join(" ");
}

/**
 * Split a single stored `name` into first and last.
 *
 * Existing profiles keep one free-text field, so the surname has to be read out
 * of it rather than assumed missing. Everything after the first word is the
 * surname — "Ana Paula de Souza" gives "Ana" and "Paula de Souza", which is
 * wrong for compound first names and right for the common case. The athlete can
 * correct it; that is what the form is for.
 */
export function splitFullName(full: string | null | undefined): { firstName: string; lastName: string } {
  // Case is fixed on the whole name before splitting: "da" is lowercase because
  // it sits in the middle of "João da Silva", and title-casing the surname on
  // its own loses that context and yields "Da Silva".
  const parts = titleCase((full ?? "").trim()).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function fullNameOf(identity: { firstName: string; lastName: string }): string {
  return `${identity.firstName} ${identity.lastName}`.trim().replace(/\s+/g, " ");
}

/** Normalise a handle the way it will be stored and compared. */
export function normalizeUsername(raw: string | null | undefined): string {
  return stripAccents(raw ?? "")
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_.]/g, "")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, USERNAME_MAX);
}

function nameProblem(value: string, label: string): string | undefined {
  const v = value.trim();
  if (v.length === 0) return `Informe seu ${label}.`;
  if (v.length < 2) return `${label[0].toUpperCase()}${label.slice(1)} curto demais.`;
  // Digits in a name are almost always an e-mail prefix leaking through.
  if (/\d/.test(v)) return `${label[0].toUpperCase()}${label.slice(1)} não deve conter números.`;
  if (!/[a-zà-ÿ]/i.test(v)) return `${label[0].toUpperCase()}${label.slice(1)} inválido.`;
  return undefined;
}

/**
 * What is wrong with an identity, field by field. Empty object means valid.
 *
 * `taken` is passed in rather than queried here so this stays a pure function —
 * the caller owns the database, this owns the rules.
 */
export function identityProblems(
  identity: Partial<Identity>,
  opts: { taken?: string[] } = {},
): IdentityProblems {
  const problems: IdentityProblems = {};

  const first = nameProblem(identity.firstName ?? "", "nome");
  if (first) problems.firstName = first;

  const last = nameProblem(identity.lastName ?? "", "sobrenome");
  if (last) problems.lastName = last;

  const username = normalizeUsername(identity.username);
  if (username.length === 0) problems.username = "Escolha um @username.";
  else if (username.length < USERNAME_MIN) problems.username = `Mínimo de ${USERNAME_MIN} caracteres.`;
  else if (RESERVED.has(username)) problems.username = "Esse username é reservado.";
  else if ((opts.taken ?? []).map(t => normalizeUsername(t)).includes(username)) {
    problems.username = "Esse username já está em uso.";
  }

  return problems;
}

export function isIdentityComplete(identity: Partial<Identity>, opts: { taken?: string[] } = {}): boolean {
  return Object.keys(identityProblems(identity, opts)).length === 0;
}

/**
 * Handle suggestions built from the athlete's own name.
 *
 * Never from the e-mail: deriving `sctcarmelo` from an address publishes part of
 * it to every leaderboard the athlete appears on.
 */
export function suggestUsernames(
  identity: { firstName?: string; lastName?: string },
  taken: string[] = [],
): string[] {
  const first = normalizeUsername(identity.firstName);
  const last  = normalizeUsername(identity.lastName);
  if (!first) return [];

  const used = new Set(taken.map(t => normalizeUsername(t)));
  const bases = [
    last ? `${first}${last}` : "",
    last ? `${first}.${last}` : "",
    last ? `${first}${last.slice(0, 1)}` : "",
    first,
  ].filter(b => b.length >= USERNAME_MIN);

  const out: string[] = [];
  for (const base of bases) {
    const candidate = base.slice(0, USERNAME_MAX);
    if (!used.has(candidate) && !RESERVED.has(candidate) && !out.includes(candidate)) {
      out.push(candidate);
    }
  }

  // Guarantee at least one usable option even when every shape is taken.
  for (let n = 1; out.length === 0 && n <= 99; n++) {
    const candidate = `${bases[0] ?? first}${n}`.slice(0, USERNAME_MAX);
    if (!used.has(candidate)) out.push(candidate);
  }

  return out.slice(0, 3);
}

/**
 * True when a stored profile still needs the athlete's attention.
 *
 * A name equal to the e-mail prefix counts as missing: that is what the signup
 * fallback wrote, not something a person typed.
 */
export function profileNeedsIdentity(
  profile: { name?: string | null; username?: string | null } | null | undefined,
  email?: string | null,
): boolean {
  const name = (profile?.name ?? "").trim();
  const prefix = (email ?? "").split("@")[0].toLowerCase();
  if (name.length > 0 && prefix.length > 0 && name.toLowerCase() === prefix) return true;

  const { firstName, lastName } = splitFullName(name);
  return !isIdentityComplete({ firstName, lastName, username: profile?.username ?? "" });
}
