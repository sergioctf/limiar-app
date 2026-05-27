"use client";

import { useState } from "react";
import {
  Target, TrendingUp, ChevronDown, ChevronUp, MapPin,
  Calendar, Clock, Zap, Award, Shield, Flame
} from "lucide-react";
import {
  secondsToReadable, secondsToPaceString, formatDate
} from "@/lib/utils";
import type { Goal, Projection, RaceStrategy } from "@/types";

interface Props {
  goals: Goal[];
  projections: Projection[];
  strategies: RaceStrategy[];
}

const SCENARIO_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  conservative: { label: "Conservador", color: "text-blue-300",   icon: Shield },
  likely:       { label: "Provável",    color: "text-brand-300",  icon: TrendingUp },
  balanced:     { label: "Equilibrado", color: "text-brand-300",  icon: TrendingUp },
  optimistic:   { label: "Otimista",    color: "text-green-300",  icon: Award },
  aggressive:   { label: "Agressivo",   color: "text-red-300",    icon: Flame },
};

const DISTANCES = [5, 10, 15, 21.1, 42.2];

export function GoalsContent({ goals, projections, strategies }: Props) {
  const [activeTab, setActiveTab] = useState<"goals" | "projections" | "strategies">("goals");
  const [expandedGoal, setExpandedGoal] = useState<string | null>(goals[0]?.id ?? null);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);

  const groupedProjections = DISTANCES.map((dist) => ({
    distance: dist,
    label: dist === 21.1 ? "Meia Maratona" : dist === 42.2 ? "Maratona" : `${dist} km`,
    scenarios: projections.filter((p) => p.distance_km === dist),
  })).filter((g) => g.scenarios.length > 0);

  return (
    <div className="space-y-5 max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-header">Metas e Projeções</h1>
        <p className="text-surface-500 text-sm mt-0.5">{goals.length} meta(s) · {projections.length} projeções</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-700 rounded-xl p-1">
        {(["goals", "projections", "strategies"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab
                ? "bg-brand-500 text-white shadow"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            {tab === "goals" ? "Metas" : tab === "projections" ? "Projeções" : "Estratégias"}
          </button>
        ))}
      </div>

      {/* Goals tab */}
      {activeTab === "goals" && (
        <div className="space-y-3">
          {goals.length === 0 ? (
            <div className="card p-8 text-center text-surface-500">Nenhuma meta cadastrada ainda.</div>
          ) : (
            goals.map((goal) => (
              <div key={goal.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedGoal(expandedGoal === goal.id ? null : goal.id)}
                  className="w-full p-5 text-left hover:bg-surface-700/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
                        <Target className="w-5 h-5 text-brand-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-surface-100">{goal.race_name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-surface-500">
                            {goal.distance_km} km
                          </span>
                          {goal.race_date && (
                            <span className="text-xs text-surface-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {formatDate(goal.race_date)}
                            </span>
                          )}
                          <span className={`badge text-xs ${
                            goal.status === "active" ? "bg-brand-500/20 text-brand-300" :
                            goal.status === "completed" ? "bg-green-500/20 text-green-300" :
                            "bg-surface-700 text-surface-400"
                          }`}>
                            {goal.status === "active" ? "Ativo" :
                             goal.status === "completed" ? "Concluído" :
                             goal.status === "upcoming" ? "Em breve" : "Cancelado"}
                          </span>
                        </div>
                      </div>
                    </div>
                    {expandedGoal === goal.id ? (
                      <ChevronUp className="w-4 h-4 text-surface-500 mt-1 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-surface-500 mt-1 shrink-0" />
                    )}
                  </div>

                  {/* Quick times */}
                  <div className="flex gap-3 mt-3 flex-wrap">
                    {goal.conservative_time_seconds && (
                      <div className="text-center">
                        <p className="text-xs text-surface-500">Conservador</p>
                        <p className="font-mono font-bold text-blue-300 text-sm">
                          {secondsToReadable(goal.conservative_time_seconds)}
                        </p>
                      </div>
                    )}
                    {goal.likely_time_seconds && (
                      <div className="text-center">
                        <p className="text-xs text-surface-500">Provável</p>
                        <p className="font-mono font-bold text-brand-300 text-sm">
                          {secondsToReadable(goal.likely_time_seconds)}
                        </p>
                      </div>
                    )}
                    {goal.optimistic_time_seconds && (
                      <div className="text-center">
                        <p className="text-xs text-surface-500">Otimista</p>
                        <p className="font-mono font-bold text-green-300 text-sm">
                          {secondsToReadable(goal.optimistic_time_seconds)}
                        </p>
                      </div>
                    )}
                  </div>
                </button>

                {expandedGoal === goal.id && (
                  <div className="border-t border-surface-700 p-5 space-y-4">
                    {goal.strategy && (
                      <div>
                        <p className="stat-label mb-1">Estratégia</p>
                        <p className="text-sm text-surface-300 leading-relaxed">{goal.strategy}</p>
                      </div>
                    )}
                    {goal.notes && (
                      <div>
                        <p className="stat-label mb-1">Notas</p>
                        <p className="text-sm text-surface-400 leading-relaxed">{goal.notes}</p>
                      </div>
                    )}
                    {goal.target_pace_seconds_per_km && (
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-brand-400" />
                        <span className="text-sm text-surface-400">Pace alvo:</span>
                        <span className="font-mono font-bold text-brand-300">
                          {secondsToPaceString(goal.target_pace_seconds_per_km)}/km
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Projections tab */}
      {activeTab === "projections" && (
        <div className="space-y-4">
          {groupedProjections.map(({ distance, label, scenarios }) => (
            <div key={distance} className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-brand-400" />
                </div>
                <h3 className="font-bold text-surface-100">{label}</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {scenarios.map((proj) => {
                  const scenarioInfo = SCENARIO_LABELS[proj.scenario] ?? { label: proj.scenario, color: "text-surface-300", icon: TrendingUp };
                  const Icon = scenarioInfo.icon;
                  return (
                    <div key={proj.id} className="bg-surface-700/50 rounded-xl p-3 text-center">
                      <div className="flex justify-center mb-1.5">
                        <Icon className={`w-4 h-4 ${scenarioInfo.color}`} />
                      </div>
                      <p className={`text-xs font-semibold mb-1 ${scenarioInfo.color}`}>
                        {scenarioInfo.label}
                      </p>
                      <p className="font-bold text-surface-100 tabular-nums text-sm">
                        {secondsToReadable(proj.projected_time_seconds)}
                      </p>
                      <p className="font-mono text-xs text-surface-400 mt-0.5">
                        {secondsToPaceString(proj.projected_pace_seconds_per_km)}/km
                      </p>
                      {proj.confidence && (
                        <p className="text-xs text-surface-600 mt-1">{proj.confidence}</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {scenarios[0]?.assumptions && (
                <p className="text-xs text-surface-500 mt-3">{scenarios[0].assumptions}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Strategies tab */}
      {activeTab === "strategies" && (
        <div className="space-y-3">
          {strategies.length === 0 ? (
            <div className="card p-8 text-center text-surface-500">Nenhuma estratégia cadastrada.</div>
          ) : (
            strategies.map((strategy) => {
              const info = SCENARIO_LABELS[strategy.scenario] ?? { label: strategy.scenario, color: "text-surface-300", icon: TrendingUp };
              const Icon = info.icon;
              const isOpen = expandedStrategy === strategy.id;
              const splits = strategy.splits_json ? (strategy.splits_json as { splits?: Array<{ range: string; pace: string; note?: string }> }).splits ?? [] : [];

              return (
                <div key={strategy.id} className="card overflow-hidden">
                  <button
                    onClick={() => setExpandedStrategy(isOpen ? null : strategy.id)}
                    className="w-full p-5 text-left hover:bg-surface-700/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-surface-700 flex items-center justify-center shrink-0">
                          <Icon className={`w-4.5 h-4.5 ${info.color}`} />
                        </div>
                        <div>
                          <p className="font-semibold text-surface-100">{strategy.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs font-medium ${info.color}`}>{info.label}</span>
                            {strategy.target_time_seconds && (
                              <span className="text-xs text-surface-500 font-mono">
                                {secondsToReadable(strategy.target_time_seconds)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-surface-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-surface-500 shrink-0" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-surface-700 p-5 space-y-4">
                      {strategy.strategy_text && (
                        <p className="text-sm text-surface-300 leading-relaxed">{strategy.strategy_text}</p>
                      )}

                      {splits.length > 0 && (
                        <div>
                          <p className="stat-label mb-2">Splits</p>
                          <div className="space-y-1.5">
                            {splits.map((split, i) => (
                              <div key={i} className="flex items-center justify-between bg-surface-700/50 rounded-lg px-3 py-2 text-sm">
                                <span className="text-surface-400 text-xs">{split.range}</span>
                                <span className="font-mono font-bold text-surface-200">{split.pace}</span>
                                {split.note && <span className="text-xs text-surface-500 italic">{split.note}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {strategy.hydration_plan && (
                        <div>
                          <p className="stat-label mb-1">Hidratação</p>
                          <p className="text-sm text-surface-300">{strategy.hydration_plan}</p>
                        </div>
                      )}

                      {strategy.gel_plan && (
                        <div>
                          <p className="stat-label mb-1">Géis</p>
                          <p className="text-sm text-surface-300">{strategy.gel_plan}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
