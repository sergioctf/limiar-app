"use client";

import { useState } from "react";
import {
  Brain, ChevronDown, ChevronUp, Award, AlertTriangle,
  TrendingUp, Calendar, BookOpen, Flag, Layers
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { CoachReport, TrainingCycle } from "@/types";

interface Props {
  reports: CoachReport[];
  cycles: TrainingCycle[];
}

export function CoachContent({ reports, cycles }: Props) {
  const [activeTab, setActiveTab] = useState<"reports" | "cycles">("reports");
  const [expanded, setExpanded] = useState<string | null>(reports[0]?.id ?? null);

  return (
    <div className="space-y-5 max-w-3xl mx-auto animate-fade-in">
      <div>
        <h1 className="page-header">Treinador</h1>
        <p className="text-surface-500 text-sm">{reports.length} relatório(s) · {cycles.length} ciclo(s)</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-700 rounded-xl p-1">
        <button
          onClick={() => setActiveTab("reports")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "reports" ? "bg-brand-500 text-white" : "text-surface-400 hover:text-surface-200"
          }`}
        >
          <Brain className="w-3.5 h-3.5" /> Relatórios
        </button>
        <button
          onClick={() => setActiveTab("cycles")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "cycles" ? "bg-brand-500 text-white" : "text-surface-400 hover:text-surface-200"
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Ciclos
        </button>
      </div>

      {/* Reports */}
      {activeTab === "reports" && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="card p-8 text-center text-surface-500">Nenhum relatório cadastrado.</div>
          ) : (
            reports.map((report) => {
              const isOpen = expanded === report.id;
              return (
                <div key={report.id} className="card overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : report.id)}
                    className="w-full p-5 text-left hover:bg-surface-700/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
                          <Brain className="w-5 h-5 text-brand-400" />
                        </div>
                        <div>
                          <h3 className="font-bold text-surface-100 text-sm">{report.title}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Calendar className="w-3 h-3 text-surface-600" />
                            <span className="text-xs text-surface-500">{formatDate(report.report_date)}</span>
                            <span className="badge bg-surface-700 text-surface-400 text-xs">
                              {report.period_type}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-surface-500 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-surface-500 shrink-0 mt-1" />}
                    </div>

                    {report.summary && (
                      <p className="text-sm text-surface-400 mt-3 leading-relaxed line-clamp-3">
                        {report.summary}
                      </p>
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-surface-700 p-5 space-y-5">
                      {/* Strengths */}
                      {report.strengths && (
                        <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <Award className="w-4 h-4 text-green-400" />
                            <span className="text-sm font-semibold text-green-400">Pontos fortes</span>
                          </div>
                          <p className="text-sm text-surface-300 leading-relaxed whitespace-pre-line">
                            {report.strengths}
                          </p>
                        </div>
                      )}

                      {/* Weaknesses */}
                      {report.weaknesses && (
                        <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-yellow-400" />
                            <span className="text-sm font-semibold text-yellow-400">Pontos de atenção</span>
                          </div>
                          <p className="text-sm text-surface-300 leading-relaxed whitespace-pre-line">
                            {report.weaknesses}
                          </p>
                        </div>
                      )}

                      {/* Recommendations */}
                      {report.recommendations && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-4 h-4 text-brand-400" />
                            <span className="text-sm font-semibold text-brand-400">Recomendações</span>
                          </div>
                          <p className="text-sm text-surface-300 leading-relaxed whitespace-pre-line">
                            {report.recommendations}
                          </p>
                        </div>
                      )}

                      {/* Projections */}
                      {report.projections && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Flag className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-semibold text-blue-400">Projeções</span>
                          </div>
                          <p className="text-sm text-surface-300 leading-relaxed">
                            {report.projections}
                          </p>
                        </div>
                      )}

                      {/* Full report */}
                      {report.full_report && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <BookOpen className="w-4 h-4 text-surface-500" />
                            <span className="text-sm font-semibold text-surface-400">Relatório completo</span>
                          </div>
                          <div className="bg-surface-700/50 rounded-xl p-4 max-h-96 overflow-y-auto">
                            <p className="text-xs text-surface-400 leading-relaxed whitespace-pre-wrap font-mono">
                              {report.full_report}
                            </p>
                          </div>
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

      {/* Cycles */}
      {activeTab === "cycles" && (
        <div className="space-y-3">
          {cycles.map((cycle, idx) => (
            <div key={cycle.id} className="card p-5">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-300">
                    {idx + 1}
                  </div>
                  {idx < cycles.length - 1 && (
                    <div className="w-0.5 h-6 bg-surface-700 mt-1" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-surface-100">{cycle.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-surface-500">
                    <Calendar className="w-3 h-3" />
                    {formatDate(cycle.start_date)}
                    {cycle.end_date && <> → {formatDate(cycle.end_date)}</>}
                  </div>
                  {cycle.objective && (
                    <p className="text-sm text-surface-400 mt-2 leading-relaxed">{cycle.objective}</p>
                  )}
                  {cycle.notes && (
                    <p className="text-xs text-surface-500 mt-2 leading-relaxed">{cycle.notes}</p>
                  )}
                  {cycle.final_assessment && (
                    <div className="mt-3 bg-surface-700/50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-surface-400 mb-1">Avaliação final</p>
                      <p className="text-xs text-surface-300 leading-relaxed">{cycle.final_assessment}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
