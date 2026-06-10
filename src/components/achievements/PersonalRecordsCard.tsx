"use client";

import { TrendingDown, TrendingUp, Target } from "lucide-react";
import type { DistanceRecord } from "@/lib/historical-comparison";

interface PersonalRecordsCardProps {
  records: DistanceRecord[];
}

export function PersonalRecordsCard({ records }: PersonalRecordsCardProps) {
  const withRecords = records.filter(r => r.personalBest);

  if (withRecords.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <Target className="w-5 h-5 text-brand-400" />
          </div>
          <h2 className="section-title">Recordes Pessoais</h2>
        </div>
        <p className="text-sm text-surface-500 text-center py-4">
          Seus PRs aparecerão aqui conforme você completa diferentes distâncias
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
          <Target className="w-5 h-5 text-brand-400" />
        </div>
        <h2 className="section-title">Recordes Pessoais</h2>
      </div>

      {/* Records list */}
      <div className="space-y-2">
        {withRecords.map(record => (
          <div
            key={record.label}
            className="bg-surface-700/30 rounded-lg p-3 space-y-2"
          >
            {/* Distance label + PR */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wide">
                  {record.label}
                </p>
                <p className="text-sm font-bold text-surface-100 mt-0.5">
                  {record.personalBest?.pace} /km
                </p>
              </div>
              <div className="text-right text-xs text-surface-500">
                <p>{record.personalBest?.date}</p>
              </div>
            </div>

            {/* Comparison section (this vs last month) */}
            {record.thisMonth || record.lastMonth ? (
              <div className="flex items-center gap-2 pt-1 border-t border-surface-600/30">
                {record.lastMonth && (
                  <div className="text-[10px] text-surface-600">
                    Mês passado: {record.lastMonth.pace} /km
                  </div>
                )}

                {record.thisMonth && record.improvement && (
                  <div className="flex items-center gap-1 ml-auto">
                    {record.trend === "up" && (
                      <>
                        <TrendingDown className="w-3 h-3 text-green-400" />
                        <span className="text-[10px] text-green-400 font-semibold">
                          {record.improvement} mais rápido
                        </span>
                      </>
                    )}
                    {record.trend === "down" && (
                      <>
                        <TrendingUp className="w-3 h-3 text-yellow-400" />
                        <span className="text-[10px] text-yellow-400 font-semibold">
                          {record.improvement} mais lento
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <p className="text-xs text-surface-600 pt-2">
        💡 Baseado em suas {withRecords.length} distância(s)
      </p>
    </div>
  );
}
