"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AUTO_SYNC_KEY, shouldAutoSync } from "@/lib/strava-enrich";

/**
 * Pulls new Strava activities when the athlete opens the app.
 *
 * The webhook delivers in real time and a daily job catches what it drops, but
 * between those two there is still a window where opening the app shows
 * yesterday — and the athlete goes to settings and presses sync by hand, which
 * is exactly the behaviour the whole integration exists to remove.
 *
 * Throttled to once every 20 minutes, stored per device. Strava allows 100
 * requests per 15 minutes for the *entire application*, so a sync on every
 * navigation would spend everyone's budget and take the webhook down with it.
 *
 * Deliberately quiet: it renders nothing unless something arrived. A spinner on
 * every load would make the app feel slower than it is, for a job that has
 * nothing to say most of the time.
 */
export function AutoStravaSync({ onImported }: { onImported?: () => void }) {
  const [imported, setImported] = useState(0);

  useEffect(() => {
    let last: string | null = null;
    try { last = localStorage.getItem(AUTO_SYNC_KEY); } catch { /* sem storage */ }
    if (!shouldAutoSync(last)) return;

    // Written before the request, not after: a failed or slow sync must not
    // leave the door open for another attempt on the next render.
    try { localStorage.setItem(AUTO_SYNC_KEY, new Date().toISOString()); } catch { /* sem storage */ }

    let cancelled = false;
    fetch("/api/strava/sync", { method: "POST" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d) return;
        const novos = (d.imported ?? 0) + (d.activitiesImported ?? 0);
        if (novos > 0) { setImported(novos); onImported?.(); }
      })
      .catch(() => {
        // No Strava connection, offline, or rate limited. All normal, and none
        // of them are worth an error message on the dashboard.
      });

    return () => { cancelled = true; };
  }, [onImported]);

  if (imported === 0) return null;

  return (
    <div className="card p-3 flex items-center gap-2.5 border-brand-500/30">
      <RefreshCw className="w-4 h-4 text-brand-400 shrink-0" />
      <p className="text-xs text-surface-300">
        {imported === 1
          ? "1 treino novo veio do Strava."
          : `${imported} treinos novos vieram do Strava.`}{" "}
        <button onClick={() => window.location.reload()}
          className="text-brand-400 hover:text-brand-300 font-semibold">
          Atualizar
        </button>
      </p>
    </div>
  );
}
