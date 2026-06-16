"use client";

import { Gauge, Watch, PencilLine } from "lucide-react";
import type { Readiness, ReadinessVerdict } from "@/lib/readiness";

const VERDICT_UI: Record<ReadinessVerdict, { label: string; ring: string; text: string; glow: string }> = {
  alta:     { label: "Prontidão alta",     ring: "#34d399", text: "text-green-400",  glow: "shadow-green-500/20" },
  moderada: { label: "Prontidão moderada", ring: "#fbbf24", text: "text-yellow-400", glow: "shadow-yellow-500/20" },
  baixa:    { label: "Prontidão baixa",    ring: "#f87171", text: "text-red-400",    glow: "shadow-red-500/20" },
};

export function ReadinessCard({ readiness }: { readiness: Readiness }) {
  const ui = VERDICT_UI[readiness.verdict];
  const R = 52, C = 2 * Math.PI * R;
  const dash = (readiness.score / 100) * C;

  return (
    <div className={`card p-5 shadow-lg ${ui.glow}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Limiar Score · prontidão de hoje</h2>
        </div>
        {(readiness.source === "wearable" || readiness.source === "mixed") && (
          <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
            <Watch className="w-3 h-3" /> dados do relógio
          </span>
        )}
        {readiness.source === "manual" && (
          <span className="flex items-center gap-1 text-[10px] text-surface-500 bg-surface-700/40 rounded-full px-2 py-0.5">
            <PencilLine className="w-3 h-3" /> check-in manual
          </span>
        )}
      </div>

      <div className="flex items-center gap-5">
        {/* Gauge ring */}
        <div className="relative shrink-0" style={{ width: 128, height: 128 }}>
          <svg viewBox="0 0 128 128" className="w-32 h-32 -rotate-90">
            <circle cx="64" cy="64" r={R} fill="none" stroke="currentColor" strokeWidth="10" className="text-surface-700" />
            <circle
              cx="64" cy="64" r={R} fill="none" stroke={ui.ring} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`} style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-black tabular-nums ${ui.text}`}>{readiness.score}</span>
            <span className="text-[10px] text-surface-500">/ 100</span>
          </div>
        </div>

        {/* Verdict + recommendation */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${ui.text}`}>{ui.label}</p>
          <p className="text-xs text-surface-400 leading-relaxed mt-1">{readiness.recommendation}</p>
          {readiness.source === "manual" && (
            <p className="text-[11px] text-surface-600 mt-2">Conecte um relógio (app nativo) para a prontidão automática via sono/HRV.</p>
          )}
          {readiness.source === "none" && (
            <p className="text-[11px] text-surface-600 mt-2">Faça o check-in de hoje ou conecte um relógio para calcular sua prontidão.</p>
          )}
        </div>
      </div>

      {/* Component breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        {readiness.components.map(c => (
          <div key={c.key} className="bg-surface-700/30 rounded-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-surface-500 truncate">{c.label}</span>
              <span className="text-[10px] font-bold text-surface-300 tabular-nums">{c.score}</span>
            </div>
            <div className="h-1 rounded-full bg-surface-700 overflow-hidden">
              <div
                className={`h-full rounded-full ${c.score >= 70 ? "bg-green-500" : c.score >= 45 ? "bg-yellow-500" : "bg-red-500"}`}
                style={{ width: `${c.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
