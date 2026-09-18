"use client";

import { useState, useMemo } from "react";
import {
  Brain, ChevronDown, ChevronUp, Award, AlertTriangle,
  TrendingUp, Calendar, CalendarDays, BookOpen, Flag, Layers,
  Sparkles, Loader2, Activity, FlaskConical, User,
  Gauge, Dumbbell, Footprints, Target,
} from "lucide-react";
import { formatDate, secondsToPaceString } from "@/lib/utils";
import { Card, Section } from "@/components/ui/Surface";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { Disclosure } from "@/components/ui/Disclosure";
import { computeMetrics, paceToString } from "@/lib/performance";
import type { CoachReport, TrainingCycle, PerformanceTest, WeeklyPlanData } from "@/types";
import { ZonesCard }            from "@/components/coach/ZonesCard";
import { PacesCard }            from "@/components/coach/PacesCard";
import { PredictionsCard }      from "@/components/coach/PredictionsCard";
import { TestHistoryCard }      from "@/components/coach/TestHistoryCard";
import { TestForm }             from "@/components/coach/TestForm";
import { WeeklyPlanCard }       from "@/components/coach/WeeklyPlanCard";
import { WeekQuestionCard }     from "@/components/today/WeekQuestionCard";
import { PlanFreshnessBanner } from "@/components/coach/PlanFreshnessBanner";
import { SportSelector }        from "@/components/coach/SportSelector";
import { ShoesCard }            from "@/components/coach/ShoesCard";
import { SportZonesCard }       from "@/components/coach/SportZonesCard";
import { TrainingPrefsCard }    from "@/components/coach/TrainingPrefsCard";
import { PersonalRecords }       from "@/components/records/PersonalRecords";
import { StaleTestWarning }     from "@/components/coach/StaleTestWarning";
import { AdvisorCard }          from "@/components/coach/AdvisorCard";
import { DefaultWeekNotice }    from "@/components/coach/DefaultWeekNotice";
import { StrengthPrefsCard }    from "@/components/coach/StrengthPrefsCard";
import { SplitRebalanceCard }   from "@/components/coach/SplitRebalanceCard";
import { StrengthProgressCard } from "@/components/coach/StrengthProgressCard";
import { VdotEvolutionChart }   from "@/components/coach/VdotEvolutionChart";
import { AthleteProfileCard }   from "@/components/coach/AthleteProfileCard";
import { PlanAdherenceCard }    from "@/components/coach/PlanAdherenceCard";
import { WeekRecapCard }        from "@/components/coach/WeekRecapCard";
import { CycleSummaryCard }     from "@/components/dashboard/CycleSummaryCard";
import { TestCalibrationCard }  from "@/components/dashboard/TestCalibrationCard";
import type { WeekRecap }       from "@/lib/week-recap";
import { AerobicEfficiencyCard } from "@/components/coach/AerobicEfficiencyCard";
import { ProactiveAdjustBanner } from "@/components/coach/ProactiveAdjustBanner";
import { MacroPlanCard }        from "@/components/coach/MacroPlanCard";
import type { WeekAdherence }   from "@/lib/plan-adherence";
import type { EfficiencyTrend } from "@/lib/aerobic-efficiency";
import type { MacroPlan }       from "@/types";

type Tab = "zonas" | "testes" | "relatorios" | "perfil";

interface Props {
  /** The week that just closed, in three questions. Null while none has. */
  recap?: WeekRecap | null;
  /** For where the block sits in its four-week cycle (moved from the Home, 18/09). */
  cycleRuns?: import("@/types").Run[];
  cycleActivities?: Array<{ date: string; sport_type: string }>;
  reports: CoachReport[];
  cycles:  TrainingCycle[];
  tests:   PerformanceTest[];
  adherenceHistory?: WeekAdherence[];
  efficiencyTrend?: EfficiencyTrend | null;
  macroPlan?: MacroPlan | null;
  weeklyActualKm?: Record<string, number>;
}

