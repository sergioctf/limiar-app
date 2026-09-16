"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2, Check, X } from "lucide-react";

/**
 * "Seu plano não reflete o que mudou."
 *
 * Regenerating was a button with no reason attached, so nobody pressed it and
 * plans quietly drifted from the configuration that produced them. This says
 * what moved and offers one tap — and it only appears when something actually
 * did move.
 *
 * Next week has already been rebuilt by the time this renders; the banner is
 * about the week in progress, which is the only one where overwriting could
 * take away something the athlete has already done.
 */
export function PlanFreshnessBanner() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/weekly-plan/freshness")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return;
        if (d.stale) setMessage(d.message as string);

        // Next week rebuilds on its own, and deliberately without being waited
        // on: generating a plan includes an AI call, and blocking the banner's
        // own request behind it froze the page for the best part of a minute.
        // Nothing on screen depends on the result — next week is a tab away.
        if (d.nextWeekStale) {
          void fetch("/api/coach/weekly-plan/freshness", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ week: "next" }),
          }).catch(() => {});
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!message || dismissed) return null;

  async function update() {
    setState("saving");
    try {
      const res = await fetch("/api/coach/weekly-plan/freshness", { method: "POST" });
      if (!res.ok) { setState("idle"); return; }
      setState("done");
      // The plan on screen came from the server; without this the banner
      // announces success above the very sessions it just replaced.
      router.refresh();
      setTimeout(() => setMessage(null), 2500);
    } catch {
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="card p-3 flex items-center gap-2 border-green-500/30 bg-green-500/[0.06]">
        <Check className="w-4 h-4 text-green-400 shrink-0" />
        <p className="text-xs text-surface-300">Plano atualizado — esta semana e a próxima.</p>
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-3 border-brand-500/30 bg-brand-500/[0.05]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-surface-100 text-sm">Seu plano está desatualizado</h3>
          <p className="text-[11px] text-surface-400 leading-relaxed mt-0.5">
            {message} O plano desta semana ainda é o anterior.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dispensar"
          className="text-surface-500 hover:text-surface-300 shrink-0 min-h-[44px] min-w-[36px] flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <button onClick={update} disabled={state === "saving"} className="btn-primary w-full">
        {state === "saving"
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Atualizando…</>
          : <><RefreshCw className="w-4 h-4" /> Atualizar esta semana e a próxima</>}
      </button>

      <p className="text-[10px] text-surface-500 leading-relaxed">
        A próxima semana já foi atualizada sozinha. Esta pergunta porque você pode
        já ter treinado nela.
      </p>
    </div>
  );
}
