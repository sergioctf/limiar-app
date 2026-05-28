"use client";

import { useState } from "react";
import { BarChart3, TrendingUp, Heart, Activity, GitCompare } from "lucide-react";
import { WeeklyVolumeChart } from "./WeeklyVolumeChart";
import { MonthlyVolumeChart } from "./MonthlyVolumeChart";
import { PaceTrendChart } from "./PaceTrendChart";
import { LongRunProgressChart } from "./LongRunProgressChart";
import { HeartRateTrendChart } from "./HeartRateTrendChart";
import { EvolutionChart } from "./EvolutionChart";
import { groupByWeek, groupByMonth, buildPaceTrend } from "@/lib/utils";
import type { Run } from "@/types";

type Tab = "volume" | "pace" | "heart" | "longrun" | "evolution";

interface Props { runs: Run[] }

export function AnalyticsContent({ runs }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("volume");

  const weeklyData  = groupByWeek(runs);
  const monthlyData = groupByMonth(runs);
  const paceTrend   = buildPaceTrend(runs);
  const longRuns    = runs
    .filter((r) => r.type === "long_run" || r.distance_km >= 12)
    .sort((a, b) => a.date.localeCompare(b.date));

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "volume",    label: "Volume",   icon: BarChart3   },
    { key: "pace",      label: "Pace",     icon: TrendingUp  },
    { key: "heart",     label: "FC",       icon: Heart       },
    { key: "longrun",   label: "Longões",  icon: Activity    },
    { key: "evolution", label: "Evolução", icon: GitCompare  },
  ];

  return (
    <div className="space-y-5 max-w-4xl mx-auto animate-fade-in">
      <div>
        <h1 className="page-header">Gráficos</h1>
        <p className="text-surface-500 text-sm">{runs.length} corridas analisadas</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-700 rounded-xl p-1 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 min-w-[70px] flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === key
                ? "bg-brand-500 text-white shadow"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {activeTab === "volume" && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="section-title mb-4">Volume semanal (km)</h2>
            <WeeklyVolumeChart data={weeklyData} height={220} />
          </div>
          <div className="card p-5">
            <h2 className="section-title mb-4">Volume mensal (km)</h2>
            <MonthlyVolumeChart data={monthlyData} height={220} />
          </div>
        </div>
      )}

      {activeTab === "pace" && (
        <div className="card p-5">
          <h2 className="section-title mb-4">Evolução do pace médio</h2>
          <PaceTrendChart data={paceTrend} height={260} />
        </div>
      )}

      {activeTab === "heart" && (
        <div className="card p-5">
          <h2 className="section-title mb-4">FC média ao longo do tempo</h2>
          <HeartRateTrendChart runs={runs} height={260} />
        </div>
      )}

      {activeTab === "longrun" && (
        <div className="card p-5">
          <h2 className="section-title mb-4">Progressão dos longões</h2>
          <LongRunProgressChart runs={longRuns} height={260} />
        </div>
      )}

      {activeTab === "evolution" && (
        <div className="card p-5">
          <div className="mb-4">
            <h2 className="section-title">Evolução por distância</h2>
            <p className="text-xs text-surface-500 mt-1">
              Compare pace e FC em corridas de distâncias semelhantes ao longo do tempo
            </p>
          </div>
          <EvolutionChart runs={runs} height={200} />
        </div>
      )}
    </div>
  );
}
