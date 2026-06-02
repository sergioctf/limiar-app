"use client";

import { Plus, Trash2, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { timeToString, paceToString } from "@/lib/performance";
import type { PerformanceTest } from "@/types";

interface Props {
  tests: PerformanceTest[];
  onAddTest: () => void;
  onDelete: (id: string) => void;
}

export function TestHistoryCard({ tests, onAddTest, onDelete }: Props) {
  const maxVdot = tests.length > 0
    ? Math.max(...tests.map(t => t.vdot ?? 0))
    : 1;

  const firstVdot = tests.length > 0
    ? (tests[tests.length - 1].vdot ?? null) // tests are newest-first, so last = oldest
    : null;
  const latestVdot = tests.length > 0
    ? (tests[0].vdot ?? null)
    : null;

  const improvement = firstVdot && latestVdot && tests.length >= 2
    ? ((latestVdot - firstVdot) / firstVdot * 100).toFixed(1)
    : null;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-surface-100">Histórico de Testes 3km</h3>
          {improvement !== null && (
            <p className="text-xs text-green-400 mt-0.5 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +{improvement}% evolução no VDOT
            </p>
          )}
        </div>
        <button onClick={onAddTest} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Novo teste
        </button>
      </div>

      {tests.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-3">
            <TrendingUp className="w-6 h-6 text-brand-400 opacity-50" />
          </div>
          <p className="text-sm text-surface-500">Nenhum teste registrado ainda</p>
          <p className="text-xs text-surface-600 mt-1">
            Registre seu primeiro teste de 3km para ver sua evolução
          </p>
        </div>
      ) : (
        <>
          {/* VDOT progress chart */}
          {tests.filter(t => t.vdot).length >= 2 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">
                Evolução VDOT
              </p>
              {/* Oldest first for the chart */}
              {[...tests].reverse().filter(t => t.vdot).map((test) => {
                const barWidth = maxVdot > 0
                  ? Math.round(((test.vdot ?? 0) / maxVdot) * 100)
                  : 0;
                return (
                  <div key={test.id} className="flex items-center gap-3">
                    <span className="text-xs text-surface-500 w-20 shrink-0">
                      {test.test_date.slice(0, 7)}
                    </span>
                    <div className="flex-1 bg-surface-700/50 rounded-full h-5 overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full flex items-center justify-end pr-2 transition-all"
                        style={{ width: `${barWidth}%` }}
                      >
                        {barWidth > 30 && (
                          <span className="text-xs text-white font-bold">
                            {test.vdot?.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                    {barWidth <= 30 && (
                      <span className="text-xs text-surface-400 font-bold w-10 shrink-0">
                        {test.vdot?.toFixed(1)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Test list */}
          <div className="space-y-2">
            {tests.map((test) => {
              const pace = paceToString(test.time_seconds / test.distance_km);
              return (
                <div
                  key={test.id}
                  className="flex items-center gap-3 bg-surface-700/40 rounded-xl p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-surface-200">
                        {formatDate(test.test_date)}
                      </span>
                      <span className="text-xs text-surface-500">
                        {test.distance_km}km · {timeToString(test.time_seconds)} · {pace}/km
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {test.vdot !== null && (
                        <span className="text-xs font-semibold text-brand-400">
                          VDOT {test.vdot.toFixed(1)}
                        </span>
                      )}
                      {test.avg_hr !== null && (
                        <span className="text-xs text-surface-500">
                          FC {test.avg_hr} bpm
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => onDelete(test.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-surface-600 hover:text-red-400 transition-colors shrink-0"
                    aria-label="Excluir teste"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
