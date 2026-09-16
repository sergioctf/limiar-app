"use client";

import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import {
  NOTIFICATION_KINDS, NOTIFICATION_LABELS, DEFAULT_NOTIFICATION_PREFS,
  type NotificationKind, type NotificationPrefs,
} from "@/lib/notification-prefs";

/**
 * What the app is allowed to send.
 *
 * Sits under the push permission button because it is the second half of the
 * same decision: the browser prompt asks whether the app may speak, this asks
 * what about. Without it, someone who wanted the morning workout but not a
 * friend's every run had to revoke the permission and lose both.
 */
export function NotificationPrefsCard() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState<NotificationKind | null>(null);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications/prefs")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setPrefs(d?.prefs ?? DEFAULT_NOTIFICATION_PREFS); })
      .catch(() => { if (!cancelled) setPrefs(DEFAULT_NOTIFICATION_PREFS); });
    return () => { cancelled = true; };
  }, []);

  if (!prefs) {
    return (
      <p className="text-xs text-surface-500 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando preferências…
      </p>
    );
  }

  async function toggle(kind: NotificationKind) {
    const next = { ...prefs!, [kind]: !prefs![kind] };
    setPrefs(next);                 // optimistic — a switch that lags reads as broken
    setSaving(kind);
    setError(null);
    try {
      const res = await fetch("/api/notifications/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Send only what changed: the route merges, so two tabs cannot undo
        // each other's other switches.
        body: JSON.stringify({ [kind]: next[kind] }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Não foi possível salvar.");
        setPrefs(prefs);
      }
    } catch {
      setError("Falha na conexão.");
      setPrefs(prefs);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-2 pt-3 mt-3 border-t border-surface-700">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold">
          O que você quer receber
        </p>
        {saved && <Check className="w-3.5 h-3.5 text-green-400" />}
      </div>

      {NOTIFICATION_KINDS.map(kind => {
        const on = prefs[kind];
        return (
          <button
            key={kind}
            onClick={() => toggle(kind)}
            disabled={saving !== null}
            role="switch"
            aria-checked={on}
            className="w-full flex items-start gap-3 text-left rounded-xl p-2.5 hover:bg-surface-700/40 transition-colors disabled:opacity-60"
          >
            <span
              aria-hidden
              className={`mt-0.5 w-9 h-5 rounded-full shrink-0 relative transition-colors ${
                on ? "bg-brand-500" : "bg-surface-600"
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                on ? "left-[1.125rem]" : "left-0.5"
              }`} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-surface-200 font-medium">
                {NOTIFICATION_LABELS[kind].label}
              </span>
              <span className="block text-[11px] text-surface-500 leading-relaxed">
                {NOTIFICATION_LABELS[kind].detail}
              </span>
            </span>
            {saving === kind && <Loader2 className="w-3.5 h-3.5 animate-spin text-surface-500 shrink-0 mt-1" />}
          </button>
        );
      })}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
