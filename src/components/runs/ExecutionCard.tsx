"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Target, Loader2, Check, ChevronsRight, ChevronsLeft, Heart, Info, TrendingUp, AlertTriangle,
} from "lucide-react";
import { secondsToPaceString } from "@/lib/utils";
import type { ExecutionAnalysis, ExecutedKm, ExecutionSeverity } from "@/lib/workout-execution";

interface Payload {
  available: boolean;
  reason?: string;
  planned?: { label: string; type: string; distance_km?: number; pace?: string };
  analysis?: ExecutionAnalysis;
}

const VERDICT_UI: Record<ExecutedKm["verdict"], { bar: string; text: string; icon: React.ReactNode | null }> = {
  dentro:   { bar: "bg-green-500",  text: "text-green-400",  icon: <Check className="w-3 h-3" /> },
  rapido:   { bar: "bg-orange-400", text: "text-orange-400", icon: <ChevronsRight className="w-3 h-3" /> },
  lento:    { bar: "bg-blue-400",   text: "text-blue-400",   icon: <ChevronsLeft className="w-3 h-3" /> },
  sem_alvo: { bar: "bg-surface-600", text: "text-surface-500", icon: null },
};

const SEVERITY_UI: Record<ExecutionSeverity, { ring: string; icon: React.ReactNode }> = {
  alerta:  { ring: "border-red-500/25 bg-red-500/[0.05]",       icon: <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> },
  atencao: { ring: "border-yellow-500/20 bg-yellow-500/[0.04]", icon: <Info className="w-3.5 h-3.5 text-yellow-400" /> },
  boa:     { ring: "border-green-500/20 bg-green-500/[0.04]",   icon: <TrendingUp className="w-3.5 h-3.5 text-green-400" /> },
};

/**
 * Prescribed against executed.
 *
 * The point is not the score — it is seeing *where* the run drifted. An average
 * pace hides a workout that started 15 s/km fast and fell apart; a row per
 * kilometre does not.
 */
export function ExecutionCard({ runId, hasStrava, splitsLoaded }: {
  runId: string;
  hasStrava: boolean;
  /** The splits cache is filled by the streams request — wait for it. */
  splitsLoaded: boolean;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/execution`);
      setData(await res.json());
    } catch {
      setData({ available: false, reason: "error" });
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    if (splitsLoaded) void load();
  }, [splitsLoaded, load]);

  if (!hasStrava || !splitsLoaded) return null;

  if (loading) {
    return (
      <div className="card p-5 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-surface-500" />
        <p className="text-sm text-surface-400">Comparando com o plano…</p>
      </div>
    );
  }

  const analysis = data?.analysis;
  if (!data || !analysis || analysis.kms.length === 0) return null;

  // An unplanned run has no prescription to compare against, but the pacing
  // analysis still stands — how you distributed the effort does not depend on
  // whether the run was on the plan. Hiding it here would throw away the most
  // useful thing the card knows.
  const unplanned = !data.available;

  const paces = analysis.kms.map(k => k.actualPaceSec);
  const maxPace = Math.max(...paces), minPace = Math.min(...paces);
  const range = Math.max(maxPace - minPace, 1);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className={`w-4 h-4 ${unplanned ? "text-surface-500" : "text-brand-400"}`} />
          <h2 className="section-title">
            {unplanned ? "Como você distribuiu o esforço" : "Previsto × executado"}
          </h2>
        </div>
        {analysis.onTargetPct != null && (
          <span className="text-xs font-mono text-surface-300">
            {Math.round(analysis.onTargetPct * 100)}% no alvo
          </span>
        )}
      </div>

      {data.planned && !unplanned && (
        <p className="text-xs text-surface-400">
          Prescrito: <span className="text-surface-200 font-semibold">{data.planned.label}</span>
          {data.planned.distance_km != null && <> · {data.planned.distance_km} km</>}
          {data.planned.pace && <> · <span className="font-mono">{data.planned.pace}</span></>}
          {" · "}você correu <span className="text-surface-200 font-mono">{analysis.actualKm} km</span>
        </p>
      )}

      {unplanned && (
        <p className="text-xs text-surface-500">
          {data.reason === "no_plan"
            ? "Não havia plano nesta semana, então não há prescrição para comparar."
            : "Treino extra — não estava no plano."}
          {" "}O ritmo km a km continua valendo.
        </p>
      )}

      {analysis.uncalibrated && (
        <p className="text-[11px] text-yellow-300/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 leading-relaxed">
          O plano desta semana ainda não tinha ritmos-alvo — faça o teste de 3 km para
          que a comparação passe a valer km a km.
        </p>
      )}

      {/* ── Findings first: they are the point ──────────────────────────────── */}
      {analysis.findings.length > 0 && (
        <div className="space-y-2">
          {analysis.findings.map(f => {
            const ui = SEVERITY_UI[f.severity];
            return (
              <div key={f.key} className={`border rounded-lg p-2.5 ${ui.ring}`}>
                <div className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">{ui.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-surface-100">{f.title}</p>
                    <p className="text-[11px] text-surface-400 leading-relaxed mt-0.5">{f.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── The kilometre table ─────────────────────────────────────────────── */}
      <div className="space-y-1">
        {analysis.kms.map(k => {
          const ui = VERDICT_UI[k.verdict];
          const width = 25 + ((maxPace - k.actualPaceSec) / range) * 70;
          return (
            <div key={k.km} className="flex items-center gap-2 text-[11px]">
              <span className="font-mono text-surface-500 w-7 shrink-0 text-right">
                {k.distanceKm >= 0.95 ? k.km : `${k.distanceKm.toFixed(1)}`}
              </span>

              <div className="flex-1 min-w-0 h-5 bg-surface-800 rounded overflow-hidden relative">
                <div className={`h-full ${ui.bar} opacity-30`} style={{ width: `${width}%` }} />
                <span className="absolute inset-0 flex items-center px-2 gap-2">
                  <span className="font-mono font-semibold text-surface-100">
                    {secondsToPaceString(k.actualPaceSec)}
                  </span>
                  {k.targetLabel && (
                    <span className="text-surface-500 font-mono truncate">
                      alvo {k.targetLabel.replace("/km", "")}
                    </span>
                  )}
                </span>
              </div>

              <span className={`w-14 shrink-0 flex items-center justify-end gap-1 ${ui.text}`}>
                {ui.icon}
                {k.verdict !== "dentro" && k.verdict !== "sem_alvo" && (
                  <span className="font-mono">
                    {k.deltaSec > 0 ? "+" : ""}{k.deltaSec}s
                  </span>
                )}
              </span>

              {k.actualHr != null && (
                <span className={`w-12 shrink-0 font-mono flex items-center gap-0.5 justify-end ${
                  k.targetHr && k.actualHr > k.targetHr.max + 5 ? "text-orange-400" : "text-surface-500"
                }`}>
                  <Heart className="w-2.5 h-2.5" />{k.actualHr}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-surface-500 pt-1 border-t border-surface-700/50">
        <span className="flex items-center gap-1"><Check className="w-3 h-3 text-green-400" /> no alvo</span>
        <span className="flex items-center gap-1"><ChevronsRight className="w-3 h-3 text-orange-400" /> mais rápido</span>
        <span className="flex items-center gap-1"><ChevronsLeft className="w-3 h-3 text-blue-400" /> mais lento</span>
        {analysis.splitDeltaSec != null && (
          <span className="ml-auto font-mono">
            2ª metade {analysis.splitDeltaSec > 0 ? "+" : ""}{analysis.splitDeltaSec}s/km
          </span>
        )}
      </div>
    </div>
  );
}
