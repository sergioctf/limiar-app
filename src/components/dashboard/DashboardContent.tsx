"use client";

import Link from "next/link";
import {
  Activity, MapPin, Clock, TrendingUp, Zap,
  Heart, Calendar, Target, ChevronRight,
  Award, AlertTriangle, Brain
} from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";
import { PaceBadge, RunTypeBadge } from "@/components/shared/Badges";
import { WeeklyVolumeChart } from "@/components/charts/WeeklyVolumeChart";
import {
  totalDistanceKm, totalDurationSeconds, longestRun, bestPace,
  weeklyVolumeKm, monthlyVolumeKm, secondsToPaceString,
  secondsToReadable, formatDate, formatDistanceKm, groupByWeek,
} from "@/lib/utils";
import type { Run, Goal, CoachReport, SyncLog } from "@/types";

interface Props {
  runs: Run[];
  latestReport: CoachReport | null;
  goals: Goal[];
  lastSync: SyncLog | null;
}

export function DashboardContent({ runs, latestReport, goals, lastSync }: Props) {
  const totalDist = totalDistanceKm(runs);
  const totalDur  = totalDurationSeconds(runs);
  const longest   = longestRun(runs);
  const best      = bestPace(runs);
  const weekly    = weeklyVolumeKm(runs);
  const monthly   = monthlyVolumeKm(runs);
  const lastRun   = runs[0] ?? null;
  const stravaRuns = runs.filter((r) => r.source === "strava" || r.source === "strava+ai");
  const withCoach  = runs.filter((r) => r.coach_feedback);
  const weeklyData = groupByWeek(runs).slice(-12);

  const avgPace = totalDist > 0
    ? Math.round(totalDur / totalDist)
    : null;

  const nextGoal = goals.find((g) => g.race_date) ?? goals[0] ?? null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Dashboard</h1>
          <p className="text-surface-500 text-sm mt-0.5">
            {runs.length} corridas registradas
          </p>
        </div>
        <Link href="/runs/new" className="btn-primary">
          <Activity className="w-4 h-4" />
          <span className="hidden sm:inline">Nova corrida</span>
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <StatCard
          label="Total de corridas"
          value={runs.length}
          icon={Activity}
        />
        <StatCard
          label="Distância total"
          value={`${totalDist.toFixed(0)} km`}
          sub={`${totalDist.toFixed(1)} km exatos`}
          icon={MapPin}
          accent
        />
        <StatCard
          label="Tempo total"
          value={secondsToReadable(totalDur)}
          icon={Clock}
        />
        <StatCard
          label="Pace médio"
          value={avgPace ? secondsToPaceString(avgPace) + "/km" : "—"}
          icon={TrendingUp}
        />
        <StatCard
          label="Maior distância"
          value={longest ? formatDistanceKm(longest.distance_km) : "—"}
          sub={longest ? formatDate(longest.date) : undefined}
          icon={Award}
        />
        <StatCard
          label="Melhor pace"
          value={best?.avg_pace_seconds_per_km
            ? secondsToPaceString(best.avg_pace_seconds_per_km) + "/km"
            : "—"}
          sub={best ? formatDistanceKm(best.distance_km) : undefined}
          icon={Zap}
          accent
        />
        <StatCard
          label="Volume semanal"
          value={`${weekly.toFixed(1)} km`}
          icon={Calendar}
        />
        <StatCard
          label="Volume mensal"
          value={`${monthly.toFixed(1)} km`}
          icon={TrendingUp}
        />
      </div>

      {/* Coach Executive Summary */}
      {latestReport && (
        <div className="card p-5 border-brand-500/30">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
              <Brain className="w-4 h-4 text-brand-400" />
            </div>
            <div>
              <h2 className="font-bold text-surface-100">Resumo do Treinador</h2>
              <p className="text-xs text-surface-500">{latestReport.title}</p>
            </div>
          </div>
          <p className="text-sm text-surface-300 leading-relaxed mb-4">
            {latestReport.summary}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {latestReport.strengths && (
              <div className="bg-green-500/10 rounded-xl p-3 border border-green-500/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <Award className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">
                    Pontos fortes
                  </span>
                </div>
                <p className="text-xs text-surface-300 leading-relaxed line-clamp-4">
                  {latestReport.strengths.split("\n")[0]}
                </p>
              </div>
            )}
            {latestReport.weaknesses && (
              <div className="bg-yellow-500/10 rounded-xl p-3 border border-yellow-500/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">
                    Atenção
                  </span>
                </div>
                <p className="text-xs text-surface-300 leading-relaxed line-clamp-4">
                  {latestReport.weaknesses.split("\n")[0]}
                </p>
              </div>
            )}
          </div>
          <Link href="/coach" className="btn-ghost mt-3 text-brand-400 hover:text-brand-300">
            Ver relatório completo <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Last run + Next goal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {lastRun && (
          <Link href={`/runs/${lastRun.id}`} className="card-hover p-4 block">
            <p className="stat-label mb-2">Última corrida</p>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-surface-100 text-sm line-clamp-1">
                  {lastRun.name}
                </p>
                <p className="text-xs text-surface-500 mt-0.5">{formatDate(lastRun.date)}</p>
              </div>
              <RunTypeBadge type={lastRun.type} />
            </div>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className="font-bold text-surface-100 tabular-nums">
                {formatDistanceKm(lastRun.distance_km)}
              </span>
              {lastRun.avg_pace_seconds_per_km && (
                <PaceBadge paceSeconds={lastRun.avg_pace_seconds_per_km} />
              )}
              {lastRun.avg_hr && (
                <span className="flex items-center gap-1 text-xs text-surface-500">
                  <Heart className="w-3 h-3" /> {lastRun.avg_hr} bpm
                </span>
              )}
            </div>
          </Link>
        )}

        {nextGoal && (
          <Link href="/goals" className="card-hover p-4 block">
            <p className="stat-label mb-2">Próxima meta</p>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-surface-100 text-sm">{nextGoal.race_name}</p>
                {nextGoal.race_date && (
                  <p className="text-xs text-surface-500 mt-0.5">{formatDate(nextGoal.race_date)}</p>
                )}
              </div>
              <Target className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
            </div>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className="font-bold text-surface-100 tabular-nums">
                {nextGoal.distance_km} km
              </span>
              {nextGoal.target_time_seconds && (
                <span className="badge bg-brand-500/15 text-brand-300">
                  alvo {secondsToReadable(nextGoal.target_time_seconds)}
                </span>
              )}
            </div>
          </Link>
        )}
      </div>

      {/* Weekly volume chart */}
      {weeklyData.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Volume semanal</h2>
            <Link href="/analytics" className="btn-ghost text-brand-400 hover:text-brand-300 text-xs">
              Ver gráficos <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <WeeklyVolumeChart data={weeklyData} />
        </div>
      )}

      {/* Strava + coach counters */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="stat-label">Strava importadas</p>
          <p className="stat-value text-orange-300">{stravaRuns.length}</p>
          {lastSync && (
            <p className="text-xs text-surface-500 mt-1">
              Último sync: {new Date(lastSync.created_at).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
        <div className="card p-4">
          <p className="stat-label">Com análise do treinador</p>
          <p className="stat-value text-purple-300">{withCoach.length}</p>
          <p className="text-xs text-surface-500 mt-1">
            {runs.length > 0
              ? `${Math.round((withCoach.length / runs.length) * 100)}% do total`
              : "0%"}
          </p>
        </div>
      </div>
    </div>
  );
}
