"use client";

import { useEffect, useState } from "react";
import { X, Sparkles, Loader2, TrendingUp, TrendingDown, Award, AlertTriangle, Target } from "lucide-react";
import { secondsToReadable, secondsToPaceString } from "@/lib/utils";
import type { Race } from "@/types";

interface StoredAnalysis {
  id: string;
  summary: string | null;
  strengths: string | null;
  weaknesses: string | null;
  recommendations: string | null;
  full_report: string | null;
  updated_at: string | null;
}

interface Numbers {
  actualSeconds: number;
  predictedSeconds: number | null;
  deltaSeconds: number | null;
  targetSeconds: number | null;
  vdotBefore: number | null;
  vdotFromRace: number | null;
  avgPaceSeconds: number;
  splitDriftSeconds: number | null;
}

/** Post-race debrief: predicted vs actual, pacing, and next-cycle focus. */
export function RaceAnalysisModal({ race, onClose }: { race: Race; onClose: () => void }) {
  const [analysis, setAnalysis] = useState<StoredAnalysis | null>(null);
  const [numbers, setNumbers]   = useState<Numbers | null>(null);
  const [loading, setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/races/${race.id}/analysis`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setAnalysis(d?.analysis ?? null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [race.id]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/races/${race.id}/analysis`, { method: "POST" });
      const d = await res.json().catch(() => null);
      if (res.ok) {
        setNumbers(d?.numbers ?? null);
        const r2 = await fetch(`/api/races/${race.id}/analysis`);
        if (r2.ok) setAnalysis((await r2.json()).analysis ?? null);
      } else {
        setError(d?.error ?? "Não foi possível analisar.");
      }
    } catch {
      setError("Falha na conexão.");
    } finally {
      setGenerating(false);
    }
  }

  const delta = numbers?.deltaSeconds ?? null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-surface-100">Análise pós-prova</h2>
            <p className="text-xs text-surface-500">
              {race.name} · {race.distance_km} km ·{" "}
              {race.time_seconds ? secondsToReadable(race.time_seconds) : "sem tempo"}
            </p>
          </div>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-300 p-1 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-surface-500" /></div>
        ) : !analysis ? (
          <div className="text-center py-6 space-y-4">
            <div className="text-surface-500">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Compare o previsto com o que aconteceu</p>
              <p className="text-xs mt-1 text-surface-500">
                Usa seu VDOT antes da prova, o ritmo quilômetro a quilômetro e o volume das 8 semanas anteriores.
              </p>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={generate} disabled={generating} className="btn-primary mx-auto">
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analisando…</>
                : <><Sparkles className="w-4 h-4" /> Analisar prova</>}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Predicted vs actual */}
            {numbers && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-surface-700/40 rounded-xl p-3">
                  <p className="text-[10px] uppercase text-surface-500">Ritmo médio</p>
                  <p className="font-mono font-bold text-surface-100">
                    {secondsToPaceString(numbers.avgPaceSeconds)}/km
                  </p>
                </div>
                {delta !== null && (
                  <div className={`rounded-xl p-3 ${delta <= 0 ? "bg-green-500/10" : "bg-yellow-500/10"}`}>
                    <p className="text-[10px] uppercase text-surface-500">vs previsto</p>
                    <p className={`font-mono font-bold flex items-center gap-1 ${delta <= 0 ? "text-green-400" : "text-yellow-400"}`}>
                      {delta <= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {delta > 0 ? "+" : ""}{Math.round(delta)}s
                    </p>
                  </div>
                )}
                {numbers.vdotFromRace != null && (
                  <div className="bg-surface-700/40 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-surface-500">VDOT da prova</p>
                    <p className="font-mono font-bold text-brand-300">
                      {numbers.vdotFromRace.toFixed(1)}
                      {numbers.vdotBefore != null && (
                        <span className="text-surface-500 text-xs font-normal"> (era {numbers.vdotBefore.toFixed(1)})</span>
                      )}
                    </p>
                  </div>
                )}
                {numbers.splitDriftSeconds != null && (
                  <div className="bg-surface-700/40 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-surface-500">Deriva de ritmo</p>
                    <p className={`font-mono font-bold ${numbers.splitDriftSeconds > 8 ? "text-yellow-400" : "text-green-400"}`}>
                      {numbers.splitDriftSeconds > 0 ? "+" : ""}{numbers.splitDriftSeconds}s/km
                    </p>
                  </div>
                )}
              </div>
            )}

            {analysis.summary && (
              <p className="text-sm text-surface-300 leading-relaxed">{analysis.summary}</p>
            )}

            {analysis.strengths && (
              <Section icon={<Award className="w-3.5 h-3.5 text-green-400" />} label="O que funcionou"
                       className="bg-green-500/10 border-green-500/20" text={analysis.strengths} />
            )}
            {analysis.weaknesses && (
              <Section icon={<AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />} label="O que custou tempo"
                       className="bg-yellow-500/10 border-yellow-500/20" text={analysis.weaknesses} />
            )}
            {analysis.recommendations && (
              <Section icon={<Target className="w-3.5 h-3.5 text-brand-400" />} label="Foco do próximo ciclo"
                       className="bg-brand-500/10 border-brand-500/20" text={analysis.recommendations} />
            )}

            {analysis.full_report && (
              <details className="text-xs">
                <summary className="cursor-pointer text-surface-500 hover:text-surface-300">Números e splits</summary>
                <pre className="whitespace-pre-wrap text-[11px] text-surface-400 mt-2 bg-surface-700/40 rounded-lg p-3 overflow-x-auto">
                  {analysis.full_report}
                </pre>
              </details>
            )}

            <button onClick={generate} disabled={generating}
              className="text-[11px] text-surface-500 hover:text-surface-400 inline-flex items-center gap-1">
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              refazer análise
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ icon, label, text, className }: {
  icon: React.ReactNode; label: string; text: string; className: string;
}) {
  return (
    <div className={`rounded-xl p-3 border ${className}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-tight text-surface-300">{label}</span>
      </div>
      <p className="text-xs text-surface-300 leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}
