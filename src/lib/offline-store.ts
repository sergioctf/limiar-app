/**
 * Offline copy of the training plan.
 *
 * The service worker caches pages and API responses, but a cached page can be
 * from a previous week and there's no way to tell from the HTML. Keeping the
 * plan in localStorage keyed by its week makes the fallback explicit: we either
 * have THIS week's plan or we don't, and the UI can say which.
 *
 * This is what makes the day's workout readable in a gym basement or on a
 * street with no signal — the one moment the athlete actually needs it.
 */
import { localDateStr } from "@/lib/week";
import type { WeeklyPlanData } from "@/types";

const KEY_PREFIX = "limiar_plan_";
const KEEP_WEEKS = 3;          // current, next, and last — older is noise

interface StoredPlan {
  savedAt: string;             // ISO
  plan:    WeeklyPlanData;
}

function key(weekStart: string): string {
  return `${KEY_PREFIX}${weekStart}`;
}

/** Persist a week's plan for offline reading. Never throws. */
export function savePlanOffline(weekStart: string, plan: WeeklyPlanData): void {
  if (typeof window === "undefined" || !weekStart || !plan) return;
  try {
    const payload: StoredPlan = { savedAt: new Date().toISOString(), plan };
    localStorage.setItem(key(weekStart), JSON.stringify(payload));
    pruneOldPlans();
  } catch { /* quota or private mode — offline copy is best-effort */ }
}

/** Read a week's stored plan, or null. */
export function loadPlanOffline(weekStart: string): { plan: WeeklyPlanData; savedAt: string } | null {
  if (typeof window === "undefined" || !weekStart) return null;
  try {
    const raw = localStorage.getItem(key(weekStart));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPlan;
    if (!parsed?.plan || !Array.isArray(parsed.plan.days)) return null;
    return { plan: parsed.plan, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

/** Drop plans older than the retention window so storage doesn't grow forever. */
function pruneOldPlans(): void {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - KEEP_WEEKS * 7);
    const cutoffStr = localDateStr(cutoff);

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(KEY_PREFIX)) continue;
      const week = k.slice(KEY_PREFIX.length);
      if (week < cutoffStr) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}
