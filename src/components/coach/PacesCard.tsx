"use client";

import { cn } from "@/lib/utils";
import { paceToString } from "@/lib/performance";
import type { TrainingPace } from "@/lib/performance";

interface Props {
  paces: TrainingPace[];
}

export function PacesCard({ paces }: Props) {
  return (
    <div className="card p-5 space-y-3">
      <h3 className="font-bold text-surface-100">Ritmos de Treino</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {paces.map((pace) => (
          <div
            key={pace.name}
            className="bg-surface-700/40 rounded-xl p-3 space-y-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-xs font-bold uppercase tracking-wide", pace.color)}>
                {pace.label}
              </span>
              <span className="text-sm font-mono font-semibold text-surface-200 shrink-0">
                {paceToString(pace.pace_max_sec)} – {paceToString(pace.pace_min_sec)}
                <span className="text-xs text-surface-500 font-normal">/km</span>
              </span>
            </div>
            <p className="text-xs text-surface-500 leading-relaxed">
              {pace.description}
            </p>
          </div>
        ))}
      </div>

      <p className="text-xs text-surface-600 pt-1">
        * Ritmos derivados do vVO2max via Jack Daniels.
      </p>
    </div>
  );
}
