/**
 * Two gaps between what Strava knows and what the app stored.
 *
 * **Calories.** Watches measure them and send them to Strava, but the activity
 * *list* endpoint omits the field — only the per-activity detail carries it.
 * Every import path except the webhook read the list, so 147 sessions landed
 * with `calories: null` and the app fell back to a MET estimate for burns that
 * had actually been measured. The estimate stays as the fallback; it should
 * never be the default when a real number exists.
 *
 * **Freshness.** The webhook delivers in real time and a daily job catches what
 * it drops, which still leaves a window where opening the app shows yesterday.
 * Syncing on open closes it — throttled, because "on open" must not mean "on
 * every navigation".
 */

export interface StravaListActivity {
  id: number;
  calories?: number | null;
  type?: string;
  sport_type?: string;
}

/** Strava allows 100 requests per 15 minutes; detail calls are one each. */
export const MAX_DETAIL_FETCHES = 25;

/**
 * Which activities are worth spending a detail request on.
 *
 * Only those missing calories, newest first, and never more than the budget —
 * an athlete importing a year of history must not burn the rate limit that the
 * webhook depends on.
 */
export function activitiesNeedingDetail<T extends StravaListActivity>(
  activities: T[],
  max: number = MAX_DETAIL_FETCHES,
): T[] {
  return activities
    .filter(a => a.calories == null || a.calories <= 0)
    .slice(0, Math.max(0, max));
}

/**
 * Merge a detail response over its list counterpart.
 *
 * Only fills gaps: a value already present in the list is never overwritten by
 * the detail, so a re-sync cannot quietly rewrite history.
 */
export function mergeDetail<T extends StravaListActivity>(
  listActivity: T,
  detail: Partial<StravaListActivity> | null | undefined,
): T {
  if (!detail) return listActivity;
  const merged = { ...listActivity };
  if ((merged.calories == null || merged.calories <= 0) && detail.calories && detail.calories > 0) {
    merged.calories = detail.calories;
  }
  return merged;
}

export const AUTO_SYNC_KEY = "limiar-last-strava-sync";
/** Long enough that navigating does not trigger it; short enough to feel live. */
export const AUTO_SYNC_MINUTES = 20;

/**
 * Whether opening the app should trigger a background sync.
 *
 * Pure so the throttle can be tested without a clock or a browser — the failure
 * this prevents is a sync on every route change, which would exhaust Strava's
 * rate limit and make the webhook stop working for everyone.
 */
export function shouldAutoSync(
  lastSyncIso: string | null | undefined,
  now: Date = new Date(),
  minMinutes: number = AUTO_SYNC_MINUTES,
): boolean {
  if (!lastSyncIso) return true;
  const last = new Date(lastSyncIso).getTime();
  if (!Number.isFinite(last)) return true;
  // A stored time in the future means a wrong clock, not a recent sync.
  if (last > now.getTime()) return true;
  return now.getTime() - last >= minMinutes * 60_000;
}
