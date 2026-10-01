"use client";

/**
 * Treinador → Plano.
 *
 * A tela responde uma pergunta: **o que eu treino esta semana, e onde ajusto
 * quando a vida muda**. Tudo que não responde isso saiu (24/09).
 *
 * De onde viemos: dezenove blocos numa aba chamada "Zonas & Plano", dentro de
 * uma aba chamada "Plano", com calibração, configuração, adesão, eficiência,
 * relatórios, ciclos e uma análise por IA que prescrevia oito semanas em
 * paralelo ao plano oficial. O plano — a razão de abrir esta tela — era o
 * quinto item, depois de até quatro avisos empilhados.
 *
 * Para onde foi cada coisa está em `docs/treinador-redesenho.md`. O que ficou:
 *
 *   1. UM aviso, o mais urgente (ver a pilha abaixo)
 *   2. A semana
 *   3. O conselheiro
 *   4. Meus dias de treino
 *   5. O plano de longo prazo
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FlaskConical, Layers } from "lucide-react";
import Link from "next/link";
import { Card, Section } from "@/components/ui/Surface";
import { Disclosure } from "@/components/ui/Disclosure";
import { computeMetrics, paceToString } from "@/lib/performance";
import { WeeklyPlanCard } from "@/components/coach/WeeklyPlanCard";
import { withCheckedNote } from "@/lib/week-note";
import type { PlannedTest } from "@/lib/planned-test";
import { WeekQuestionCard } from "@/components/today/WeekQuestionCard";
import { PlanFreshnessBanner } from "@/components/coach/PlanFreshnessBanner";
import { SportSelector } from "@/components/coach/SportSelector";
import { TrainingPrefsCard } from "@/components/coach/TrainingPrefsCard";
import { StaleTestWarning } from "@/components/coach/StaleTestWarning";
import { AdvisorCard } from "@/components/coach/AdvisorCard";
import { DefaultWeekNotice } from "@/components/coach/DefaultWeekNotice";
import { ProactiveAdjustBanner } from "@/components/coach/ProactiveAdjustBanner";
import { MacroPlanCard } from "@/components/coach/MacroPlanCard";
import type { WeekAdherence } from "@/lib/plan-adherence";
import type { DayActivity, DayRun } from "@/lib/day-status";
import type { CoachReport, MacroPlan, PerformanceTest, WeeklyPlanData } from "@/types";

interface Props {
  reports: CoachReport[];
  tests: PerformanceTest[];
  adherenceHistory?: WeekAdherence[];
  macroPlan?: MacroPlan | null;
  weeklyActualKm?: Record<string, number>;
  /** O que foi registrado nas últimas semanas — a semana mostra o feito ao lado do previsto. */
  doneRuns?: DayRun[];
  doneActivities?: DayActivity[];
}

