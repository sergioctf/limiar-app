"use client";

import { useEffect } from "react";
import { X, Flame, Info } from "lucide-react";
import type { CalorieDay } from "@/lib/calorie-breakdown";

/**
 * Where the day's calories went, one line per session.
 *
 * The dashboard shows a single number that quietly mixes two kinds of value:
 * what the watch measured and what we calculated from duration. This screen
 * exists to stop that from being invisible — every estimated line says so, and
 * a footnote explains the method rather than leaving the athlete to guess.
 */
export function CalorieDetailModal({
  day, label, onClose,
}: {
  day: CalorieDay;
  /** "Hoje", "Esta semana" — whatever period the number covered. */
  label: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm overlay-safe"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm p-5 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-surface-100 text-sm flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-brand-400" /> Calorias · {label}
            </h2>
            <p className="text-2xl font-bold text-surface-100 mt-1 font-mono">
              {day.total}
              <span className="text-sm text-surface-400 font-sans font-medium"> kcal</span>
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar"
            className="text-surface-500 hover:text-surface-300 p-1 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {day.lines.length === 0 ? (
          <p className="text-xs text-surface-500 py-4 text-center">
            Nenhum treino registrado neste período.
          </p>
        ) : (
          <div className="space-y-1.5">
            {day.lines.map((l, i) => {
              const pct = day.total > 0 ? Math.round((l.kcal / day.total) * 100) : 0;
              return (
                <div key={i} className="bg-surface-700/30 rounded-xl p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-surface-100 truncate flex-1">
                      {l.name}
                    </span>
                    <span className="font-mono text-xs text-surface-100 shrink-0">
                      {l.kcal} kcal
                    </span>
                  </div>

                  {/* The bar is the answer to "what cost the most?" at a glance. */}
                  <div className="h-1 bg-surface-800 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-brand-500/70 rounded-full"
                         style={{ width: `${pct}%` }} />
                  </div>

                  <p className="text-[10px] text-surface-500 mt-1.5 flex items-center gap-1.5">
                    {l.detail && <span>{l.detail}</span>}
                    <span>·</span>
                    <span>{pct}%</span>
                    <span>·</span>
                    <span className={l.source === "medido" ? "text-surface-400" : "text-yellow-500/80"}>
                      {l.source === "medido" ? "medido" : "estimado"}
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {day.hasEstimate && (
          <p className="text-[10px] text-surface-500 leading-relaxed flex items-start gap-1.5 border-t border-surface-700/60 pt-3">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            O que está marcado como estimado foi calculado a partir da duração e
            do seu peso — a maioria dos aparelhos não envia calorias de
            musculação. É aproximação, não medida.
          </p>
        )}
      </div>
    </div>
  );
}
