"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, Target, Check, Loader2, ChevronRight, FlaskConical, TrendingUp,
} from "lucide-react";
import { secondsToReadable, secondsToPaceString } from "@/lib/utils";
import { generateSmartGoals, vdotContext, type SmartGoalSuggestion, type GoalScenario } from "@/lib/smart-goals";
import type { PerformanceTest } from "@/types";

interface Props {
  latestTest: PerformanceTest | null;
}

const CONFIDENCE_STYLE: Record<string, string> = {
  "alta":  "text-green-400 bg-green-500/10 border-green-500/20",
  "média": "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  "baixa": "text-surface-400 bg-surface-700/40 border-surface-600",
};

const SCENARIO_STYLE: Record<GoalScenario["key"], { color: string; dot: string }> = {
  current:   { color: "text-blue-300",  dot: "bg-blue-400" },
  realistic: { color: "text-brand-300", dot: "bg-brand-400" },
  ambitious: { color: "text-green-300", dot: "bg-green-400" },
};

export function SmartGoalsCard({ latestTest }: Props) {
  const router = useRouter();
  const suggestions = useMemo(() => generateSmartGoals(latestTest), [latestTest]);
  const ctx = useMemo(() => vdotContext(latestTest), [latestTest]);

  const [selected, setSelected] = useState<string | null>(suggestions[0]?.label ?? null);
  const [creating, setCreating] = useState<string | null>(null);
  const [created, setCreated] = useState<Set<string>>(new Set());

  // No test → empty state guiding the user to run a test
  if (!latestTest || suggestions.length === 0) {
    return (
      <div className="card p-5 border-brand-500/20">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h2 className="font-bold text-surface-100">Metas inteligentes</h2>
            <p className="text-xs text-surface-500">Sugestões baseadas na sua forma atual</p>
          </div>
        </div>
        <div className="bg-surface-700/30 rounded-xl p-4 flex items-start gap-3">
          <FlaskConical className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
          <p className="text-sm text-surface-400 leading-relaxed">
            Registre um <strong className="text-surface-200">teste de 3km</strong> na aba Treinador
            para a IA calcular seu VDOT e sugerir metas realistas para cada distância.
          </p>
        </div>
      </div>
    );
  }

  const active = suggestions.find(s => s.label === selected) ?? suggestions[0];

  async function createGoal(suggestion: SmartGoalSuggestion, scenario: GoalScenario) {
    const tag = `${suggestion.label}-${scenario.key}`;
    setCreating(tag);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          race_name:                  `${suggestion.label} — ${scenario.label}`,
          distance_km:                suggestion.distanceKm,
          target_time_seconds:        scenario.timeSeconds,
          target_pace_seconds_per_km: scenario.paceSecPerKm,
          conservative_time_seconds:  suggestion.current.timeSeconds,
          likely_time_seconds:        suggestion.realistic.timeSeconds,
          optimistic_time_seconds:    suggestion.ambitious.timeSeconds,
          status:                     "active",
          strategy:                   `Meta gerada a partir da sua forma atual (VDOT ${ctx?.vdot ?? "—"}). ` +
                                      `Ritmo alvo: ${secondsToPaceString(scenario.paceSecPerKm)}/km.`,
        }),
      });
      if (res.ok) {
        setCreated(prev => new Set(prev).add(tag));
        router.refresh();
      }
    } catch {
      // silently ignore — button returns to default state
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="card p-5 border-brand-500/20 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h2 className="font-bold text-surface-100">Metas inteligentes</h2>
            <p className="text-xs text-surface-500">
              Baseado no seu VDOT {ctx?.vdot} (teste de {ctx?.testLabel})
            </p>
          </div>
        </div>
      </div>

      {/* Distance selector pills */}
      <div className="flex gap-1.5 flex-wrap">
        {suggestions.map(s => (
          <button
            key={s.label}
            onClick={() => setSelected(s.label)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              active.label === s.label
                ? "bg-brand-500 text-white"
                : "bg-surface-700 text-surface-400 hover:text-surface-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Active suggestion — 3 scenarios */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-surface-500 uppercase tracking-wide">
            {active.label}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLE[active.confidence]}`}>
            confiança {active.confidence}
          </span>
        </div>

        {([active.current, active.realistic, active.ambitious]).map((sc) => {
          const tag = `${active.label}-${sc.key}`;
          const style = SCENARIO_STYLE[sc.key];
          const isCreated = created.has(tag);
          const isCreating = creating === tag;
          return (
            <div
              key={sc.key}
              className="flex items-center gap-3 bg-surface-700/30 rounded-xl p-3"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-surface-200">{sc.label}</span>
                  {sc.deltaPct < 0 && (
                    <span className="text-[10px] text-green-400 flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" />{Math.abs(sc.deltaPct)}% mais rápido
                    </span>
                  )}
                </div>
                <p className="text-xs text-surface-500">{secondsToPaceString(sc.paceSecPerKm)}/km</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`font-mono font-bold text-sm ${style.color}`}>
                  {secondsToReadable(sc.timeSeconds)}
                </p>
              </div>
              <button
                onClick={() => createGoal(active, sc)}
                disabled={isCreating || isCreated}
                title="Criar meta"
                className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  isCreated
                    ? "bg-green-500/20 text-green-400"
                    : "bg-surface-700 text-surface-400 hover:bg-brand-500/20 hover:text-brand-400 active:scale-95"
                }`}
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" />
                  : isCreated ? <Check className="w-4 h-4" />
                  : <Target className="w-4 h-4" />}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-surface-600 flex items-center gap-1">
        <ChevronRight className="w-3 h-3" />
        Toque no alvo para criar uma meta com esse tempo
      </p>
    </div>
  );
}
