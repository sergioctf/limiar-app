/**
 * Week arithmetic on the athlete's own calendar, for the browser.
 *
 * The bug this exists to prevent: computing a date from local components and
 * then serialising it with `toISOString()`, which converts to UTC.
 *
 *   const monday = new Date(now);
 *   monday.setDate(now.getDate() - daysSinceMonday);   // local
 *   return monday.toISOString().slice(0, 10);          // UTC ← wrong
 *
 * The intermediate Date keeps the current time of day, so any evening after
 * 21:00 in Brazil the UTC date is already tomorrow and the result is Monday
 * plus one — a Tuesday. The server, which computes the week correctly, then
 * rejected it as "Semana inválida", and the plan looked ungenerated.
 *
 * Serialise from local components and the whole class of bug disappears.
 */

/** YYYY-MM-DD from a Date's local calendar fields — never via UTC. */
export function localDateStr(d: Date = new Date()): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Monday of the week containing `d`, on the local calendar. */
export function localMondayStr(d: Date = new Date()): string {
  const monday = new Date(d);
  monday.setHours(12, 0, 0, 0);                       // midday: immune to DST shifts
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDateStr(monday);
}

/** Monday of the following week. */
export function localNextMondayStr(d: Date = new Date()): string {
  const next = new Date(`${localMondayStr(d)}T12:00:00`);
  next.setDate(next.getDate() + 7);
  return localDateStr(next);
}

/** Monday of the previous week. */
export function localPreviousMondayStr(d: Date = new Date()): string {
  const prev = new Date(`${localMondayStr(d)}T12:00:00`);
  prev.setDate(prev.getDate() - 7);
  return localDateStr(prev);
}

// ─── The athlete's calendar, wherever the code runs ───────────────────────────

/**
 * The helpers above read the *machine's* local calendar. In the browser that is
 * the athlete's, which is what they were written for. On Vercel it is UTC — and
 * between 21:00 and midnight in Brazil, UTC is already tomorrow.
 *
 * That is not a hypothetical. At 22:58 on a Saturday the dashboard's server
 * component computed "today" as Sunday, decided a new week had started, and
 * wiped the week's totals off the top of the page while the cards below —
 * computed in the browser — went on counting correctly.
 *
 * These operate on the absolute instant and shift it, so they give the same
 * answer on the server and in the browser. Use them for anything the athlete
 * sees as "today" or "this week".
 */
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

/** The instant, shifted so its UTC fields read as São Paulo wall-clock time. */
export function toAthleteTime(d: Date = new Date()): Date {
  return new Date(d.getTime() + BRT_OFFSET_MS);
}

/** Today on the athlete's calendar (YYYY-MM-DD), correct on server and client. */
export function athleteDateStr(d: Date = new Date()): string {
  return toAthleteTime(d).toISOString().slice(0, 10);
}

/**
 * Monday of the athlete's current week (YYYY-MM-DD).
 *
 * Monday to Sunday, always. The week is one rule across the whole app: plans,
 * totals, charts, leaderboards and notifications all have to agree, or the same
 * Sunday belongs to two different weeks depending on which card you read.
 */
export function athleteMondayStr(d: Date = new Date()): string {
  const t = toAthleteTime(d);
  t.setUTCHours(12, 0, 0, 0);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

/** `n` days before today, on the athlete's calendar. */
export function athleteDaysAgoStr(n: number, d: Date = new Date()): string {
  return athleteDateStr(new Date(d.getTime() - n * 86_400_000));
}

/**
 * O nome curto do dia, em português.
 *
 * O calendário do plano mostrava `MO`, `TU`, `WE` — as duas primeiras letras da
 * chave interna, que é inglesa. Ninguém escreve a semana assim em português, e
 * "SA"/"SU" ainda colidem para quem lê rápido (sábado e domingo começam igual
 * em inglês, não em português).
 */
export const DAY_SHORT_PT: Record<string, string> = {
  Mon: "seg", Tue: "ter", Wed: "qua", Thu: "qui", Fri: "sex", Sat: "sáb", Sun: "dom",
};

const DAY_ORDER_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** O dia do mês em que aquele dia da semana cai, dada a segunda-feira. */
export function dateOfWeekDay(weekStart: string, day: string): number | null {
  const i = DAY_ORDER_KEYS.indexOf(day);
  if (i < 0) return null;
  const d = new Date(`${weekStart}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + i);
  return d.getDate();
}
