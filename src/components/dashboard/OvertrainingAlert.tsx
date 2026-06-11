"use client";

import { useState } from "react";
import { AlertTriangle, ShieldAlert, ChevronDown, ChevronUp, Activity } from "lucide-react";
import type { OvertrainingAssessment } from "@/lib/overtraining";

interface Props {
  assessment: OvertrainingAssessment;
}

export function OvertrainingAlert({ assessment }: Props) {
  const [open, setOpen] = useState(false);

  // Only render when there's something to flag
  if (assessment.level === "ok" || assessment.signals.length === 0) return null;

  const isHigh = assessment.level === "high";
  const cfg = isHigh
    ? { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", bar: "bg-red-500", icon: <ShieldAlert className="w-5 h-5" /> }
    : { color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", bar: "bg-yellow-500", icon: <AlertTriangle className="w-5 h-5" /> };

  return (
    <div className={`card p-4 sm:p-5 relative overflow-hidden border ${cfg.border} ${cfg.bg}`}>
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${cfg.bar}`} />

      <button onClick={() => setOpen(!open)} className="w-full text-left">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.color}`}>
            {cfg.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={`font-bold ${cfg.color}`}>
              {isHigh ? "Atenção: sinais de sobrecarga" : "Monitorar recuperação"}
            </h2>
            <p className="text-xs text-surface-400 mt-0.5">
              {assessment.signals.length} sinal{assessment.signals.length !== 1 ? "is" : ""} detectado{assessment.signals.length !== 1 ? "s" : ""}
              {" · "}TSB {assessment.tsb.toFixed(0)} · ACWR {assessment.acwr.toFixed(2)}
            </p>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-surface-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-surface-500 shrink-0" />}
        </div>
      </button>

      {/* Recommendation — always visible */}
      <div className="mt-3 flex items-start gap-2">
        <Activity className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
        <p className="text-sm text-surface-300 leading-relaxed">{assessment.recommendation}</p>
      </div>

      {/* Detailed signals — expandable */}
      {open && (
        <div className="mt-3 pt-3 border-t border-surface-700/50 space-y-2">
          {assessment.signals.map(signal => (
            <div key={signal.id} className="flex items-start gap-2">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${signal.severity === "high" ? "bg-red-400" : "bg-yellow-400"}`} />
              <div>
                <p className="text-sm font-semibold text-surface-200">{signal.label}</p>
                <p className="text-xs text-surface-500 leading-relaxed">{signal.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
