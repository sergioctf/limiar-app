"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, MapPin, Clock, Heart, Mountain, Activity,
  Zap, MessageSquare, Edit3, ChevronDown, ChevronUp,
  Flame, Wind, Droplets, Sparkles, Loader2
} from "lucide-react";
import {
  PaceBadge, RunTypeBadge, SourceBadge, HeartRateBadge, TagBadge
} from "@/components/shared/Badges";
import {
  formatDate, formatDistanceKm, secondsToReadable,
  secondsToPaceString
} from "@/lib/utils";
import type { Run } from "@/types";

interface Props { run: Run }

export function RunDetailContent({ run }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(run.coach_feedback ?? null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch(`/api/runs/${run.id}/analyze`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.feedback) {
        setFeedback(data.feedback);
      } else {
        setAnalyzeError(data.error ?? "Erro ao gerar análise.");
      }
    } catch {
      setAnalyzeError("Falha na conexão. Tente novamente.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto animate-fade-in">
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <Link href="/runs" className="btn-ghost">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="flex gap-2">
          <Link href={`/runs/${run.id}/edit`} className="btn-secondary">
            <Edit3 className="w-4 h-4" /> Editar
          </Link>
        </div>
      </div>

      {/* Header card */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h1 className="page-header truncate">{run.name}</h1>
            <p className="text-surface-500 text-sm mt-0.5">{formatDate(run.date)}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <RunTypeBadge type={run.type} />
            <SourceBadge source={run.source} />
          </div>
        </div>

        {/* Main stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-surface-700/50 rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1">
              <MapPin className="w-4 h-4 text-brand-400" />
            </div>
            <p className="font-bold text-surface-100 tabular-nums">
              {formatDistanceKm(run.distance_km)}
            </p>
            <p className="text-xs text-surface-500">Distância</p>
          </div>
          <div className="bg-surface-700/50 rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1">
              <Clock className="w-4 h-4 text-blue-400" />
            </div>
            <p className="font-bold text-surface-100 tabular-nums">
              {secondsToReadable(run.duration_seconds)}
            </p>
            <p className="text-xs text-surface-500">Tempo</p>
          </div>
          {run.avg_pace_seconds_per_km && (
            <div className="bg-surface-700/50 rounded-xl p-3 text-center">
              <div className="flex justify-center mb-1">
                <Zap className="w-4 h-4 text-brand-400" />
              </div>
              <p className="font-bold text-brand-300 tabular-nums font-mono">
                {secondsToPaceString(run.avg_pace_seconds_per_km)}/km
              </p>
              <p className="text-xs text-surface-500">Pace médio</p>
            </div>
          )}
          {run.avg_hr && (
            <div className="bg-surface-700/50 rounded-xl p-3 text-center">
              <div className="flex justify-center mb-1">
                <Heart className="w-4 h-4 text-red-400" />
              </div>
              <p className="font-bold text-surface-100 tabular-nums">
                {run.avg_hr} bpm
              </p>
              <p className="text-xs text-surface-500">FC média</p>
            </div>
          )}
        </div>

        {/* Secondary stats */}
        <div className="flex flex-wrap gap-3 mt-4 text-sm text-surface-400">
          {run.max_hr && (
            <span className="flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-red-400" />
              FC máx: <span className="text-surface-200 font-medium">{run.max_hr} bpm</span>
            </span>
          )}
          {run.elevation_gain_m && (
            <span className="flex items-center gap-1.5">
              <Mountain className="w-3.5 h-3.5 text-surface-500" />
              Alt: <span className="text-surface-200 font-medium">{run.elevation_gain_m}m</span>
            </span>
          )}
          {run.avg_cadence && (
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-surface-500" />
              Cadência: <span className="text-surface-200 font-medium">{run.avg_cadence} ppm</span>
            </span>
          )}
          {run.calories && (
            <span className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-surface-200 font-medium">{run.calories} kcal</span>
            </span>
          )}
          {run.conditions && (
            <span className="flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-surface-500" />
              <span className="text-surface-200">{run.conditions}</span>
            </span>
          )}
          {run.hydration && (
            <span className="flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-surface-200">{run.hydration}</span>
            </span>
          )}
        </div>

        {/* Tags */}
        {run.tags && run.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {run.tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
          </div>
        )}
      </div>

      {/* Notes */}
      {run.notes && (
        <div className="card p-5">
          <h2 className="section-title mb-3">Notas</h2>
          <p className="text-sm text-surface-300 leading-relaxed whitespace-pre-wrap">
            {run.notes}
          </p>
        </div>
      )}

      {/* Coach feedback */}
      {feedback ? (
        <div className="card p-5 border-purple-500/30">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <h2 className="section-title">Análise do Treinador IA</h2>
          </div>
          <p className="text-sm text-surface-300 leading-relaxed whitespace-pre-wrap">
            {feedback}
          </p>
        </div>
      ) : (
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-700 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-surface-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-300">Sem análise do treinador</p>
              <p className="text-xs text-surface-500 mt-0.5">Gere uma análise automática via IA</p>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="btn-primary text-xs py-1.5 px-3 shrink-0"
            >
              {analyzing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisando…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /> Gerar análise IA</>
              )}
            </button>
          </div>
          {analyzeError && (
            <p className="text-xs text-red-400 mt-3">{analyzeError}</p>
          )}
        </div>
      )}

      {/* Perceived effort */}
      {run.perceived_effort && (
        <div className="card p-5">
          <h2 className="section-title mb-3">Percepção de Esforço</h2>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-5 h-2 rounded-sm ${
                    i < run.perceived_effort!
                      ? i < 4 ? "bg-green-500" : i < 7 ? "bg-yellow-500" : "bg-red-500"
                      : "bg-surface-700"
                  }`}
                />
              ))}
            </div>
            <span className="text-sm font-semibold text-surface-200">
              {run.perceived_effort}/10
            </span>
          </div>
        </div>
      )}

      {/* Gel usage */}
      {run.gel_usage && (
        <div className="card p-4">
          <p className="stat-label mb-1">Uso de gel</p>
          <p className="text-sm text-surface-300">{run.gel_usage}</p>
        </div>
      )}

      {/* Raw Strava */}
      {run.strava_raw_json && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="w-full flex items-center justify-between p-4 hover:bg-surface-700/30 transition-colors"
          >
            <span className="text-sm font-medium text-surface-400">Dados brutos do Strava</span>
            {showRaw ? (
              <ChevronUp className="w-4 h-4 text-surface-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-surface-500" />
            )}
          </button>
          {showRaw && (
            <div className="border-t border-surface-700 p-4">
              <pre className="text-xs text-surface-500 overflow-x-auto">
                {JSON.stringify(run.strava_raw_json, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