export function CoachContent({ recap = null, cycleRuns = [], cycleActivities = [], reports, cycles, tests: initialTests, adherenceHistory = [], efficiencyTrend = null, macroPlan = null, weeklyActualKm = {} }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("zonas");
  const [expanded,  setExpanded]  = useState<string | null>(reports[0]?.id ?? null);

  // Tests state (updated locally on add/delete)
  const [tests, setTests] = useState<PerformanceTest[]>(initialTests);
  const [showTestForm, setShowTestForm] = useState(false);

  // New pattern alerts badge — counts pattern_detector notes from last 7 days
  const [patternAlerts, setPatternAlerts] = useState(0);
  useState(() => {
    fetch("/api/coach/memory")
      .then(r => r.json())
      .then((data: { notes?: Array<{ source: string; created_at: string }> }) => {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const fresh = (data.notes ?? []).filter(
          n => n.source === "pattern_detector" && n.created_at >= sevenDaysAgo
        );
        setPatternAlerts(fresh.length);
      })
      .catch(() => {});
  });

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

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { key: "zonas",     label: "Zonas & Plano", icon: <Activity     className="w-3.5 h-3.5" /> },
    { key: "testes",    label: "Testes 3km",    icon: <FlaskConical className="w-3.5 h-3.5" /> },
    { key: "perfil",    label: "Perfil IA",     icon: <User         className="w-3.5 h-3.5" />, badge: patternAlerts },
    { key: "relatorios",label: "Relatórios",    icon: <Brain        className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-5 max-w-3xl mx-auto animate-fade-in">
      <div>
        <h1 className="page-header">Treinador</h1>
        <p className="text-surface-500 text-sm">
          {reports.length} relatório(s) · {cycles.length} ciclo(s) · {tests.length} teste(s)
        </p>
      </div>

      {/* Tab bar — 2×2 on mobile, single row on sm+ */}
      <div className="grid grid-cols-2 sm:flex gap-1 bg-surface-700 rounded-xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center justify-center gap-1.5 py-2.5 sm:py-2 px-2 sm:px-3 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors duration-100 active:opacity-70 sm:flex-1 ${
              activeTab === tab.key
                ? "bg-surface-600 text-surface-100 shadow-sm"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            {tab.icon}
            <span className="truncate">{tab.label}</span>
            {tab.badge ? (
              <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shrink-0">
                {tab.badge > 9 ? "9+" : tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── TAB: Zonas & Plano ─────────────────────────────────────────────────── */}
      {activeTab === "zonas" && (
        <div className="space-y-5">
          {/*
            What the athlete came for, with nothing competing against it.

            This tab used to stack twenty five blocks of equal weight — the plan,
            the advisor, five configuration cards, the zones, the paces, the
            predictions, two charts and the macro plan, all at once. The plan is
            the reason anybody opens the coach; the rest is the machinery behind
            it, and machinery belongs one tap down.
          */}

          {/* Stale VDOT silently corrupts every pace below — flag it first */}
          <StaleTestWarning
            latestTest={latestTest}
            onAddTest={() => { setShowTestForm(true); setActiveTab("testes"); }}
          />

          <DefaultWeekNotice onConfigure={() => {
            document.getElementById("training-prefs")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }} />

          <PlanFreshnessBanner />

          {/* Where "Responder depois" on the week question leads: next to the plan it changes. */}
          <WeekQuestionCard />

          {/* The week that ended, right above the week it produced. */}
          <WeekRecapCard recap={recap} />

          <WeeklyPlanCard
            initialPlan={initialWeeklyPlan}
            initialReportId={latestWeekReport?.id ?? null}
            paces={pacesForPlan}
          />

          {/* Where this week sits in the four-week block, beside the week itself. */}
          <CycleSummaryCard runs={cycleRuns} tests={tests} activities={cycleActivities} />

          {/* Speaks only when the test is due; the no-test case has its own card below. */}
          {tests.length > 0 && <TestCalibrationCard tests={tests} />}

          {/* The advisor reads everything above and proposes; it never edits. */}
          <AdvisorCard onGoToTests={() => { setShowTestForm(true); setActiveTab("testes"); }} />

          {!latestTest ? (
            /*
              No test yet — the one case where calibration outranks the plan.
              Without it the engine cannot prescribe a single pace, so the plan
              above is structure with every number missing.
            */
            <Card density="roomy" className="text-center space-y-4">
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
            </Card>
          ) : (
            <Section title="Calibração" subtitle={"Teste de " + formatDate(latestTest.test_date)}>
              <div className="space-y-2">
                <Card>
                  <MetricGrid cols={3}>
                    <Metric label="VDOT" value={metrics?.vdot.toFixed(1) ?? "—"} tone="brand" detail="ml/kg/min" />
                    <Metric label="VO2max" value={metrics?.vo2max.toFixed(1) ?? "—"} detail="estimado" />
                    <Metric label="Teste" value={latestTest.distance_km + " km"} detail={formatDate(latestTest.test_date)} />
                  </MetricGrid>
                </Card>

                <Disclosure
                  title="Ritmos e zonas"
                  icon={<Gauge className="w-4 h-4" />}
                  summary={
                    metrics?.paces.find(x => x.name === "threshold")
                      ? "Limiar " + secondsToPaceString(metrics.paces.find(x => x.name === "threshold")!.pace_max_sec) + "/km"
                      : "Seis ritmos calculados pelo seu VDOT"
                  }
                >
                  <div className="space-y-4">
                    {metrics && <PacesCard paces={metrics.paces} />}
                    {metrics && metrics.zones.length > 0 && (
                      <ZonesCard zones={metrics.zones} lthr={metrics.lthr} hrmax={metrics.hrmax_estimate} />
                    )}
                    <SportZonesCard
                      runningLthr={metrics?.lthr ?? null}
                      thresholdPaceSecKm={metrics?.paces.find(x => x.name === "threshold")?.pace_min_sec ?? null}
                    />
                  </div>
                </Disclosure>

                <Disclosure
                  title="Previsões de prova"
                  icon={<Flag className="w-4 h-4" />}
                  summary="Do 5 km à maratona, pelo seu VDOT atual"
                >
                  <div className="space-y-4">
                    {metrics && (
                      <PredictionsCard predictions={metrics.predictions} testDate={latestTest.test_date} />
                    )}
                    <VdotEvolutionChart tests={tests} />
                  </div>
                </Disclosure>
              </div>
            </Section>
          )}

          {/* ── The machinery: how the plan gets built ────────────────────── */}
          <Section title="Sua configuração" subtitle="O plano se molda ao que você marcar aqui">
            <div className="space-y-2">
              <Disclosure
                title="Minha semana"
                icon={<CalendarDays className="w-4 h-4" />}
                summary="Dias de corrida, longão e treinos fortes"
              >
                <div className="space-y-4">
                  <TrainingPrefsCard />
                  <SportSelector />
                </div>
              </Disclosure>

              <Disclosure
                title="Musculação"
                icon={<Dumbbell className="w-4 h-4" />}
                summary="Dias, split e progressão de carga"
              >
                <div className="space-y-4">
                  <StrengthPrefsCard />
                  <SplitRebalanceCard />
                  <StrengthProgressCard />
                </div>
              </Disclosure>

              <Disclosure
                title="Seus tênis"
                icon={<Footprints className="w-4 h-4" />}
                summary="O plano sugere qual usar em cada treino"
              >
                <ShoesCard />
              </Disclosure>
            </div>
          </Section>

          {/* ── Where the training is going ───────────────────────────────── */}
          <Section title="Progresso">
            <div className="space-y-2">
              {adherenceHistory.length > 0 && (
                <ProactiveAdjustBanner currentWeek={adherenceHistory[0]} />
              )}

              {adherenceHistory.length > 0 && (
                <Disclosure
                  title="Adesão ao plano"
                  icon={<Target className="w-4 h-4" />}
                  summary={
                    /*
                     * The most recent week that has a score, not simply the
                     * most recent week: the current one is still being lived
                     * in and reads null until it ends, which would leave this
                     * row carrying a label where every other row carries a fact.
                     */
                    (() => {
                      const w = adherenceHistory.find(x => x.score != null);
                      return w
                        ? Math.round(w.score!) + "% na semana de " + w.weekStart.slice(8, 10) + "/" + w.weekStart.slice(5, 7)
                        : "Previsto contra executado, semana a semana";
                    })()
                  }
                >
                  <PlanAdherenceCard history={adherenceHistory} />
                </Disclosure>
              )}

              {efficiencyTrend && (
                <Disclosure
                  title="Eficiência aeróbica"
                  icon={<TrendingUp className="w-4 h-4" />}
                  summary="Velocidade por batimento, ao longo das semanas"
                >
                  <AerobicEfficiencyCard trend={efficiencyTrend} />
                </Disclosure>
              )}

              <Disclosure
                title="Análise completa por IA"
                icon={<Brain className="w-4 h-4" />}
                summary={analysisResult ? "Análise gerada — toque para reler" : "Usa testes, histórico completo e treinos"}
              >
                <div className="space-y-3">
                  <button
                    onClick={handleFullAnalysis}
                    disabled={analyzing}
                    className="btn-primary w-full"
                  >
                    {analyzing ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />Analisando…</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5 inline mr-1.5" />{analysisResult ? "Reanalisar" : "Analisar"}</>
                    )}
                  </button>

                  {analysisError && (
                    <Card tone="alert" density="tight">
                      <p className="text-sm text-red-400">{analysisError}</p>
                    </Card>
                  )}

                  {analysisResult ? (
                    <p className="text-sm text-surface-300 leading-relaxed whitespace-pre-wrap">
                      {analysisResult}
                    </p>
                  ) : !analyzing && (
                    <p className="text-xs text-surface-500 leading-relaxed">
                      Análise profunda com todos os seus dados: VDOT, zonas de FC,
                      progressão e um plano de 8 semanas.
                    </p>
                  )}
                </div>
              </Disclosure>

              <Disclosure
                title="Plano de longo prazo"
                icon={<Layers className="w-4 h-4" />}
                summary={macroPlan ? "Periodização ativa" : "Periodização até uma prova-alvo"}
              >
                <MacroPlanCard initialPlan={macroPlan} weeklyActualKm={weeklyActualKm} />
              </Disclosure>
            </div>
          </Section>
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

      {/* ── TAB: Perfil IA ───────────────────────────────────────────────────────── */}
      {activeTab === "perfil" && (
        <AthleteProfileCard />
      )}

      {/* ── TAB: Relatórios ─────────────────────────────────────────────────────── */}
      {activeTab === "relatorios" && (
        <div className="space-y-3">
          {/*
            Above the report list on purpose: the reports are a log, this is the
            scoreboard. It is also the only place in the app that answers "am I
            getting faster?" with a number the athlete set themselves.
          */}
          <PersonalRecords />

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
                    className="w-full p-3 sm:p-4 text-left active:bg-surface-700/40 transition-colors duration-100"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Brain className="w-4 h-4 text-brand-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-surface-100 text-xs sm:text-sm leading-snug line-clamp-2">
                            {report.title}
                          </h3>
                          <div className="flex items-center gap-1 sm:gap-1.5 mt-1 flex-wrap">
                            <span className="text-[11px] sm:text-xs text-surface-500">
                              {formatDate(report.report_date)}
                            </span>
                            <span className="badge bg-surface-700 text-surface-500 text-[10px] sm:text-[10px] px-1.5 py-0">
                              {report.period_type}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isOpen
                        ? <ChevronUp   className="w-4 h-4 text-surface-500 shrink-0 mt-0.5" />
                        : <ChevronDown className="w-4 h-4 text-surface-500 shrink-0 mt-0.5" />}
                    </div>

                    {report.summary && (
                      <p className="text-xs sm:text-sm text-surface-400 mt-2 sm:mt-2.5 leading-relaxed line-clamp-2 pl-9 sm:pl-[42px]">
                        {report.summary}
                      </p>
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-surface-700 p-3 sm:p-4 space-y-3 sm:space-y-4">
                      {report.strengths && (
                        <div className="bg-green-500/10 rounded-lg sm:rounded-xl p-2.5 sm:p-3 border border-green-500/20">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Award className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-400 shrink-0" />
                            <span className="text-[11px] sm:text-xs font-semibold text-green-400 uppercase tracking-tight">Pontos fortes</span>
                          </div>
                          <p className="text-xs sm:text-sm text-surface-300 leading-relaxed whitespace-pre-line break-words">
                            {report.strengths}
                          </p>
                        </div>
                      )}

                      {report.weaknesses && (
                        <div className="bg-yellow-500/10 rounded-lg sm:rounded-xl p-2.5 sm:p-3 border border-yellow-500/20">
                          <div className="flex items-center gap-2 mb-1.5">
                            <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-400 shrink-0" />
                            <span className="text-[11px] sm:text-xs font-semibold text-yellow-400 uppercase tracking-tight">Atenção</span>
                          </div>
                          <p className="text-xs sm:text-sm text-surface-300 leading-relaxed whitespace-pre-line break-words">
                            {report.weaknesses}
                          </p>
                        </div>
                      )}

                      {report.recommendations && (
                        <div className="bg-surface-700/30 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-brand-400 shrink-0" />
                            <span className="text-[11px] sm:text-xs font-semibold text-brand-400 uppercase tracking-tight">Recomendações</span>
                          </div>
                          <p className="text-xs sm:text-sm text-surface-300 leading-relaxed whitespace-pre-line break-words">
                            {report.recommendations}
                          </p>
                        </div>
                      )}

                      {report.projections && (
                        <div className="bg-surface-700/30 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Flag className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-surface-400 shrink-0" />
                            <span className="text-[11px] sm:text-xs font-semibold text-surface-400 uppercase tracking-tight">Projeções</span>
                          </div>
                          <p className="text-xs sm:text-sm text-surface-300 leading-relaxed">
                            {report.projections}
                          </p>
                        </div>
                      )}

                      {/* Only show full_report for non-weekly reports (weekly = JSON plan, not readable) */}
                      {report.full_report && report.period_type !== "week" && (
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-surface-500 shrink-0" />
                            <span className="text-xs font-semibold text-surface-400 uppercase tracking-wide">
                              Relatório completo
                            </span>
                          </div>
                          <div className="bg-surface-700/50 rounded-xl p-3 max-h-64 overflow-y-auto">
                            <p className="text-xs text-surface-400 leading-relaxed whitespace-pre-wrap">
                              {report.full_report}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* For weekly plan reports: show brief summary instead of raw JSON */}
                      {report.period_type === "week" && report.summary && !report.strengths && (
                        <div className="bg-surface-700/30 rounded-xl p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <CalendarDays className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                            <span className="text-xs font-semibold text-brand-400 uppercase tracking-wide">Resumo da semana</span>
                          </div>
                          <p className="text-sm text-surface-300 leading-relaxed">
                            {report.summary}
                          </p>
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
