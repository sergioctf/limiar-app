"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Target, TrendingUp, ChevronDown, ChevronUp, MapPin,
  Calendar, Clock, Zap, Award, Shield, Flame,
  Plus, Check, RotateCcw, Loader2, History, Sparkles,
} from "lucide-react";
import {
  secondsToReadable, secondsToPaceString, formatDate
} from "@/lib/utils";
import type { Goal, Projection, RaceStrategy, PerformanceTest } from "@/types";
import { SmartGoalsCard } from "@/components/goals/SmartGoalsCard";
import { AddGoalForm } from "@/components/goals/AddGoalForm";
import { localDateStr } from "@/lib/week";

interface Props {
  goals: Goal[];
  projections: Projection[];
  strategies: RaceStrategy[];
  latestTest?: PerformanceTest | null;
}

const SCENARIO_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  conservative: { label: "Conservador", color: "text-blue-300",   icon: Shield },
  likely:       { label: "Provável",    color: "text-brand-300",  icon: TrendingUp },
  balanced:     { label: "Equilibrado", color: "text-brand-300",  icon: TrendingUp },
  optimistic:   { label: "Otimista",    color: "text-green-300",  icon: Award },
  aggressive:   { label: "Agressivo",   color: "text-red-300",    icon: Flame },
};

const DISTANCES = [5, 10, 15, 21.1, 42.2];

