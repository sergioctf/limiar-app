"use client";

import Link from "next/link";
import { Target, TrendingDown, Check, AlertTriangle, Flag, ChevronRight } from "lucide-react";
import { secondsToReadable, secondsToPaceString } from "@/lib/utils";
import type { TargetComparison, TargetStatus } from "@/lib/target-comparison";

interface Props {
  comparison: TargetComparison;
}

const STATUS_CONFIG: Record<TargetStatus, {
  label: string; color: string; bg: string; border: string; icon: React.ReactNode; barColor: string;
}> = {
  ahead: {
    label: "À frente da meta", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/25",
    icon: <Check className="w-4 h-4" />, barColor: "bg-green-500",
  },
  on_track: {
    label: "No caminho certo", color: "text-brand-400", bg: "bg-brand-500/10", border: "border-brand-500/25",
    icon: <TrendingDown className="w-4 h-4" />, barColor: "bg-brand-500",
  },
  slightly_behind: {
    label: "Quase lá", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/25",
    icon: <TrendingDown className="w-4 h-4" />, barColor: "bg-yellow-500",
  },
  behind: {
    label: "Precisa acelerar", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/25",
    icon: <AlertTriangle className="w-4 h-4" />, barColor: "bg-red-500",
  },
};

export function TargetRaceCard({ comparison: c }: Props) {
  const cfg = STATUS_CONFIG[c.status];

  // Gauge: position current vs target on a track. Cap the visual gap at 30s/km.
  const cappedGap = Math.min(Math.abs(c.gapSecPerKm), 30);
  const fillPct = c.status === "ahead" ? 100 : Math.max(8, 100 - (cappedGap / 30) * 100);

  return (
    <Link href="/goals" className={`card-hover p-4 sm:p-5 block relative overflow-hidden border ${cfg.border}`}>
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${cfg.barColor}`} />

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
            <Target className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <p className="stat-label">Prova-alvo</p>
            <p className="text-sm font-bold text-surface-100 leading-tight line-clamp-1">{c.raceName}</p>
          </div>
        </div>
        {c.daysUntil !== null && c.daysUntil >= 0 && (
          <div className="text-right shrink-0">
            <p className={`text-xl font-black tabular-nums leading-none ${
              c.daysUntil <= 7 ? "text-red-400" : c.daysUntil <= 30 ? "text-yellow-400" : "text-brand-300"
            }`}>{c.daysUntil}</p>
            <p className="text-[10px] text-surface-600">{c.daysUntil === 1 ? "dia" : "dias"}</p>
          </div>
        )}
      </div>

      {/* Current vs Target */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-surface-700/30 rounded-xl p-3">
          <p className="text-[10px] text-surface-500 uppercase tracking-wide mb-0.5">Forma atual</p>
          <p className="font-mono font-bold text-surface-200 text-sm">{secondsToReadable(c.currentTimeSeconds)}</p>
          <p className="text-[11px] text-surface-500">{secondsToPaceString(c.currentPaceSecPerKm)}/km</p>
        </div>
        <div className={`rounded-xl p-3 ${cfg.bg}`}>
          <p className="text-[10px] text-surface-500 uppercase tracking-wide mb-0.5">Meta</p>
          <p className={`font-mono font-bold text-sm ${cfg.color}`}>{secondsToReadable(c.targetTimeSeconds)}</p>
          <p className="text-[11px] text-surface-500">{secondsToPaceString(c.targetPaceSecPerKm)}/km</p>
        </div>
      </div>

      {/* Gap gauge */}
      <div className="space-y-1.5">
        <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.barColor}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold flex items-center gap-1 ${cfg.color}`}>
            {cfg.icon}{cfg.label}
          </span>
          <span className="text-xs text-surface-400">
            {c.status === "ahead"
              ? `${secondsToPaceString(Math.abs(c.gapSecPerKm))}/km de folga`
              : `faltam ${secondsToPaceString(c.gapSecPerKm)}/km`}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 mt-3 text-[11px] text-surface-600">
        <Flag className="w-3 h-3" />
        {c.distanceKm} km
        <ChevronRight className="w-3 h-3 ml-auto" />
      </div>
    </Link>
  );
}
