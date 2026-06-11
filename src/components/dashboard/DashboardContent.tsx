"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  MapPin, TrendingUp, Zap,
  Heart, Calendar, Target, ChevronRight,
  Award, AlertTriangle, Brain, Flag, Dumbbell, Flame,
  Activity as ActivityIcon, Bike, Waves, PersonStanding, Wind, Plus,
} from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";
import { PaceBadge, RunTypeBadge } from "@/components/shared/Badges";
import { WeeklyVolumeChart } from "@/components/charts/WeeklyVolumeChart";
import { FitnessCard } from "@/components/dashboard/FitnessCard";
import { AchievementsCard } from "@/components/achievements/AchievementsCard";
import { PersonalRecordsCard } from "@/components/achievements/PersonalRecordsCard";
import { TargetRaceCard } from "@/components/dashboard/TargetRaceCard";
import {
  totalDistanceKm, totalDurationSeconds, longestRun, bestPace,
  monthlyVolumeKm,
  secondsToPaceString, formatDate, formatDistanceKm, groupByWeek,
  computeTrainingDays, type TrainingDayFilter,
} from "@/lib/utils";
import { computeTrainingLoad, computeRunStreak } from "@/lib/training-load";
import { computeMetrics } from "@/lib/performance";
import { detectAchievements } from "@/lib/achievements";
import { analyzeHistoricalComparison } from "@/lib/historical-comparison";
import { pickTargetComparison } from "@/lib/target-comparison";
import type { Run, Goal, CoachReport, SyncLog, Activity, Race, PerformanceTest } from "@/types";

interface Props {
  userName?: string | null;
  runs: Run[];
  latestReport: CoachReport | null;
  goals: Goal[];
  lastSync: SyncLog | null;
  weekActivities: Activity[];
  recentActivities: Activity[];
  activitiesHistory: Array<{ date: string; sport_type: string }>;
  nextRace?: Race | null;
  latestTest?: PerformanceTest | null;
}

function SportIcon({ type }: { type: string }) {
  const t = type?.toLowerCase() ?? "";
  const cls = "w-4 h-4 shrink-0";
  if (t.includes("run") || t.includes("trail"))                             return <ActivityIcon className={cls} />;
  if (t.includes("weight") || t.includes("workout") || t.includes("crossfit") || t.includes("gym")) return <Dumbbell className={cls} />;
  if (t.includes("ride") || t.includes("bike") || t.includes("cycling"))   return <Bike        className={cls} />;
  if (t.includes("swim"))                                                   return <Waves       className={cls} />;
  if (t.includes("walk") || t.includes("hike"))                            return <PersonStanding className={cls} />;
  if (t.includes("yoga") || t.includes("pilates"))                         return <Wind        className={cls} />;
  return <Zap className={cls} />;
}

