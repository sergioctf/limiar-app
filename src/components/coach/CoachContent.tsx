"use client";

import { useState, useMemo } from "react";
import {
  Brain, ChevronDown, ChevronUp, Award, AlertTriangle,
  TrendingUp, Calendar, BookOpen, Flag, Layers,
  Sparkles, Loader2, Activity, FlaskConical,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { computeMetrics, paceToString } from "@/lib/performance";
import type { CoachReport, TrainingCycle, PerformanceTest, WeeklyPlanData } from "@/types";
import { ZonesCard }        from "@/components/coach/ZonesCard";
import { PacesCard }        from "@/components/coach/PacesCard";
import { PredictionsCard }  from "@/components/coach/PredictionsCard";
import { TestHistoryCard }  from "@/components/coach/TestHistoryCard";
import { TestForm }         from "@/components/coach/TestForm";
import { WeeklyPlanCard }   from "@/components/coach/WeeklyPlanCard";

type Tab = "zonas" | "testes" | "relatorios";

interface Props {
  reports: CoachReport[];
  cycles:  TrainingCycle[];
  tests:   PerformanceTest[];
}

export function CoachContent({ reports, cycles, tests: initialTests }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("zonas");
  const [expanded,  setExpanded]  = useState<string | null>(reports[0]?.id ?? null);

  // Tests state (updated locally on add/delete)
  const [tests, setTests] = useState<PerformanceTest[]>(initialTests);
  const [showTestForm, setShowTestForm] = useState(false);

  // Full AI analysis state
  const [analyzing,      setAnalyzing]      = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisError,  setAnalysisError]  = useState<string | null>(null);

  // Derived: latest test + metrics
  const latestTest = tests[0] ?? null;
  const metrics = useMemo(() => {
    if (!latestTest) return null;
    return computeMetrics(
      latestTest.distance_km * 1000,
      latestTest.time_seconds,
      latestTest.avg_hr ?? undefined
    );
  }, [latestTest]);

  // Paces formatted for AI plan generation
  const pacesForPlan = useMemo(() => {
    if (!metrics?.paces) return null;
    const find = (name: string) => metrics.paces.find(p => p.name === name);
    const fmt = (min: number, max: number) =>
      `${paceToString(min)}–${paceToString(max)}/km`;
    const easy      = find("easy");
    const threshold = find("threshold");
    const marathon  = find("marathon");
    const interval  = find("interval");
    return {
      easy:      easy      ? fmt(easy.pace_min_sec,      easy.pace_max_sec)      : undefined,
      threshold: threshold ? fmt(threshold.pace_min_sec, threshold.pace_max_sec) : undefined,
      long:      marathon  ? fmt(marathon.pace_min_sec,  marathon.pace_max_sec)  : undefined,
      interval:  interval  ? fmt(interval.pace_min_sec,  interval.pace_max_sec)  : undefined,
    };
  }, [metrics]);

  // Parse existing structured weekly plan from latest week report
  const latestWeekReport = reports.find(r => r.period_type === "week") ?? null;
  const initialWeeklyPlan = useMemo((): WeeklyPlanData | null => {
    if (!latestWeekReport?.full_report) return null;
    try {
      const parsed = JSON.parse(latestWeekReport.full_report) as WeeklyPlanData;
      // Validate it's a structured plan (has days array), not old text format
      if (!Array.isArray(parsed.days)) return null;
      return parsed;
    } catch {
      return null; // old text-format reports — show empty state
    }
  }, [latestWeekReport]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleFullAnalysis() {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res  = await fetch("/api/coach/full-analysis", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.analysis) {
        setAnalysisResult(data.analysis);
      } else {
        setAnalysisError(data.error ?? "Erro ao gerar análise.");
      }
    } catch {
      setAnalysisError("Falha na conexão. Tente novamente.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleDeleteTest(id: string) {
    const res = await fetch(`/api/performance-tests/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTests(prev => prev.filter(t => t.id !== id));
    }
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: "zonas",     label: "Zonas & Plano", icon: <Activity className="w-3.5 h-3.5" /> },
    { key: "testes",    label: "Testes 3km",    icon: <FlaskConical className="w-3.5 h-3.5" /> },
    { key: "relatorios",label: "Relatórios",    icon: <Brain className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-5 max-w-3xl mx-auto animate-fade-in">
      <div>
        <h1 className="page-header">Treinador</h1>
        <p className="text-surface-500 text-sm">
          {reports.length} relatório(s) · {cycles.length} ciclo(s) · {tests.length} teste(s)
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface-700 rounded-xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.key
                ? "bg-brand-500 text-white"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB: Zonas & Plano ─────────────────────────────────────────────────── */}
      {activeTab === "zonas" && (
        <div className="space-y-4">
          {!latestTest ? (
            /* No tests yet — CTA */
            <div className="card p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto">
                <FlaskConical className="w-7 h-7 text-brand-400" />
              </div>
              <div>
                <h3 className="font-bold text-surface-100 text-lg">Nenhum teste registrado ainda</h3>
                <p className="text-sm text-surface-500 mt-2 max-w-sm mx-auto leading-relaxed">
                  O teste de 3km é um esforço máximo sustentável que leva ~10-14 minutos.
                  A partir dele calculamos seu VDOT, zonas de FC e ritmos de treino.
                </p>
              </div>
              <button
                onClick={() => { setShowTestForm(true); setActiveTab("testes"); }}
                className="btn-primary mx-auto"
              >
                + Registrar primeiro teste
              </button>
            </div>
          ) : (
            /* Has tests — show metrics */
            <>
              {/* Top stats row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-4 text-center">
                  <p className="text-xs text-surface-500 uppercase tracking-wide">VDOT</p>
                  <p className="text-2xl font-bold text-brand-400 mt-1">
                    {metrics?.vdot.toFixed(1)}
                  </p>
                  <p className="text-xs text-surface-600">ml/kg/min</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-xs text-surface-500 uppercase tracking-wide">VO2max</p>
                  <p className="text-2xl font-bold text-surface-100 mt-1">
                    {metrics?.vo2max.toFixed(1)}
                  </p>
                  <p className="text-xs text-surface-600">estimado</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-xs text-surface-500 uppercase tracking-wide">Último teste</p>
                  <p className="text-sm font-bold text-surface-200 mt-1">
                    {formatDate(latestTest.test_date)}
                  </p>
                  <p className="text-xs text-surface-600">{latestTest.distance_km} km</p>
                </div>
              </div>

              {/* Zones + Paces (side by side on desktop) */}
              {metrics && metrics.zones.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ZonesCard
                    zones={metrics.zones}
                    lthr={metrics.lthr}
                    hrmax={metrics.hrmax_estimate}
                  />
                  <PacesCard paces={metrics.paces} />
                </div>
              )}

              {/* If no HR data, only paces */}
              {metrics && metrics.zones.length === 0 && (
                <PacesCard paces={metrics.paces} />
              )}

              {/* Predictions */}
              {metrics && (
                <PredictionsCard
                  predictions={metrics.predictions}
                  testDate={latestTest.test_date}
                />
              )}

              {/* Full AI analysis */}
              <div className="card p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center">
                      <Brain className="w-5 h-5 text-brand-400" />
                    </div>
                    <div>
                      <h2 className="font-bold text-surface-100">Análise completa IA</h2>
                      <p className="text-xs text-surface-500">
                        Usa testes, histórico completo e treinos
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleFullAnalysis}
                    disabled={analyzing}
                    className="btn-primary text-xs py-1.5 px-3 shrink-0"
                  >
                    {analyzing ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />Analisando…</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5 inline mr-1.5" />{analysisResult ? "Reanalisar" : "Analisar"}</>
                    )}
                  </button>
                </div>

                {analysisError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-3">
                    <p className="text-sm text-red-400">{analysisError}</p>
                  </div>
                )}

                {analysisResult ? (
                  <p className="text-sm text-surface-300 leading-relaxed whitespace-pre-wrap">
                    {analysisResult}
                  </p>
                ) : !analyzing && (
                  <div className="text-center py-6 text-surface-500">
                    <Sparkles className="w-7 h-7 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Análise profunda com todos os seus dados</p>
                    <p className="text-xs mt-1 text-surface-600">
                      Inclui VDOT, zonas de FC, progressão e plano 8 semanas
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Interactive weekly plan — always shown */}
          <WeeklyPlanCard
            initialPlan={initialWeeklyPlan}
            initialReportId={latestWeekReport?.id ?? null}
            paces={pacesForPlan}
          />
        </div>
      )}

      {/* ── TAB: Testes 3km ──────────────────────────────────────────────────────── */}
      {activeTab === "testes" && (
        <TestHistoryCard
          tests={tests}
          onAddTest={() => setShowTestForm(true)}
          onDelete={handleDeleteTest}
        />
      )}

      {/* ── TAB: Relatórios ─────────────────────────────────────────────────────── */}
      {activeTab === "relatorios" && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="card p-8 text-center text-surface-500">
              Nenhum relatório cadastrado.
            </div>
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
                            <span className="text-xs text-surface-500">
                              {formatDate(report.report_date)}
                            </span>
                            <span className="badge bg-surface-700 text-surface-400 text-xs">
                              {report.period_type}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isOpen
                        ? <ChevronUp   className="w-4 h-4 text-surface-500 shrink-0 mt-1" />
                        : <ChevronDown className="w-4 h-4 text-surface-500 shrink-0 mt-1" />}
                    </div>

                    {report.summary && (
                      <p className="text-sm text-surface-400 mt-3 leading-relaxed line-clamp-3">
                        {report.summary}
                      </p>
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-surface-700 p-5 space-y-5">
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

                      {report.full_report && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <BookOpen className="w-4 h-4 text-surface-500" />
                            <span className="text-sm font-semibold text-surface-400">
                              Relatório completo
                            </span>
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

          {/* Cycles section (previously in separate tab) */}
          {cycles.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="font-semibold text-surface-400 text-sm flex items-center gap-2">
                <Layers className="w-4 h-4" /> Ciclos de treino
              </h3>
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
                        <p className="text-sm text-surface-400 mt-2 leading-relaxed">
                          {cycle.objective}
                        </p>
                      )}
                      {cycle.notes && (
                        <p className="text-xs text-surface-500 mt-2 leading-relaxed">
                          {cycle.notes}
                        </p>
                      )}
                      {cycle.final_assessment && (
                        <div className="mt-3 bg-surface-700/50 rounded-xl p-3">
                          <p className="text-xs font-semibold text-surface-400 mb-1">Avaliação final</p>
                          <p className="text-xs text-surface-300 leading-relaxed">
                            {cycle.final_assessment}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Test form modal */}
      {showTestForm && (
        <TestForm
          onClose={() => setShowTestForm(false)}
          onSaved={(t) => {
            setTests(prev => [t, ...prev]);
            setShowTestForm(false);
          }}
        />
      )}
    </div>
  );
}
