"use client";

import { useEffect } from "react";

/**
 * Bridge between the native shell (Capacitor) and the web app.
 *
 * The native layer reads Garmin-sourced wellness from Health Connect (Android)
 * / HealthKit (iOS) and hands it to the WebView in ONE of two ways:
 *
 *   1. Dispatches a CustomEvent:
 *        window.dispatchEvent(new CustomEvent("limiar:wellness", { detail: { days: [...] } }))
 *   2. Or calls the global the WebView exposes:
 *        window.LimiarReceiveWellness({ days: [...] })
 *
 * Either way this component POSTs the payload to /api/health/wellness using the
 * shared session cookie. It's an inert no-op in a normal browser (no native
 * layer ever fires), so it's safe to render anywhere.
 *
 * Payload contract (each day): {
 *   date: "YYYY-MM-DD", sleep_seconds, sleep_score, hrv_ms, hrv_status,
 *   resting_hr, stress_avg, body_battery, source: "healthconnect"|"healthkit"
 * }
 */
export function NativeHealthSync() {
  useEffect(() => {
    async function push(detail: unknown) {
      try {
        const payload = detail && typeof detail === "object" && "days" in (detail as object)
          ? detail
          : { days: Array.isArray(detail) ? detail : [detail] };
        await fetch("/api/health/wellness", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "healthconnect", ...(payload as object) }),
        });
      } catch {
        // best-effort — a failed sync just retries next launch
      }
    }

    const onEvent = (e: Event) => push((e as CustomEvent).detail);
    window.addEventListener("limiar:wellness", onEvent);
    // Global hook the native layer can call directly
    (window as unknown as { LimiarReceiveWellness?: (d: unknown) => void }).LimiarReceiveWellness = push;

    return () => {
      window.removeEventListener("limiar:wellness", onEvent);
      delete (window as unknown as { LimiarReceiveWellness?: unknown }).LimiarReceiveWellness;
    };
  }, []);

  return null;
}