export function GoalsContent({ goals, projections, strategies, latestTest = null }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"goals" | "projections" | "strategies">("goals");
  const [expandedGoal, setExpandedGoal] = useState<string | null>(goals[0]?.id ?? null);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  const [updatingGoal, setUpdatingGoal] = useState<string | null>(null);
  const [showPastStrategies, setShowPastStrategies] = useState(false);
  const [generatingStrategy, setGeneratingStrategy] = useState(false);
  const [strategyError, setStrategyError] = useState<string | null>(null);

  const todayStr = localDateStr();

  /** Mark a goal completed (or reopen it) and refresh the server data. */
  async function setGoalStatus(id: string, status: Goal["status"]) {
    setUpdatingGoal(id);
    try {
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) router.refresh();
    } finally {
      setUpdatingGoal(null);
    }
  }

  /** Generate/refresh the AI race strategy for a goal, grounded in current fitness. */
  async function generateStrategy(goalId: string) {
    setGeneratingStrategy(true);
    setStrategyError(null);
    try {
      const res = await fetch("/api/goals/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId }),
      });
      if (res.ok) router.refresh();
      else {
        const d = await res.json().catch(() => null);
        setStrategyError(d?.error ?? "Não foi possível gerar a estratégia.");
      }
    } catch {
      setStrategyError("Falha na conexão.");
    } finally {
      setGeneratingStrategy(false);
    }
  }

  // A race that already happened is history, whatever its stored status says.
  const isPastGoal = (g: Goal) => !!g.race_date && g.race_date < todayStr;

  /** Next upcoming race — drives which strategies are shown first. */
  const nextGoal = goals
    .filter(g => g.race_date && g.race_date >= todayStr && g.status !== "cancelled")
    .sort((a, b) => (a.race_date ?? "").localeCompare(b.race_date ?? ""))[0] ?? null;

  const goalById = new Map(goals.map(g => [g.id, g] as const));

  /**
   * Finished goals stop competing for attention.
   *
   * A season's worth of completed races pushed the one the athlete is actually
   * training for below the fold. They are still here — collapsed, and counted.
   */
  const isFinished = (g: Goal) =>
    g.status === "completed" || g.status === "cancelled" || isPastGoal(g);

  const currentGoals  = goals.filter(g => !isFinished(g));
  const finishedGoals = goals.filter(isFinished)
    .sort((a, b) => (b.race_date ?? "").localeCompare(a.race_date ?? ""));

  // Strategies whose race already happened are archived, not deleted.
  const isPastStrategy = (s: RaceStrategy) => {
    const g = s.goal_id ? goalById.get(s.goal_id) : null;
    return !!g && isPastGoal(g);
  };
  const currentStrategies = strategies.filter(s => !isPastStrategy(s));
  const pastStrategies    = strategies.filter(isPastStrategy);

  // Strategies for the next race come first.
  const sortedStrategies = [...currentStrategies].sort((a, b) => {
    const aNext = nextGoal && a.goal_id === nextGoal.id ? 0 : 1;
    const bNext = nextGoal && b.goal_id === nextGoal.id ? 0 : 1;
    return aNext - bNext;
  });

  const groupedProjections = DISTANCES.map((dist) => ({
    distance: dist,
    label: dist === 21.1 ? "Meia Maratona" : dist === 42.2 ? "Maratona" : `${dist} km`,
    scenarios: projections.filter((p) => p.distance_km === dist),
  })).filter((g) => g.scenarios.length > 0);

  return (
    <div className="space-y-5 max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-header">Metas e Projeções</h1>
          <p className="text-surface-500 text-sm mt-0.5">{goals.length} meta(s) · {projections.length} projeções</p>
        </div>
        <button
          onClick={() => { setShowAddGoal(v => !v); setActiveTab("goals"); }}
          className="btn-primary shrink-0 text-xs py-2 px-3"
        >
          <Plus className="w-4 h-4" /><span className="hidden sm:inline">Nova meta</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-700 rounded-xl p-1">
        {(["goals", "projections", "strategies"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab
                ? "bg-surface-600 text-surface-100 shadow-sm"
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
          {showAddGoal && <AddGoalForm onClose={() => setShowAddGoal(false)} />}

          {/* Smart goal suggestions based on current fitness */}
          <SmartGoalsCard latestTest={latestTest} />

          {goals.length === 0 && (
            <div className="card p-8 text-center text-surface-500">Nenhuma meta cadastrada ainda.</div>
          )}

          {goals.length > 0 && currentGoals.length === 0 && (
            <div className="card p-6 text-center text-surface-500 text-sm">
              Nenhuma meta em aberto — todas as suas provas já aconteceram.
              Adicione a próxima para o treinador ter um alvo.
            </div>
          )}

          {[...currentGoals, ...(showFinished ? finishedGoals : [])].map((goal) => (
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

                {/* Actions — conclude / reopen */}
                <div className="flex items-center gap-2 px-5 pb-4 -mt-1">
                  {goal.status === "completed" ? (
                    <button
                      onClick={() => setGoalStatus(goal.id, "active")}
                      disabled={updatingGoal === goal.id}
                      className="btn-secondary text-xs min-h-[44px] py-1.5 px-3"
                    >
                      {updatingGoal === goal.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <><RotateCcw className="w-3.5 h-3.5" /> Reabrir</>}
                    </button>
                  ) : (
                    <button
                      onClick={() => setGoalStatus(goal.id, "completed")}
                      disabled={updatingGoal === goal.id}
                      className="flex items-center gap-1.5 text-xs font-semibold text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/15 border border-green-500/20 rounded-lg min-h-[44px] py-1.5 px-3 transition-colors disabled:opacity-60"
                    >
                      {updatingGoal === goal.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <><Check className="w-3.5 h-3.5" /> Marcar como concluída</>}
                    </button>
                  )}
                  {isPastGoal(goal) && goal.status !== "completed" && (
                    <span className="text-[11px] text-yellow-400">prova já ocorreu</span>
                  )}
                </div>

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
            ))}

          {finishedGoals.length > 0 && (
            <button
              onClick={() => setShowFinished(v => !v)}
              className="w-full card p-3 flex items-center justify-center gap-2 text-xs font-semibold text-surface-400 hover:text-surface-200 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              {showFinished ? "Ocultar" : "Ver"} {finishedGoals.length} meta{finishedGoals.length > 1 ? "s" : ""} concluída{finishedGoals.length > 1 ? "s" : ""}
              {showFinished ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
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
                        <p className="text-xs text-surface-500 mt-1">{proj.confidence}</p>
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
          {/* Which race these strategies are for */}
          {nextGoal ? (
            <div className="card p-4 bg-brand-500/5 border-brand-500/20">
              <p className="stat-label mb-1">Próxima prova</p>
              <p className="font-bold text-surface-100">{nextGoal.race_name}</p>
              <p className="text-xs text-surface-500 mt-0.5">
                {nextGoal.distance_km} km
                {nextGoal.race_date && <> · {formatDate(nextGoal.race_date)}</>}
                {nextGoal.race_date && (
                  <> · faltam {Math.max(0, Math.ceil(
                    (new Date(`${nextGoal.race_date}T12:00:00`).getTime() - Date.now()) / 86400000
                  ))} dias</>
                )}
              </p>

              <button
                onClick={() => generateStrategy(nextGoal.id)}
                disabled={generatingStrategy}
                className="btn-primary mt-3 text-xs py-2 px-3"
              >
                {generatingStrategy ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando…</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" />
                    {currentStrategies.some(s => s.goal_id === nextGoal.id)
                      ? "Atualizar estratégia com meu condicionamento atual"
                      : "Gerar estratégia com IA"}</>
                )}
              </button>
              <p className="text-[11px] text-surface-500 mt-1.5 leading-relaxed">
                Usa seu VDOT, volume e corridas recentes. Gere de novo depois de treinos importantes para manter atualizada.
              </p>
              {strategyError && <p className="text-xs text-red-400 mt-2">{strategyError}</p>}
            </div>
          ) : (
            <div className="card p-4">
              <p className="text-sm text-surface-400">
                Nenhuma prova futura cadastrada. Crie uma meta com data para ver estratégias específicas.
              </p>
            </div>
          )}

          {sortedStrategies.length === 0 ? (
            <div className="card p-8 text-center text-surface-500">
              {pastStrategies.length > 0
                ? "Nenhuma estratégia para provas futuras."
                : "Nenhuma estratégia cadastrada."}
            </div>
          ) : (
            sortedStrategies.map((strategy) => {
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

          {/* Archived: strategies for races that already happened */}
          {pastStrategies.length > 0 && (
            <div className="pt-1">
              <button
                onClick={() => setShowPastStrategies(v => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-surface-500 hover:text-surface-300 transition-colors py-2"
              >
                <History className="w-3.5 h-3.5" />
                Provas já realizadas ({pastStrategies.length})
                {showPastStrategies ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showPastStrategies && (
                <div className="space-y-2">
                  {pastStrategies.map((s) => {
                    const g = s.goal_id ? goalById.get(s.goal_id) : null;
                    return (
                      <div key={s.id} className="card p-4 opacity-60">
                        <p className="font-semibold text-surface-300 text-sm">{s.title}</p>
                        <p className="text-xs text-surface-500 mt-0.5">
                          {g?.race_name}
                          {g?.race_date && <> · {formatDate(g.race_date)}</>}
                          {" · "}realizada
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
