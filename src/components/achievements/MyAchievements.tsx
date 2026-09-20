"use client";

/**
 * As minhas conquistas, agora em Amigos (Sérgio, 20/09).
 *
 * Elas viviam em Gráficos, onde não tinham o que fazer: medalha não é
 * tendência. E o lugar delas é claro — a comparação com os amigos já mora
 * nesta página, e "o que eu tenho" só ganha sentido ao lado de "o que os
 * outros têm".
 *
 * Os "melhores esforços" (5 km mais rápido dentro de um 10 km) vêm da rota de
 * recordes; sem eles as medalhas ainda saem, medidas pela atividade inteira.
 */
import { useEffect, useMemo, useState } from "react";
import { AchievementsCard } from "@/components/achievements/AchievementsCard";
import { detectAchievements } from "@/lib/achievements";
import type { EffortLite } from "@/lib/historical-comparison";
import type { Run } from "@/types";

export function MyAchievements({ runs }: { runs: Run[] }) {
  const [efforts, setEfforts] = useState<EffortLite[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/records")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setEfforts((d?.efforts ?? []) as EffortLite[]); })
      .catch(() => { /* o cálculo pela atividade inteira continua de pé */ });
    return () => { cancelled = true; };
  }, []);

  const recentFirst = useMemo(() => [...runs].sort((a, b) => b.date.localeCompare(a.date)), [runs]);
  const achievements = useMemo(() => detectAchievements(recentFirst, efforts), [recentFirst, efforts]);

  if (runs.length === 0) return null;
  return <AchievementsCard achievements={achievements} />;
}
