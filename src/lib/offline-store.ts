/**
 * Offline copy of the training plan.
 *
 * The mounted coach falls back to the authenticated account’s copy when a
 * request fails. The service worker caches public assets only.
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

function key(userId: string, weekStart: string): string {
  return `${KEY_PREFIX}${userId}:${weekStart}`;
}

/** Persist a week's plan for offline reading. Never throws. */
export function savePlanOffline(userId: string, weekStart: string, plan: WeeklyPlanData): void {
  if (typeof window === "undefined" || !userId || !weekStart || !plan) return;
  try {
    const payload: StoredPlan = { savedAt: new Date().toISOString(), plan };
    localStorage.setItem(key(userId, weekStart), JSON.stringify(payload));
    pruneOldPlans();
  } catch { /* quota or private mode — offline copy is best-effort */ }
}

/** Read a week's stored plan, or null. */
export function loadPlanOffline(userId: string, weekStart: string): { plan: WeeklyPlanData; savedAt: string } | null {
  if (typeof window === "undefined" || !userId || !weekStart) return null;
  try {
    const raw = localStorage.getItem(key(userId, weekStart));
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
      const week = k.slice(k.lastIndexOf(":") + 1);
      if (week < cutoffStr) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}