export function CoachContent({
  reports, tests, adherenceHistory = [], macroPlan = null, weeklyActualKm = {},
  doneRuns = [], doneActivities = [],
}: Props) {
  const router = useRouter();

  /*
    O teste marcado vive aqui porque duas coisas precisam dele ao mesmo tempo:
    o aviso (que passa a dizer o dia) e a semana (onde ele aparece). Marcar
    atualiza o estado, e a semana muda na hora — sem recarregar nada.
  */
  const [plannedTest, setPlannedTest] = useState<PlannedTest | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/planned-test", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setPlannedTest((d?.test as PlannedTest | null) ?? null); })
      .catch(() => { /* sem marcação, a semana segue igual */ });
    return () => { cancelled = true; };
  }, []);

  const latestTest = tests[0] ?? null;
  const metrics = useMemo(() => {
    if (!latestTest) return null;
    return computeMetrics(latestTest.distance_km * 1000, latestTest.time_seconds, latestTest.avg_hr ?? undefined);
  }, [latestTest]);

  /** Os ritmos como o card da semana os mostra. */
  const pacesForPlan = useMemo(() => {
    if (!metrics?.paces) return null;
    const find = (name: string) => metrics.paces.find(p => p.name === name);
    const fmt = (min: number, max: number) => `${paceToString(min)}–${paceToString(max)}/km`;
    const easy = find("easy"), threshold = find("threshold"), marathon = find("marathon"), interval = find("interval");
    return {
      easy:      easy      ? fmt(easy.pace_min_sec,      easy.pace_max_sec)      : undefined,
      threshold: threshold ? fmt(threshold.pace_min_sec, threshold.pace_max_sec) : undefined,
      long:      marathon  ? fmt(marathon.pace_min_sec,  marathon.pace_max_sec)  : undefined,
      interval:  interval  ? fmt(interval.pace_min_sec,  interval.pace_max_sec)  : undefined,
    };
  }, [metrics]);

  const latestWeekReport = reports.find(r => r.period_type === "week") ?? null;
  const initialWeeklyPlan = useMemo((): WeeklyPlanData | null => {
    if (!latestWeekReport?.full_report) return null;
    try {
      const parsed = JSON.parse(latestWeekReport.full_report) as WeeklyPlanData;
      // Mover uma corrida de dia não pode deixar o recado falando do dia antigo.
      return Array.isArray(parsed.days) ? withCheckedNote(parsed) : null;
    } catch {
      return null;   // relatório em texto, do gerador antigo
    }
  }, [latestWeekReport]);

  return (
    /*
      A largura acompanha o que a tela passou a mostrar.

      `max-w-3xl` (768 px) servia uma coluna só. Depois que a semana virou
      agenda + detalhe lado a lado, os dois lados passaram a dividir a largura
      de um: nome de treino cortado, explicação em cinco linhas, ações
      espremidas. Em `xl` a página vai a ~1.120 px, que é onde a agenda cabe
      inteira com folga e o detalhe ainda tem espaço para as séries.
    */
    <div className="mx-auto w-full max-w-3xl animate-fade-in space-y-6 lg:max-w-5xl xl:max-w-[1120px]">
      {/*
        UM aviso por vez, o mais urgente.

        Cada um destes componentes devolve `null` quando não tem o que dizer, e
        o CSS esconde todos menos o primeiro que sobrar — a prioridade é a
        ordem em que estão escritos. Antes eles empilhavam: o atleta podia ver
        quatro faixas antes de chegar no plano, todas do mesmo tamanho, e a
        mais urgente não era necessariamente a de cima.
      */}
      <div className="[&>*:not(:first-child)]:hidden empty:hidden">
        {!latestTest && (
          <Link href="/coach/calibracao" className="block">
            <Card tone="alert">
              <div className="flex items-center gap-3">
                <FlaskConical className="h-5 w-5 shrink-0 text-amber-300" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-surface-100">Faça o teste de 3 km</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-surface-400">
                    Sem ele o plano monta volume e estrutura, mas não sabe em que ritmo te mandar correr.
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        )}
        <StaleTestWarning latestTest={latestTest} />
        <PlanFreshnessBanner />
        {adherenceHistory[0] && <ProactiveAdjustBanner currentWeek={adherenceHistory[0]} />}
        <WeekQuestionCard />
        <DefaultWeekNotice onConfigure={() => {
          document.getElementById("training-prefs")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }} />
      </div>

      <WeeklyPlanCard
        initialPlan={initialWeeklyPlan}
        plannedTest={plannedTest}
        onTestChanged={setPlannedTest}
        initialReportId={latestWeekReport?.id ?? null}
        paces={pacesForPlan}
        doneRuns={doneRuns}
        doneActivities={doneActivities}
      />

      {/* Lê tudo que está acima e propõe; nunca edita sozinho. */}
      <AdvisorCard />

      <Section title="Meus dias de treino" subtitle="O plano se molda ao que você marcar aqui">
        <div id="training-prefs" className="scroll-mt-24 space-y-2">
          <Disclosure
            title="Minha semana"
            icon={<CalendarDays className="h-4 w-4" />}
            summary="Dias de corrida, longão e treinos fortes"
          >
            <div className="space-y-4">
              <TrainingPrefsCard />
              <SportSelector />
            </div>
          </Disclosure>
        </div>
      </Section>

      <Disclosure
        title="Plano de longo prazo"
        icon={<Layers className="h-4 w-4" />}
        summary={macroPlan ? "Periodização ativa" : "Periodização até uma prova-alvo"}
      >
        <MacroPlanCard initialPlan={macroPlan} weeklyActualKm={weeklyActualKm} />
      </Disclosure>
    </div>
  );
}
