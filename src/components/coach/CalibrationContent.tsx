"use client";

/**
 * Calibração — o que dá número ao plano.
 *
 * Estava partido em dois lugares: o teste de 3 km numa aba ("Testes 3km") e
 * tudo que ele calcula — VDOT, ritmos, zonas, previsões — no meio da aba do
 * plano, atrás de dois níveis de "abrir". Quem queria saber em que ritmo
 * correr tinha que procurar em duas telas o que é uma coisa só.
 *
 * Aqui ficam juntos, na ordem em que a pergunta aparece: o que o teste diz,
 * em que ritmos isso vira, o que prevê para uma prova, e o histórico.
 */
import { useEffect, useMemo, useState } from "react";
import { Flag, FlaskConical, Gauge } from "lucide-react";
import { Card, Section } from "@/components/ui/Surface";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { Disclosure } from "@/components/ui/Disclosure";
import { computeMetrics } from "@/lib/performance";
import { formatDate, secondsToPaceString } from "@/lib/utils";
import { ZonesCard } from "@/components/coach/ZonesCard";
import { PacesCard } from "@/components/coach/PacesCard";
import { SportZonesCard } from "@/components/coach/SportZonesCard";
import { PredictionsCard } from "@/components/coach/PredictionsCard";
import { VdotEvolutionChart } from "@/components/coach/VdotEvolutionChart";
import { TestHistoryCard } from "@/components/coach/TestHistoryCard";
import { TestForm } from "@/components/coach/TestForm";
import { TestCalibrationCard } from "@/components/dashboard/TestCalibrationCard";
import type { PerformanceTest } from "@/types";

export function CalibrationContent({ tests: initialTests }: { tests: PerformanceTest[] }) {
  const [tests, setTests] = useState<PerformanceTest[]>(initialTests);
  const [showForm, setShowForm] = useState(false);

  /*
    Chegou para registrar: o formulário abre sozinho.

    No dia do teste, o `TestAction` manda para cá com `?registrar=1`. Quem
    acabou de correr 3 km no limite não veio ler sobre VDOT — veio digitar o
    tempo, e o formulário estava no fim da página (Sérgio, 01/10).
  */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("registrar") === "1") {
      setShowForm(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const latestTest = tests[0] ?? null;
  const metrics = useMemo(() => {
    if (!latestTest) return null;
    return computeMetrics(latestTest.distance_km * 1000, latestTest.time_seconds, latestTest.avg_hr ?? undefined);
  }, [latestTest]);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/performance-tests/${id}`, { method: "DELETE" });
    if (res.ok) setTests(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-5">
      {!latestTest ? (
        /*
         * Sem teste, o motor monta volume e estrutura mas não consegue dizer um
         * ritmo sequer — é o único caso em que a calibração vem antes do plano.
         */
        <Card density="roomy" className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10">
            <FlaskConical className="h-7 w-7 text-brand-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-surface-100">Nenhum teste registrado ainda</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-surface-500">
              O teste de 3 km é um esforço máximo sustentável de ~10 a 14 minutos. A partir dele saem
              o seu VDOT, as zonas de FC e os ritmos de cada treino.
            </p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary mx-auto">
            + Registrar primeiro teste
          </button>
        </Card>
      ) : (
        <>
          {/* Fala só quando o teste está vencendo. */}
          <TestCalibrationCard tests={tests} />

          <Section title="Seu teste" subtitle={`Feito em ${formatDate(latestTest.test_date)}`}>
            <Card>
              <MetricGrid cols={3}>
                <Metric label="VDOT" value={metrics?.vdot.toFixed(1) ?? "—"} tone="brand" detail="ml/kg/min" />
                <Metric label="VO2max" value={metrics?.vo2max.toFixed(1) ?? "—"} detail="estimado" />
                <Metric label="Distância" value={`${latestTest.distance_km} km`} detail={formatDate(latestTest.test_date)} />
              </MetricGrid>
            </Card>
          </Section>

          <Section title="Ritmos e zonas" subtitle={
            metrics?.paces.find(x => x.name === "threshold")
              ? `Limiar ${secondsToPaceString(metrics.paces.find(x => x.name === "threshold")!.pace_max_sec)}/km`
              : "Calculados pelo seu VDOT"
          }>
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
          </Section>

          <Disclosure
            title="Previsões de prova"
            icon={<Flag className="h-4 w-4" />}
            summary="Do 5 km à maratona, pelo seu VDOT atual"
          >
            <div className="space-y-4">
              {metrics && <PredictionsCard predictions={metrics.predictions} testDate={latestTest.test_date} />}
              <VdotEvolutionChart tests={tests} />
            </div>
          </Disclosure>

          <Section
            title="Histórico de testes"
            action={
              <button onClick={() => setShowForm(true)} className="text-xs text-brand-400 hover:text-brand-300">
                + Novo teste
              </button>
            }
          >
            <TestHistoryCard tests={tests} onAddTest={() => setShowForm(true)} onDelete={handleDelete} />
          </Section>
        </>
      )}

      {showForm && (
        <TestForm
          onClose={() => setShowForm(false)}
          onSaved={(t) => { setTests(prev => [t, ...prev]); setShowForm(false); }}
        />
      )}
    </div>
  );
}
