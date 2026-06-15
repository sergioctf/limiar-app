"use client";

import { BarChart3, Loader2, Heart, Mountain, TrendingDown, Crown, ChevronDown, Trophy } from "lucide-react";
import { secondsToPaceString, secondsToReadable } from "@/lib/utils";
import type { RunStreamAnalysis, KmSplit } from "@/lib/run-streams";

interface Props {
  hasStrava: boolean;
  analysis: RunStreamAnalysis | null;
  loading: boolean;
  loaded: boolean;
  reason: string | null;
  onLoad: () => void;
}

const DRIFT_UI = {
  excelente: { label: "Excelente", color: "text-green-400", desc: "FC estável do início ao fim — ótima durabilidade aeróbica" },
  bom:       { label: "Bom",       color: "text-brand-400", desc: "Pequena deriva cardíaca, dentro do esperado" },
  atencao:   { label: "Atenção",   color: "text-yellow-400", desc: "FC subiu bastante no fim — fadiga, calor ou ritmo agressivo demais" },
} as const;

export function RunSplits({ hasStrava, analysis, loading, loaded, reason, onLoad }: Props) {
  if (!hasStrava) return null;

  // Slowest full km defines the bar scale
  const splits = analysis?.splits ?? [];
  const maxPace = splits.length > 0 ? Math.max(...splits.map(s => s.paceSecPerKm)) : 1;
  const minPace = splits.length > 0 ? Math.min(...splits.map(s => s.paceSecPerKm)) : 1;
  const range = Math.max(maxPace - minPace, 1);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Splits por km</h2>
        </div>
        {!loaded && (
          <button onClick={onLoad} disabled={loading} className="btn-ghost text-xs text-brand-400 hover:text-brand-300">
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…</> : <>Analisar <ChevronDown className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>

      {!loaded && !loading && (
        <p className="text-sm text-surface-500">
          Veja o ritmo e a FC de cada quilômetro, mais a deriva cardíaca da corrida.
        </p>
      )}

      {loaded && splits.length === 0 && (
        <p className="text-sm text-surface-500">
          {reason === "no_connection" ? "Conecte o Strava para ver os splits detalhados."
            : reason === "fetch_failed" ? "Não foi possível carregar os dados do Strava agora."
            : "Esta corrida não tem dados de GPS/tempo suficientes para splits."}
        </p>
      )}

      {splits.length > 0 && (
        <>
          {/* HR drift summary */}
          {analysis?.hrDrift !== null && analysis?.hrDriftVerdict && (
            <div className="flex items-start gap-2 bg-surface-700/30 rounded-xl p-3 mb-3">
              <TrendingDown className={`w-4 h-4 mt-0.5 shrink-0 ${DRIFT_UI[analysis.hrDriftVerdict].color}`} />
              <div>
                <p className="text-sm">
                  <span className="text-surface-400">Deriva cardíaca: </span>
                  <span className={`font-bold ${DRIFT_UI[analysis.hrDriftVerdict].color}`}>
                    {analysis.hrDrift > 0 ? "+" : ""}{analysis.hrDrift}% · {DRIFT_UI[analysis.hrDriftVerdict].label}
                  </span>
                </p>
                <p className="text-xs text-surface-500 mt-0.5">{DRIFT_UI[analysis.hrDriftVerdict].desc}</p>
              </div>
            </div>
          )}

          {/* Split bars */}
          <div className="space-y-1">
            {splits.map((s: KmSplit) => {
              const widthPct = 30 + ((maxPace - s.paceSecPerKm) / range) * 70; // faster = longer bar
              return (
                <div key={s.km} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-surface-500 tabular-nums shrink-0">{s.km}</span>
                  <div className="flex-1 bg-surface-700/40 rounded-md overflow-hidden h-7 relative">
                    <div
                      className={`h-full rounded-md transition-all duration-500 ${s.fastest ? "bg-brand-500" : "bg-surface-600"}`}
                      style={{ width: `${widthPct}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-between px-2">
                      <span className="font-mono font-bold text-surface-100 tabular-nums flex items-center gap-1">
                        {s.fastest && <Crown className="w-3 h-3 text-yellow-300" />}
                        {secondsToPaceString(s.paceSecPerKm)}/km
                      </span>
                      <span className="flex items-center gap-2 text-surface-300">
                        {s.avgHr != null && <span className="flex items-center gap-0.5"><Heart className="w-3 h-3 text-red-400" />{s.avgHr}</span>}
                        {s.elevGainM != null && s.elevGainM > 2 && <span className="flex items-center gap-0.5 text-surface-500"><Mountain className="w-3 h-3" />{s.elevGainM}m</span>}
                        {s.distanceKm < 0.95 && <span className="text-surface-600">{s.distanceKm.toFixed(2)}km</span>}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Best efforts (Strava-computed fastest segments within this run) */}
          {analysis?.bestEfforts && analysis.bestEfforts.length > 0 && (
            <div className="mt-4 pt-3 border-t border-surface-700/50">
              <div className="flex items-center gap-1.5 mb-2">
                <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                <p className="text-xs font-semibold text-surface-300 uppercase tracking-wide">Melhores parciais</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.bestEfforts.map((e, i) => (
                  <div
                    key={`${e.name}-${i}`}
                    className={`rounded-lg px-2.5 py-1.5 text-center ${
                      e.prRank === 1 ? "bg-yellow-500/15 border border-yellow-500/30" : "bg-surface-700/40"
                    }`}
                    title={e.prRank === 1 ? "Recorde pessoal!" : e.prRank ? `${e.prRank}º melhor tempo` : undefined}
                  >
                    <p className="text-[10px] text-surface-500 flex items-center justify-center gap-1">
                      {e.prRank === 1 && <Crown className="w-2.5 h-2.5 text-yellow-300" />}{e.name}
                    </p>
                    <p className="font-mono font-bold text-sm text-surface-100 tabular-nums">{secondsToReadable(e.elapsedSec)}</p>
                    <p className="text-[9px] text-surface-500">{secondsToPaceString(e.paceSecPerKm)}/km</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
