"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Brings the latest from intervals.icu in whenever the athlete looks at the app.
 *
 * On opening, and again every time the app comes back to the foreground. An
 * installed PWA is rarely *opened* — it is resumed from the switcher, which
 * never remounts anything — so a sync that ran only on mount went stale for the
 * whole day on exactly the phones that use the app most.
 *
 * Silent, and throttled on the server rather than per device: the throttle has
 * to hold across the phone and the laptop, since both spend the same intervals.icu
 * budget. When nothing is connected the route answers without calling anyone.
 */
export function AutoWellnessSync() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const sync = () => {
      fetch("/api/integrations/intervals/sync", { method: "POST" })
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (!cancelled && d?.changed > 0) router.refresh(); })
        .catch(() => { /* not connected, offline — the cron catches up */ });
    };

    const onVisible = () => { if (document.visibilityState === "visible") sync(); };

    sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
