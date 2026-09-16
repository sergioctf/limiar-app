"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Feather, CalendarClock, Undo2 } from "lucide-react";
import { haptic } from "@/lib/haptics";
import type { SwapOffer } from "@/lib/session-swap";

/**
 * The one-tap answer to a low recovery on a hard day.
 *
 * Shown only when there is a real decision — low readiness, a hard session, not
 * yet done — and never applied without the tap. After a swap the same place
 * offers the way back, because a decision made half-awake at 06:00 deserves an
 * undo button more than any other.
 */
export function SwapActions({ offer, compact = false }: { offer: SwapOffer; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "easy" | "tomorrow" | "undo") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/coach/today-swap", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Não foi possível trocar.");
      haptic(action === "undo" ? "tap" : "success");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível trocar.");
      haptic("warn");
    } finally {
      setBusy(null);
    }
  }

  if (offer.undo) {
    return (
      <div className={compact ? "" : "mt-1"}>
        <button
          onClick={() => run("undo")} disabled={busy != null}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-surface-400 hover:text-surface-200"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
          Desfazer a troca de hoje
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${offer.options.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {offer.options.includes("easy") && (
          <button onClick={() => run("easy")} disabled={busy != null} className="btn-primary text-sm">
            {busy === "easy" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Feather className="w-4 h-4" />}
            Trocar por leve
          </button>
        )}
        {offer.options.includes("tomorrow") && (
          <button onClick={() => run("tomorrow")} disabled={busy != null} className="btn-secondary text-sm">
            {busy === "tomorrow" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
            Passar pra amanhã
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
