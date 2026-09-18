"use client";

/**
 * Records, achievements, the target race and the running totals — moved from
 * the Home to Histórico (18/09). They are about the whole history, not about
 * today, and on the Home they competed with the session of the day.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Flame, MapPin, Target } from "lucide-react";
import { Section } from "@/components/ui/Surface";
import { StatCard } from "@/components/shared/StatCard";
import { PersonalRecordsCard } from "@/components/achievements/PersonalRecordsCard";
import { AchievementsCard } from "@/components/achievements/AchievementsCard";
import { TargetRaceCard } from "@/components/dashboard/TargetRaceCard";
import { analyzeHistoricalComparison, type EffortLite } from "@/lib/historical-comparison";
import { detectAchievements } from "@/lib/achievements";
import { pickTargetComparison } from "@/lib/target-comparison";
import { computeRunStreak } from "@/lib/training-load";
import { formatDistanceKm, totalDistanceKm, trainingDaysInWindow } from "@/lib/utils";
import type { Goal, PerformanceTest, Run } from "@/types";

export function HistoryHighlights({
  runs, goals, latestTest, activities,
}: {
  runs: Run[];
  goals: Goal[];
  latestTest: PerformanceTest | null;
  activities: Array<{ date: string; sport_type: string; duration_seconds: number | null; avg_hr: number | null }>;
}) {
  // Most recent first, as the record and achievement detectors expect.
  const recentFirst = useMemo(() => [...runs].sort((a, b) => b.date.localeCompare(a.date)), [runs]);

  // Best efforts inside runs (fastest 5 km within a 10 km…), cached by the records route.
  const [efforts, setEfforts] = useState<EffortLite[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/records")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setEfforts((d?.efforts ?? []) as EffortLite[]); })
      .catch(() => { /* the whole-activity fallback still stands */ });
    return () => { cancelled = true; };
  }, []);

  const records = useMemo(() => analyzeHistoricalComparison(recentFirst, efforts), [recentFirst, efforts]);
  const achievements = useMemo(() => detectAchievements(recentFirst, efforts), [recentFirst, efforts]);
  const target = useMemo(() => pickTargetComparison(goals, latestTest), [goals, latestTest]);
  const last30 = trainingDaysInWindow(recentFirst, activities, 30);

  if (runs.length === 0) return null;

  return (
    <div className="space-y-5">
      <Section title="Seus números">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total de corridas" value={runs.length} icon={Target} />
          <StatCard label="Distância total" value={formatDistanceKm(totalDistanceKm(runs))} icon={MapPin} />
          <StatCard label="Sequência" value={computeRunStreak(recentFirst) + " dias"} icon={Flame} />
          <StatCard label="Dias treinados (30d)" value={last30.count} icon={CalendarCheck} />
        </div>
      </Section>
      <PersonalRecordsCard records={records} />
      <AchievementsCard achievements={achievements} />
      {target && <TargetRaceCard comparison={target} />}
    </div>
  );
}
