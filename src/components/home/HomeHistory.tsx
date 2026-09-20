"use client";

/**
 * O fundo da Hoje: seus números, seus recordes, sua prova-alvo.
 *
 * Eles moraram na Home até 18/09, foram para Gráficos, e voltaram em 20/09 a
 * pedido do Sérgio — mas **no fim da página**, que é a diferença que faz a
 * coisa funcionar. Em cima eles disputavam com o treino do dia; aqui embaixo
 * são o que você rola até encontrar quando quer se ver de longe.
 *
 * Gráficos, por sua vez, voltou a ser gráfico: tendência, não troféu.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Flame, MapPin, Target } from "lucide-react";
import { Section } from "@/components/ui/Surface";
import { StatCard } from "@/components/shared/StatCard";
import { PersonalRecordsCard } from "@/components/achievements/PersonalRecordsCard";
import { TargetRaceCard } from "@/components/dashboard/TargetRaceCard";
import { TestCountdown } from "@/components/home/TestCountdown";
import { analyzeHistoricalComparison, type EffortLite } from "@/lib/historical-comparison";
import { pickTargetComparison } from "@/lib/target-comparison";
import { computeRunStreak } from "@/lib/training-load";
import { formatDistanceKm, totalDistanceKm, trainingDaysInWindow } from "@/lib/utils";
import type { TestStatus } from "@/lib/test-status";
import type { Goal, PerformanceTest, Run } from "@/types";

export function HomeHistory({
  runs, goals, latestTest, testStatus, activities,
}: {
  runs: Run[];
  goals: Goal[];
  latestTest: PerformanceTest | null;
  testStatus: TestStatus;
  activities: Array<{ date: string; sport_type: string; duration_seconds: number | null; avg_hr: number | null }>;
}) {
  const recentFirst = useMemo(() => [...runs].sort((a, b) => b.date.localeCompare(a.date)), [runs]);

  // Melhores esforços dentro das corridas (o 5 km mais rápido de um 10 km).
  const [efforts, setEfforts] = useState<EffortLite[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/records")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setEfforts((d?.efforts ?? []) as EffortLite[]); })
      .catch(() => { /* o cálculo pela atividade inteira continua valendo */ });
    return () => { cancelled = true; };
  }, []);

  const records = useMemo(() => analyzeHistoricalComparison(recentFirst, efforts), [recentFirst, efforts]);
  const target = useMemo(() => pickTargetComparison(goals, latestTest), [goals, latestTest]);
  const last30 = trainingDaysInWindow(recentFirst, activities, 30);

  return (
    <div className="space-y-5 border-t border-surface-800 pt-6">
      {/* O teste é o que calibra todo o resto; por isso abre este bloco. */}
      <TestCountdown status={testStatus} />

      {runs.length > 0 && (
        <>
          <Section title="Seus números">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Total de corridas" value={runs.length} icon={Target} />
              <StatCard label="Distância total" value={formatDistanceKm(totalDistanceKm(runs))} icon={MapPin} />
              <StatCard label="Sequência" value={computeRunStreak(recentFirst) + " dias"} icon={Flame} />
              <StatCard label="Dias treinados (30d)" value={last30.count} icon={CalendarCheck} />
            </div>
          </Section>

          <PersonalRecordsCard records={records} />
        </>
      )}

      {target && <TargetRaceCard comparison={target} />}
    </div>
  );
}
