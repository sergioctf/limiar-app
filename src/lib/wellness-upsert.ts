/**
 * Writing a day of wellness without erasing what another source wrote.
 *
 * One row per athlete per day, and more than one source filling it: intervals.icu
 * brings the night — sleep, HRV, resting heart rate — while the iPhone shortcut
 * brings the day's energy from Apple Health. An upsert of a full row replaces
 * every column in it, so whichever source wrote second silently set the other's
 * fields to null: calories arriving at 22:00 would wipe the HRV that arrived at
 * 08:00, and readiness would lose its best signal for no visible reason.
 *
 * The fix is to send only what is known. On conflict Postgres updates just the
 * columns present in the payload, so a value a source did not measure is left
 * exactly as it was.
 *
 * Rows are grouped by the columns they carry, because a bulk upsert takes the
 * union of every row's columns and fills the gaps with null — the very erasure
 * this exists to prevent, reintroduced one batch at a time.
 */

type Row = Record<string, unknown>;

/** Always sent, even when another field is missing: they identify the row. */
const KEYS = new Set(["user_id", "date", "source"]);

/** The row with every unknown value removed. */
export function compactWellnessRow<T extends Row>(row: T): Partial<T> {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (KEYS.has(k) || (v !== null && v !== undefined)) out[k] = v;
  }
  return out as Partial<T>;
}

/** True when a compacted row carries nothing beyond its identity. */
export function carriesNothing(row: Row): boolean {
  return Object.keys(row).every(k => KEYS.has(k));
}

/** Rows grouped so that every row in a group has exactly the same columns. */
export function groupByColumns<T extends Row>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const signature = Object.keys(row).sort().join(",");
    groups.set(signature, [...(groups.get(signature) ?? []), row]);
  }
  return Array.from(groups.values());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Merge rows into `wellness_data`. Returns how many rows were written, or an
 * error message — never throws, so a caller can report the failure its own way.
 */
export async function upsertWellness(
  db: Db, rows: Row[],
): Promise<{ saved: number; error: string | null }> {
  const compact = rows.map(compactWellnessRow).filter(r => !carriesNothing(r));
  let saved = 0;

  for (const group of groupByColumns(compact)) {
    const { error } = await db
      .from("wellness_data")
      .upsert(group, { onConflict: "user_id,date" });
    if (error) return { saved, error: error.message ?? String(error) };
    saved += group.length;
  }
  return { saved, error: null };
}
