"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Loader2, CheckCircle2 } from "lucide-react";
import type { WeekAdherence } from "@/lib/plan-adherence";

interface Props {
  currentWeek: WeekAdherence;
}

/**
 * Shown when the athlete deviated from this week's plan. One tap asks the
 * AI coach to replan the remaining days (past days stay untouched).
 */
export function ProactiveAdjustBanner({ currentWeek }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const deviations = currentWeek.missedCount + currentWeek.partialCount;
  if (deviations === 0 && state === "idle") return null;

  async function handleAdjust() {
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/coach/weekly-plan/adjust", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no ajuste");
      setMessage(data.message);
      setState("done");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao ajustar o plano");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="card p-4 border-green-500/25 bg-green-500/5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-surface-100 mb-1">Semana replanejada ✓</p>
            <p className="text-xs text-surface-300 leading-relaxed">{message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4 border-yellow-500/25 bg-yellow-500/5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-surface-100">
            {currentWeek.missedCount > 0
              ? `${currentWeek.missedCount} treino${currentWeek.missedCount > 1 ? "s" : ""} perdido${currentWeek.missedCount > 1 ? "s" : ""} esta semana`
              : "Treinos parciais esta semana"}
          </p>
          <p className="text-xs text-surface-400 mt-0.5">
            O treinador pode reorganizar o resto da semana de forma segura — sem tentar compensar tudo.
          </p>
          {state === "error" && message && (
            <p className="text-xs text-red-400 mt-1">{message}</p>
          )}
        </div>
        <button
          onClick={handleAdjust}
          disabled={state === "loading"}
          className="btn-primary shrink-0"
        >
          {state === "loading"
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Replanejando…</>
            : <><Wand2 className="w-4 h-4" /> Ajustar semana</>}
        </button>
      </div>
    </div>
  );
}