function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function todayPtBR(): string {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function DashboardContent({
  userName,
  runs,
  latestReport,
  goals,
  lastSync,
  weekActivities,
  recentActivities,
  activitiesHistory,
  nextRace,
  latestTest,
}: Props) {
  const firstName  = userName?.trim().split(" ")[0] || null;
  const totalDist  = totalDistanceKm(runs);
  const totalDur   = totalDurationSeconds(runs);
  const longest    = longestRun(runs);
  const best       = bestPace(runs);
  const monthly    = monthlyVolumeKm(runs);
  const lastRun    = runs[0] ?? null;
  const weeklyData = groupByWeek(runs).slice(-12);

  // Training load (CTL/ATL/TSB) — uses LTHR + threshold pace if test available
  const testMetrics = latestTest
    ? computeMetrics(latestTest.distance_km * 1000, latestTest.time_seconds, latestTest.avg_hr ?? undefined)
    : null;
  const lthr = testMetrics?.lthr ?? null;
  const thresholdPace = testMetrics?.paces.find(p => p.name === "threshold")?.pace_min_sec ?? null;
  const fitnessData = computeTrainingLoad(runs, lthr, thresholdPace, 90);

  // Running streak
  const runStreak = computeRunStreak(runs);

  const avgPace = totalDist > 0
    ? Math.round(totalDur / totalDist)
    : null;

  // (goals prop kept for compat but not displayed on dashboard — managed via /goals page)

  // Training readiness: % of 4-week volume trend (last week vs best of prior 3)
  const last4Weeks = groupByWeek(runs).slice(-4);
  const lastWeekKm = last4Weeks[last4Weeks.length - 1]?.totalKm ?? 0;
  const prior3Max  = Math.max(...last4Weeks.slice(0, 3).map((w) => w.totalKm), 1);
  const readinessPct = Math.min(100, Math.round((lastWeekKm / prior3Max) * 100));

  // This week's runs
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekRuns = runs.filter((r) => r.date >= weekStartStr);
  const weekRunKm = weekRuns.reduce((s, r) => s + r.distance_km, 0);

  // This week gym stats
  const weekGymCount = weekActivities.filter((a) => {
    const t = a.sport_type?.toLowerCase() ?? "";
    return t.includes("weight") || t.includes("workout") || t.includes("crossfit") || t.includes("gym");
  }).length;
  const weekGymMinutes = weekActivities.reduce((s, a) => s + (a.duration_seconds ?? 0) / 60, 0);

  // Total calories this week (runs + activities)
  const weekRunCalories = weekRuns.reduce((s, r) => s + (r.calories ?? 0), 0);
  const weekGymCalories = weekActivities.reduce((s, a) => s + (a.calories ?? 0), 0);
  const weekCalories    = weekRunCalories + weekGymCalories;

  // Total training hours this week
  const weekRunSeconds  = weekRuns.reduce((s, r) => s + r.duration_seconds, 0);
  const weekGymSeconds  = weekActivities.reduce((s, a) => s + (a.duration_seconds ?? 0), 0);
  const weekTotalHours  = (weekRunSeconds + weekGymSeconds) / 3600;

  // Activity feed: merge recent runs (last 30 days) with recentActivities
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const thirtyAgoStr = thirtyAgo.toISOString().slice(0, 10);
  const recentRuns = runs.filter((r) => r.date >= thirtyAgoStr).slice(0, 6);

  type FeedItem =
    | { kind: "run"; id: string; name: string; date: string; sport_type: string; metric: string }
    | { kind: "gym"; id: string; name: string; date: string; sport_type: string; metric: string };

  const feedItems: FeedItem[] = [
    ...recentRuns.map((r) => ({
      kind: "run" as const,
      id: r.id,
      name: r.name,
      date: r.date,
      sport_type: r.type === "easy" ? "Run" : r.type,
      metric: formatDistanceKm(r.distance_km),
    })),
    ...recentActivities.map((a) => ({
      kind: "gym" as const,
      id: a.id,
      name: a.name,
      date: a.date,
      sport_type: a.sport_type,
      metric: a.duration_seconds
        ? `${Math.floor(a.duration_seconds / 3600) > 0 ? Math.floor(a.duration_seconds / 3600) + "h" : ""}${Math.floor((a.duration_seconds % 3600) / 60)}min`
        : "—",
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  // Training days filter state
  const [dayFilter, setDayFilter] = useState<TrainingDayFilter>("all");

  // Training days comparison: this week vs 3-week avg vs 3-month avg
  const trainingDays = useMemo(
    () => computeTrainingDays(runs, activitiesHistory, dayFilter),
    [runs, activitiesHistory, dayFilter]
  );

  // Training balance (last 30 days)
  const balance30RunCount   = recentRuns.length;
  const balance30GymCount   = recentActivities.filter((a) => {
    const t = a.sport_type?.toLowerCase() ?? "";
    return t.includes("weight") || t.includes("workout") || t.includes("crossfit");
  }).length;
  const balance30OtherCount = recentActivities.length - balance30GymCount;

  // Achievements and historical comparison
  const achievements = useMemo(() => detectAchievements(runs), [runs]);
  const historicalRecords = useMemo(() => analyzeHistoricalComparison(runs), [runs]);

  // Target race comparison (current fitness vs goal target)
  const targetComparison = useMemo(
    () => pickTargetComparison(goals, latestTest ?? null),
    [goals, latestTest]
  );

  // New user with no data at all yet — show a guided welcome instead of zeroed-out cards
  const isNewUser = runs.length === 0 && recentActivities.length === 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">
            {greetingByHour()}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-surface-500 text-sm mt-0.5 capitalize">{todayPtBR()}</p>
        </div>
        <Link href="/runs/new" className="btn-primary">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nova corrida</span>
        </Link>
      </div>

      {/* Welcome card for brand-new users */}
      {isNewUser && (
        <div className="card p-5 border-brand-500/30 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h2 className="font-bold text-surface-100">Bem-vindo ao Limiar!</h2>
              <p className="text-xs text-surface-500">Vamos começar em 2 passos rápidos</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href="/settings" className="card-hover p-4 flex flex-col gap-2">
              <span className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
                <ActivityIcon className="w-4 h-4 text-orange-400" />
              </span>
              <p className="text-sm font-semibold text-surface-100">Conectar Strava</p>
              <p className="text-xs text-surface-500">Importe suas corridas automaticamente, com pace, FC e GPS.</p>
            </Link>
            <Link href="/runs/new" className="card-hover p-4 flex flex-col gap-2">
              <span className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
                <Plus className="w-4 h-4 text-brand-400" />
              </span>
              <p className="text-sm font-semibold text-surface-100">Adicionar corrida manual</p>
              <p className="text-xs text-surface-500">Sem Strava? Registre seus treinos manualmente.</p>
            </Link>
          </div>
          <p className="text-xs text-surface-600">
            Depois disso, o treinador IA começa a gerar planos e relatórios personalizados pra você.
          </p>
        </div>
      )}

      {/* Esta semana overview */}
      {!isNewUser && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="stat-label mb-1">Corridas</p>
          <p className="text-2xl font-black text-surface-100 tabular-nums">{weekRuns.length}</p>
          <p className="text-xs text-surface-500 mt-0.5">{weekRunKm.toFixed(1)} km</p>
        </div>
        <div className="card p-4">
          <p className="stat-label mb-1">Musculação</p>
          <p className="text-2xl font-black text-blue-300 tabular-nums">{weekGymCount}</p>
          <p className="text-xs text-surface-500 mt-0.5">
            {weekGymMinutes > 0 ? `${Math.round(weekGymMinutes)} min` : "—"}
          </p>
        </div>
        <div className="card p-4">
          <p className="stat-label mb-1">Calorias</p>
          <p className="text-2xl font-black text-orange-300 tabular-nums">
            {weekCalories > 0 ? weekCalories.toLocaleString("pt-BR") : "—"}
          </p>
          <p className="text-xs text-surface-500 mt-0.5">esta semana</p>
        </div>
        {/* Streak card */}
        <div className="card p-4 relative overflow-hidden">
          {runStreak >= 3 && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 to-yellow-400 rounded-t-xl" />
          )}
          <div className="flex items-center justify-between mb-1">
            <p className="stat-label">Sequência</p>
            {runStreak >= 3 && <Flame className="w-3.5 h-3.5 text-orange-400" />}
          </div>
          <p className={`text-2xl font-black tabular-nums ${runStreak >= 3 ? "text-orange-300" : "text-surface-100"}`}>
            {runStreak}
          </p>
          <p className="text-xs text-surface-500 mt-0.5">
            {runStreak === 1 ? "dia seguido" : runStreak > 1 ? "dias seguidos" : "dias"}
          </p>
        </div>
      </div>
      )}

      {/* Target race comparison — current fitness vs goal */}
      {!isNewUser && targetComparison && (
        <TargetRaceCard comparison={targetComparison} />
      )}

      {/* Training days comparison */}
      {!isNewUser && (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-brand-400" />
            Dias de treino
          </h2>
        </div>

        {/* Filter pills */}
        {(() => {
          const filters: Array<{ key: TrainingDayFilter; label: string }> = [
            { key: "all",   label: "Treinos"    },
            { key: "runs",  label: "Corridas"   },
            { key: "gym",   label: "Musculação" },
            { key: "other", label: "Outras"     },
          ];
          return (
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {filters.map(f => (
                <button
                  key={f.key}
                  onClick={() => setDayFilter(f.key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                    dayFilter === f.key
                      ? "bg-brand-500 text-white"
                      : "bg-surface-700 text-surface-400 hover:text-surface-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          );
        })()}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Esta semana",    value: trainingDays.thisWeek,   color: "text-brand-300",   bg: "bg-brand-500",   note: "seg → hoje" },
            { label: "Média 3 sem.",   value: trainingDays.avg3Weeks,  color: "text-surface-200", bg: "bg-surface-400", note: "últimas 3" },
            { label: "Média 3 meses",  value: trainingDays.avg3Months, color: "text-surface-400", bg: "bg-surface-600", note: "últimas 12" },
          ].map(({ label, value, color, bg, note }) => {
            const display = Number.isInteger(value) ? value.toString() : value.toFixed(1);
            const barPct  = Math.min(100, (value / 7) * 100);
            return (
              <div key={label} className="text-center space-y-1.5">
                <p className="text-[11px] text-surface-500 uppercase tracking-wide leading-tight">{label}</p>
                <p className={`text-2xl font-black tabular-nums ${color}`}>{display}</p>
                <p className="text-[10px] text-surface-600">{note}</p>
                {/* Mini bar */}
                <div className="h-1.5 rounded-full bg-surface-700 mx-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 opacity-70 ${bg}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {/* Visual balance gauge −100% → +100% vs 3-week avg */}
        {trainingDays.avg3Weeks > 0 && (() => {
          const raw      = ((trainingDays.thisWeek - trainingDays.avg3Weeks) / trainingDays.avg3Weeks) * 100;
          const clamped  = Math.max(-100, Math.min(100, raw));
          const absC     = Math.abs(clamped);
          // bar fill: each 1% of delta = 0.5% of bar width (bar = -100→+100 = 200 units in 100% width)
          const fillW    = `${absC * 0.5}%`;
          const isNeg    = clamped < 0;

          const { label, barColor, textColor } =
            clamped < -50 ? { label: "muito abaixo",  barColor: "bg-red-500",     textColor: "text-red-400"     } :
            clamped < -20 ? { label: "abaixo",        barColor: "bg-yellow-500",  textColor: "text-yellow-400"  } :
            clamped >  50 ? { label: "muito acima",   barColor: "bg-emerald-400", textColor: "text-emerald-400" } :
            clamped >  20 ? { label: "acima",         barColor: "bg-green-500",   textColor: "text-green-400"   } :
                            { label: "na média",      barColor: "bg-surface-400", textColor: "text-surface-400" };

          return (
            <div className="mt-3 pt-3 border-t border-surface-700/50 space-y-1.5">
              {/* Scale labels */}
              <div className="flex justify-between text-[9px] text-surface-600 px-0.5">
                <span>muito abaixo</span>
                <span>abaixo</span>
                <span>na média</span>
                <span>acima</span>
                <span>muito acima</span>
              </div>

              {/* Bar */}
              <div className="relative h-2 rounded-full bg-surface-700 overflow-hidden">
                {/* Center anchor line */}
                <div className="absolute inset-y-0 left-1/2 w-px bg-surface-500 z-10" />
                {/* Fill */}
                <div
                  className={`absolute inset-y-0 rounded-full transition-all duration-500 ${barColor}`}
                  style={isNeg
                    ? { right: "50%", width: fillW }
                    : { left:  "50%", width: fillW }}
                />
              </div>

              {/* Status label */}
              <div className="flex items-center justify-center gap-1.5">
                <span className={`text-xs font-semibold ${textColor}`}>{label}</span>
                <span className="text-[10px] text-surface-600">vs. média 3 semanas</span>
              </div>
            </div>
          );
        })()}
      </div>
      )}

      {/* Activity feed + Race countdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Activity feed */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Atividades recentes</h2>
            <Link href="/calendar" className="btn-ghost text-brand-400 hover:text-brand-300 text-xs">
              Ver calendário <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {feedItems.length === 0 ? (
            <p className="text-surface-500 text-sm">Sem atividades nos últimos 30 dias.</p>
          ) : (
            <ul className="space-y-2">
              {feedItems.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  {item.kind === "run" ? (
                    <Link
                      href={`/runs/${item.id}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-700/50 transition-colors"
                    >
                      <span className="w-6 flex items-center justify-center shrink-0 text-surface-400">
                        <SportIcon type={item.sport_type} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-surface-200 font-medium truncate">{item.name}</p>
                        <p className="text-xs text-surface-500">{formatDate(item.date)}</p>
                      </div>
                      <span className="text-sm font-bold text-surface-100 tabular-nums shrink-0">
                        {item.metric}
                      </span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                      <span className="w-6 flex items-center justify-center shrink-0 text-surface-400">
                        <SportIcon type={item.sport_type} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-surface-200 font-medium truncate">{item.name}</p>
                        <p className="text-xs text-surface-500">{formatDate(item.date)}</p>
                      </div>
                      <span className="text-sm font-bold text-surface-100 tabular-nums shrink-0">
                        {item.metric}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Race countdown — races table only */}
        {nextRace ? (() => {
          const raceDay  = new Date(nextRace.race_date + "T12:00:00");
          const today2   = new Date(); today2.setHours(0,0,0,0);
          const raceDays = Math.round((raceDay.getTime() - today2.getTime()) / (1000 * 60 * 60 * 24));
          if (raceDays < 0) return null;
          return (
            <Link href="/races" className="card-hover p-4 block relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-500 to-brand-300 rounded-t-xl" />
              <div className="flex items-center justify-between mb-3">
                <p className="stat-label">Próxima prova</p>
                <Flag className="w-4 h-4 text-brand-400" />
              </div>
              <p className="font-bold text-surface-100 text-sm line-clamp-1">{nextRace.name}</p>
              <p className="text-xs text-surface-500 mt-0.5">
                {nextRace.distance_km} km · {formatDate(nextRace.race_date)}
              </p>
              <div className="flex items-end gap-2 mt-3">
                <span className={`text-3xl font-black tabular-nums leading-none ${
                  raceDays <= 7  ? "text-red-400" :
                  raceDays <= 30 ? "text-yellow-400" : "text-brand-300"
                }`}>
                  {raceDays > 0 ? raceDays : "HOJE"}
                </span>
                {raceDays > 0 && (
                  <span className="text-sm text-surface-400 mb-0.5">
                    {raceDays === 1 ? "dia" : "dias"}
                  </span>
                )}
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-surface-500">Prontidão semanal</span>
                  <span className="text-xs font-semibold text-surface-300">{readinessPct}%</span>
                </div>
                <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      readinessPct >= 80 ? "bg-green-500" :
                      readinessPct >= 50 ? "bg-brand-500" : "bg-yellow-500"
                    }`}
                    style={{ width: `${readinessPct}%` }}
                  />
                </div>
              </div>
            </Link>
          );
        })() : (
          /* No upcoming race — CTA */
          <Link href="/races" className="card-hover p-4 block group">
            <div className="flex items-center justify-between mb-3">
              <p className="stat-label">Próxima prova</p>
              <Flag className="w-4 h-4 text-surface-600" />
            </div>
            <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
              <div className="w-10 h-10 rounded-xl bg-surface-700 flex items-center justify-center group-hover:bg-brand-500/20 transition-colors">
                <Plus className="w-5 h-5 text-surface-500 group-hover:text-brand-400 transition-colors" />
              </div>
              <p className="text-sm text-surface-500 group-hover:text-surface-300 transition-colors">
                Adicionar próxima prova
              </p>
            </div>
          </Link>
        )}
      </div>

      {/* CTL/ATL/TSB Fitness Card */}
      {fitnessData.length > 7 && (
        <FitnessCard data={fitnessData} />
      )}

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

      {/* Stats grid (trimmed to 6 most important) */}
      {!isNewUser && (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total de corridas" value={runs.length} icon={Target} />
        <StatCard
          label="Distância total"
          value={`${totalDist.toFixed(0)} km`}
          sub={`${totalDist.toFixed(1)} km exatos`}
          icon={MapPin}
          accent
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
          label="Volume mensal"
          value={`${monthly.toFixed(1)} km`}
          icon={Calendar}
        />
      </div>
      )}

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

      {/* Achievements & Personal Records */}
      {!isNewUser && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AchievementsCard achievements={achievements} />
        <PersonalRecordsCard records={historicalRecords} />
      </div>
      )}

      {/* Training balance */}
      {!isNewUser && (
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Dumbbell className="w-4 h-4 text-surface-400" />
          <h2 className="section-title">Balanço de treinos (últimos 30 dias)</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-500 shrink-0" />
            <span className="text-surface-300">
              <strong className="text-surface-100">{balance30RunCount}</strong> corridas
            </span>
          </span>
          <span className="text-surface-600">·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
            <span className="text-surface-300">
              <strong className="text-surface-100">{balance30GymCount}</strong> sessões de musculação
            </span>
          </span>
          {balance30OtherCount > 0 && (
            <>
              <span className="text-surface-600">·</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-surface-500 shrink-0" />
                <span className="text-surface-300">
                  <strong className="text-surface-100">{balance30OtherCount}</strong> outras
                </span>
              </span>
            </>
          )}
          {lastSync && (
            <span className="ml-auto text-xs text-surface-500">
              Strava sync: {new Date(lastSync.created_at).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
