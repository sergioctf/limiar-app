"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Check, X, ArrowRight } from "lucide-react";
import type { WeeklyPlanDay } from "@/types";

interface Suggestion {
  id: string;
  reason: string;
  message: string;
  original_day: WeeklyPlanDay;
  suggested_day: WeeklyPlanDay;
}

function dayLabel(d: WeeklyPlanDay): string {
  return d.distance_km != null ? `${d.label} · ${d.distance_km} km` : d.label;
}

// Check at most once per page-load session (AppShell remounts on navigation).
let checkedThisSession = false;

/**
 * Readiness-driven plan suggestion pop-up. Appears once per day when readiness
 * is low on a hard/long session. The athlete approves or keeps the plan —
 * nothing changes automatically.
 */
export function SuggestionModal() {
  const router = useRouter();
  const [sug, setSug] = useState<Suggestion | null>(null);
  const [acting, setActing] = useState<"accept" | "dismiss" | null>(null);

  useEffect(() => {
    if (checkedThisSession) return;   // avoid the heavy GET on every navigation
    checkedThisSession = true;
    let cancelled = false;
    fetch("/api/coach/suggestion")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.suggestion) setSug(d.suggestion); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function act(action: "accept" | "dismiss") {
    setActing(action);
    try {
      await fetch("/api/coach/suggestion", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setSug(null);
      if (action === "accept") router.refresh();
    } finally {
      setActing(null);
    }
  }

  if (!sug) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="card w-full max-w-sm p-5 space-y-4 animate-slide-in-up">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h2 className="font-bold text-surface-100">Sugestão do treinador</h2>
            <p className="text-[11px] text-yellow-400">{sug.reason}</p>
          </div>
        </div>

        <p className="text-sm text-surface-300 leading-relaxed">{sug.message}</p>

        {/* Before → after */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex-1 bg-surface-700/40 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-surface-500 uppercase">Planejado</p>
            <p className="text-surface-300 font-medium mt-0.5">{dayLabel(sug.original_day)}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-surface-500 shrink-0" />
          <div className="flex-1 bg-brand-500/10 border border-brand-500/20 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-brand-400 uppercase">Sugerido</p>
            <p className="text-brand-300 font-medium mt-0.5">{dayLabel(sug.suggested_day)}</p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={() => act("dismiss")} disabled={!!acting} className="btn-secondary flex-1 justify-center">
            {acting === "dismiss" ? <Loader2 className="w-4 h-4 animate-spin" /> : <><X className="w-4 h-4" /> Manter plano</>}
          </button>
          <button onClick={() => act("accept")} disabled={!!acting} className="btn-primary flex-1 justify-center">
            {acting === "accept" ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Aceitar</>}
          </button>
        </div>
      </div>
    </div>
  );
}
