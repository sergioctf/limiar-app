/**
 * Keeping the advisor's inbox to one card per open finding.
 *
 * The advisor writes a suggestion when it spots something worth changing, and
 * it re-runs every week. The de-duplication was scoped to `week_start`, which
 * quietly meant "one row per week per finding" — so a condition the athlete had
 * not acted on accumulated a copy every time the advisor looked. In the real
 * database that was five identical "seu split treina cada grupo 1×/semana"
 * cards for one athlete and five for another, out of 28 rows total.
 *
 * The inbox then showed all of them, which is worse than noise: a repeated
 * suggestion reads as a *new* suggestion, so the athlete believes the app has
 * found five problems when it has found one.
 *
 * A finding that is still open is one finding. It gets one row, refreshed —
 * because the evidence text ages ("15 sessões prescritas" becomes 18) and a
 * stale card is its own kind of wrong.
 */

/** How long a dismissal silences a finding. */
export const DISMISS_COOLDOWN_DAYS = 28;

export interface AdvisorFinding {
  key: string;
  area: string;
  severity: string;
  title: string;
  evidence: string;
  proposal: string;
  rationale: string;
  actionLabel?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: any;
}

export interface SuggestionRow {
  id: string;
  finding_key: string;
  area: string;
  severity: string;
  title: string;
  evidence: string;
  proposal: string;
  rationale: string;
  action_label: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: any;
  status: string;
  week_start: string;
  created_at: string;
}

export interface Reconciliation {
  /** Findings with no open row — new cards. */
  toInsert: Array<Record<string, unknown>>;
  /** Findings that already have an open row — refresh it in place. */
  toUpdate: Array<{ id: string; values: Record<string, unknown> }>;
  /** Keys silenced by a recent dismissal. */
  muted: string[];
}

function columnsFor(f: AdvisorFinding, weekStart: string): Record<string, unknown> {
  return {
    finding_key:  f.key,
    week_start:   weekStart,
    area:         f.area,
    severity:     f.severity,
    title:        f.title,
    evidence:     f.evidence,
    proposal:     f.proposal,
    rationale:    f.rationale,
    action_label: f.actionLabel ?? null,
    patch:        f.patch,
  };
}

/**
 * Work out what to write for this week's findings.
 *
 * Only *pending* rows are reused. A dismissed row is deliberately left alone so
 * the cooldown can expire and produce a genuinely new card; an accepted row
 * describes a situation the athlete already acted on, so a finding that returns
 * after that is a new occurrence and deserves its own row.
 */
export function reconcileSuggestions(
  findings: AdvisorFinding[],
  existing: SuggestionRow[],
  weekStart: string,
  now: Date = new Date(),
): Reconciliation {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - DISMISS_COOLDOWN_DAYS);

  const muted = new Set(
    existing
      .filter(r => r.status === "dismissed" && new Date(r.created_at) > cutoff)
      .map(r => r.finding_key),
  );

  // Newest first, so a key with several stale rows reuses the most recent.
  const openByKey = new Map<string, SuggestionRow>();
  for (const r of [...existing]
    .filter(r => r.status === "pending")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!openByKey.has(r.finding_key)) openByKey.set(r.finding_key, r);
  }

  const toInsert: Array<Record<string, unknown>> = [];
  const toUpdate: Array<{ id: string; values: Record<string, unknown> }> = [];

  for (const f of findings) {
    if (muted.has(f.key)) continue;
    const open = openByKey.get(f.key);
    if (open) toUpdate.push({ id: open.id, values: columnsFor(f, weekStart) });
    else toInsert.push(columnsFor(f, weekStart));
  }

  return { toInsert, toUpdate, muted: Array.from(muted) };
}

/**
 * What the inbox should actually show.
 *
 * Collapses any duplicates already sitting in the table — the reconciliation
 * above stops new ones appearing, but it cannot retroactively merge the rows
 * an athlete has already accumulated.
 *
 * A row survives if its finding is still true, or if it was raised this week:
 * something detected today and gone by this afternoon confuses more than it
 * informs.
 */
export function dedupeForDisplay(
  rows: SuggestionRow[],
  liveKeys: Set<string>,
  weekStart: string,
): SuggestionRow[] {
  const relevant = rows.filter(r => liveKeys.has(r.finding_key) || r.week_start === weekStart);

  const newestByKey = new Map<string, SuggestionRow>();
  for (const r of relevant) {
    const seen = newestByKey.get(r.finding_key);
    if (!seen || r.created_at > seen.created_at) newestByKey.set(r.finding_key, r);
  }
  return Array.from(newestByKey.values());
}
