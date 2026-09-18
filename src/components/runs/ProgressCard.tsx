"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, CircleHelp, Info, ChevronDown } from "lucide-react";
import type { ProgressReport, Signal } from "@/lib/progress-reading";

const SIGNAL_UI: Record<Signal, { icon: React.ReactNode; color: string; label: string }> = {
  better:  { icon: <TrendingUp className="w-4 h-4" />,   color: "text-green-400",   label: "melhorando" },
  steady:  { icon: <Minus className="w-4 h-4" />,        color: "text-surface-300", label: "estável" },
  worse:   { icon: <TrendingDown className="w-4 h-4" />, color: "text-amber-400",   label: "em queda" },
  unknown: { icon: <CircleHelp className="w-4 h-4" />,   color: "text-surface-500", label: "sem dados suficientes" },
  info:    { icon: <Info className="w-4 h-4" />,         color: "text-brand-400",   label: "registro" },
};

/**
 * "O que está melhorando para você?" at the top of the history.
 *
 * The headlines are always visible; how each one was measured — which runs were
 * compared, what counted — sits one tap away, because a claim of improvement
 * is only as good as the comparison behind it.
 */
export function ProgressCard({ report }: { report: ProgressReport | null }) {
  const [open, setOpen] = useState(false);
  if (!report) return null;

  return (
    <div className="card p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="section-title">{report.question}</h2>
        <p className="text-xs text-surface-400 mt-1 leading-relaxed">{report.summary}</p>
      </div>

      <ul className="space-y-2.5">
        {report.readings.map(r => {
          const ui = SIGNAL_UI[r.signal];
          return (
            <li key={r.key} className="flex gap-2.5">
              <span className={`mt-0.5 shrink-0 ${ui.color}`} aria-label={ui.label} title={ui.label}>{ui.icon}</span>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-surface-500">{r.title}</p>
                <p className="text-sm text-surface-100 leading-snug">{r.headline}</p>
                {open && r.detail && <p className="text-xs text-surface-400 mt-0.5 leading-relaxed">{r.detail}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      {report.readings.some(r => r.detail) && (
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 min-h-[44px] text-xs text-brand-400"
          aria-expanded={open}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          {open ? "Esconder como medimos" : "Ver como medimos"}
        </button>
      )}
    </div>
  );
}
