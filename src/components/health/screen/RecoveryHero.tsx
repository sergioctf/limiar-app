"use client";

import { Watch, Activity, PencilLine, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Ring } from "@/components/ui/Ring";
import { CountUp } from "@/components/shared/CountUp";
import { SwapActions } from "@/components/today/SwapActions";
import { basisLabel, type RecoveryToday } from "@/lib/recovery-today";
import type { Tone } from "@/components/ui/tone";
import type { ReadinessVerdict } from "@/lib/readiness";

const VERDICT_TONE: Record<ReadinessVerdict, Tone> = { alta: "good", moderada: "warn", baixa: "alert" };

interface Props {
  recovery: RecoveryToday;
  trend: { avg: number; change: number | null } | null;
  checkedIn: boolean;
  onCheckin: () => void;
}

/**
 * Recovery — the answer the screen exists for, and what to do about it.
 *
 * The number is enormous and nothing else competes with it. Directly under it is
 * the decision it implies for today's actual session, and — when the decision is
 * to ease off — the buttons that make it, because a readiness score the athlete
 * has to act on in another tab is a score they will not act on.
 */
export function RecoveryHero({ recovery, trend, checkedIn, onCheckin }: Props) {
  const verdict = recovery.verdict ?? "moderada";
  const tone = VERDICT_TONE[verdict];
  const scored = recovery.score != null;
  const watchy = recovery.basis === "watch" || recovery.calibratingNights != null;

  return (
    <div className="limiar-feature p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-surface-500">Recuperação</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
          recovery.basis === "watch" ? "bg-emerald-500/10 text-emerald-400" : "bg-surface-700/60 text-surface-400"
        }`}>
          {watchy ? <Watch className="w-3 h-3" /> : recovery.basis === "checkin" ? <PencilLine className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
          {basisLabel(recovery)}
        </span>
      </div>

      <div className="flex flex-col items-center pt-4 pb-2">
        <Ring ratio={scored ? recovery.score! / 100 : 0} size={170} thickness={12} tone={tone} label={scored ? "de 100" : undefined} chrome>
          {scored ? <CountUp value={recovery.score!} duration={1100} className="text-5xl" /> : <span className="text-4xl">—</span>}
        </Ring>

        <h2 className="mt-4 text-2xl font-black tracking-tight text-surface-100 text-center">{recovery.advice.headline}</h2>
        <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-surface-400">{recovery.advice.detail}</p>
        {recovery.readiness.cap && (
          <p className="mt-2 max-w-md text-center text-xs text-surface-500">{recovery.readiness.cap.reason}</p>
        )}
      </div>

      {recovery.offer && (
        <div className="mt-3">
          <SwapActions offer={recovery.offer} />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-surface-700/60 pt-3">
        {trend ? (
          <div className="flex items-center gap-2 text-xs text-surface-400">
            <span>Média 7 dias</span>
            <span className="font-bold tabular-nums text-surface-200">{trend.avg}</span>
            {trend.change != null && (
              Math.abs(trend.change) <= 2 ? (
                // A change of one or two points is noise; calling it "-1" invites worry over nothing.
                <span className="inline-flex items-center gap-0.5 text-surface-500"><Minus className="w-3.5 h-3.5" /> estável</span>
              ) : (
                <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${trend.change > 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {trend.change > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {trend.change > 0 ? "+" : ""}{trend.change}
                </span>
              )
            )}
          </div>
        ) : (
          <span className="text-xs text-surface-500">A tendência aparece com uma semana de dados</span>
        )}

        <button
          onClick={onCheckin}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-surface-600 px-3.5 text-xs font-semibold text-surface-200 transition-all hover:border-brand-500/50 active:scale-95"
        >
          <PencilLine className="w-3.5 h-3.5 text-brand-400" />
          {checkedIn ? "Editar check-in" : "Como você está?"}
        </button>
      </div>
    </div>
  );
}
