import type { Run } from "@/types";

export interface Achievement {
  id: string;
  label: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string; // ISO date
  progress?: number; // 0-100 for badges not yet unlocked
}

/**
 * Detect all achievements for a user based on their runs.
 */
export function detectAchievements(runs: Run[]): Achievement[] {
  if (!runs || runs.length === 0) {
    return getAllAchievements().map(a => ({ ...a, unlocked: false }));
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

  // Group runs by date for streaks
  const runsByDate = new Map<string, Run[]>();
  runs.forEach(run => {
    const date = run.date;
    if (!runsByDate.has(date)) runsByDate.set(date, []);
    runsByDate.get(date)!.push(run);
  });

  const sortedDates = Array.from(runsByDate.keys()).sort().reverse();

  const achievements: Achievement[] = [];

  // 1. FIRST_RUN — any run exists
  const firstRun = runs.length > 0 ? runs[runs.length - 1] : null;
  achievements.push({
    id: "first_run",
    label: "Primeiro passo",
    description: "Registre sua primeira corrida",
    icon: "🏃",
    unlocked: !!firstRun,
    unlockedAt: firstRun?.date,
  });

  // 2. ROOKIE — 10 runs
  const rookie = runs.length >= 10;
  achievements.push({
    id: "rookie",
    label: "Estreante",
    description: "Complete 10 corridas",
    icon: "🌱",
    unlocked: rookie,
    progress: Math.min(100, (runs.length / 10) * 100),
  });

  // 3. CONSISTENT — 30 runs
  const consistent = runs.length >= 30;
  achievements.push({
    id: "consistent",
    label: "Consistente",
    description: "Complete 30 corridas",
    icon: "⚡",
    unlocked: consistent,
    progress: Math.min(100, (runs.length / 30) * 100),
  });

  // 4. MARATHONER — any run >= 42km
  const marathoner = runs.some(r => r.distance_km >= 42);
  const longestForMarathon = Math.max(...runs.map(r => r.distance_km), 0);
  achievements.push({
    id: "marathoner",
    label: "Maratonista",
    description: "Complete uma maratona (42 km)",
    icon: "🏅",
    unlocked: marathoner,
    progress: Math.min(100, (longestForMarathon / 42) * 100),
  });

  // 5. STREAKER_7 — 7 consecutive days
  const streak7 = calculateLongestStreak(sortedDates) >= 7;
  const currentStreak = calculateCurrentStreak(sortedDates);
  achievements.push({
    id: "streaker_7",
    label: "Dedicado",
    description: "7 dias seguidos de treino",
    icon: "🔥",
    unlocked: streak7,
    progress: Math.min(100, (currentStreak / 7) * 100),
  });

  // 6. STREAKER_30 — 30 consecutive days
  const streak30 = calculateLongestStreak(sortedDates) >= 30;
  achievements.push({
    id: "streaker_30",
    label: "Forjado no fogo",
    description: "30 dias seguidos de treino",
    icon: "💪",
    unlocked: streak30,
    progress: Math.min(100, (currentStreak / 30) * 100),
  });

  // 7. SPEED_DEMON — avg pace < 5 min/km
  const speedDemon = runs.some(r => {
    const paceMinPerKm = r.avg_pace_seconds_per_km ? r.avg_pace_seconds_per_km / 60 : Infinity;
    return paceMinPerKm < 5;
  });
  achievements.push({
    id: "speed_demon",
    label: "Velocista",
    description: "Corra um 5K em menos de 25 minutos",
    icon: "⚡",
    unlocked: speedDemon,
  });

  // 8. DISTANCE_WARRIOR — 100km lifetime
  const totalKm = runs.reduce((sum, r) => sum + r.distance_km, 0);
  const distanceWarrior = totalKm >= 100;
  achievements.push({
    id: "distance_warrior",
    label: "Guerreiro de distância",
    description: "Acumule 100 km",
    icon: "🗺️",
    unlocked: distanceWarrior,
    progress: Math.min(100, (totalKm / 100) * 100),
  });

  // 9. VOLUME_MASTER — 500km lifetime
  const volumeMaster = totalKm >= 500;
  achievements.push({
    id: "volume_master",
    label: "Mestre do volume",
    description: "Acumule 500 km",
    icon: "🏔️",
    unlocked: volumeMaster,
    progress: Math.min(100, (totalKm / 500) * 100),
  });

  // 10. CENTURY — 100km in a month
  const last30Days = runs.filter(r => new Date(r.date) >= thirtyDaysAgo);
  const kmLast30 = last30Days.reduce((sum, r) => sum + r.distance_km, 0);
  const century = kmLast30 >= 100;
  achievements.push({
    id: "century",
    label: "Century",
    description: "100 km em um mês",
    icon: "💯",
    unlocked: century,
    progress: Math.min(100, (kmLast30 / 100) * 100),
  });

  return achievements;
}

function calculateLongestStreak(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let i = 0; i < sortedDates.length - 1; i++) {
    const date1 = new Date(sortedDates[i]);
    const date2 = new Date(sortedDates[i + 1]);
    const diffDays = Math.round((date1.getTime() - date2.getTime()) / 86400000);

    if (diffDays === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

function calculateCurrentStreak(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastRunDate = new Date(sortedDates[0]);
  lastRunDate.setHours(0, 0, 0, 0);

  const daysSinceLastRun = Math.round((today.getTime() - lastRunDate.getTime()) / 86400000);

  // If last run was more than 1 day ago, streak is broken
  if (daysSinceLastRun > 1) return 0;

  let current = 1;
  for (let i = 0; i < sortedDates.length - 1; i++) {
    const date1 = new Date(sortedDates[i]);
    const date2 = new Date(sortedDates[i + 1]);
    const diffDays = Math.round((date1.getTime() - date2.getTime()) / 86400000);

    if (diffDays === 1) {
      current++;
    } else {
      break;
    }
  }

  return current;
}

function getAllAchievements(): Achievement[] {
  return [
    { id: "first_run", label: "Primeiro passo", description: "Registre sua primeira corrida", icon: "🏃", unlocked: false },
    { id: "rookie", label: "Estreante", description: "Complete 10 corridas", icon: "🌱", unlocked: false },
    { id: "consistent", label: "Consistente", description: "Complete 30 corridas", icon: "⚡", unlocked: false },
    { id: "marathoner", label: "Maratonista", description: "Complete uma maratona (42 km)", icon: "🏅", unlocked: false },
    { id: "streaker_7", label: "Dedicado", description: "7 dias seguidos de treino", icon: "🔥", unlocked: false },
    { id: "streaker_30", label: "Forjado no fogo", description: "30 dias seguidos de treino", icon: "💪", unlocked: false },
    { id: "speed_demon", label: "Velocista", description: "Corra um 5K em menos de 25 minutos", icon: "⚡", unlocked: false },
    { id: "distance_warrior", label: "Guerreiro de distância", description: "Acumule 100 km", icon: "🗺️", unlocked: false },
    { id: "volume_master", label: "Mestre do volume", description: "Acumule 500 km", icon: "🏔️", unlocked: false },
    { id: "century", label: "Century", description: "100 km em um mês", icon: "💯", unlocked: false },
  ];
}
