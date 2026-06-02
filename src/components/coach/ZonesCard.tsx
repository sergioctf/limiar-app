"use client";

import type { HRZone } from "@/lib/performance";
import { cn } from "@/lib/utils";

interface Props {
  zones: HRZone[];
  lthr: number;
  hrmax: number;
}

export function ZonesCard({ zones, lthr, hrmax }: Props) {
  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-surface-100">Zonas de FC (Friel)</h3>
        <div className="flex gap-3 text-xs text-surface-500">
          <span>LTHR <span className="text-surface-300 font-semibold">{lthr} bpm</span></span>
          <span>FCmax <span className="text-surface-300 font-semibold">{hrmax} bpm</span></span>
        </div>
      </div>

      <div className="space-y-2">
        {zones.map((zone) => (
          <div
            key={zone.zone}
            className="flex items-stretch gap-3 bg-surface-700/40 rounded-xl overflow-hidden"
          >
            {/* Colored sidebar */}
            <div className={cn("w-1.5 shrink-0 rounded-l-xl", zone.color)} />

            {/* Content */}
            <div className="flex-1 py-2.5 pr-3 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-bold", zone.textColor)}>
                    Z{zone.zone}
                  </span>
                  <span className="text-sm font-semibold text-surface-200">{zone.name}</span>
                </div>
                <span className="text-sm font-mono font-semibold text-surface-300 shrink-0">
                  {zone.max_bpm !== null
                    ? `${zone.min_bpm} – ${zone.max_bpm} bpm`
                    : `≥ ${zone.min_bpm} bpm`}
                </span>
              </div>
              <p className="text-xs text-surface-500 mt-0.5 leading-relaxed">
                {zone.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-surface-600 pt-1">
        * Zonas calculadas pelo método Friel baseado no LTHR estimado do teste.
      </p>
    </div>
  );
}
