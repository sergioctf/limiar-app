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
    icon: "⛰️",
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

  // ── Harder / advanced badges ────────────────────────────────────────────────
  const maxSingleRun  = Math.max(...runs.map(r => r.distance_km), 0);
  const totalElevation = runs.reduce((s, r) => s + (r.elevation_gain_m ?? 0), 0);
  const longestStreak = calculateLongestStreak(sortedDates);

  // best (fastest) pace among real runs (>= 3 km)
  const pacedRuns = runs.filter(r => r.distance_km >= 3 && r.avg_pace_seconds_per_km);
  const bestPaceOverall = pacedRuns.length
    ? Math.min(...pacedRuns.map(r => r.avg_pace_seconds_per_km as number))
    : Infinity;

  // best finishing time for a given distance bucket
  const bestDuration = (km: number, tol: number): number => {
    const m = runs.filter(r => Math.abs(r.distance_km - km) <= tol && r.duration_seconds > 0);
    return m.length ? Math.min(...m.map(r => r.duration_seconds)) : Infinity;
  };
  const best10k      = bestDuration(10, 0.5);
  const bestHalf     = bestDuration(21.1, 0.5);
  const bestMarathon = bestDuration(42.2, 1.0);

  // biggest single calendar-week volume (grouped by Monday)
  const mondayKey = (dateStr: string): string => {
    const d = new Date(`${dateStr}T12:00:00`);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  };
  const weekKm = new Map<string, number>();
  runs.forEach(r => weekKm.set(mondayKey(r.date), (weekKm.get(mondayKey(r.date)) ?? 0) + r.distance_km));
  const maxWeekKm = weekKm.size ? Math.max(...Array.from(weekKm.values())) : 0;

  // 11. LONG_HAUL — single run >= 30 km
  achievements.push({
    id: "long_haul", label: "Longão extremo", description: "Uma corrida de 30 km",
    icon: "🦵", unlocked: maxSingleRun >= 30, progress: Math.min(100, (maxSingleRun / 30) * 100),
  });

  // 12. ULTRA_RUNNER — single run >= 50 km
  achievements.push({
    id: "ultra_runner", label: "Ultramaratonista", description: "Uma corrida de 50 km (ultra)",
    icon: "🏔️", unlocked: maxSingleRun >= 50, progress: Math.min(100, (maxSingleRun / 50) * 100),
  });

  // 13. ROCKET — best pace under 4:00/km
  achievements.push({
    id: "rocket", label: "Foguete", description: "Pace abaixo de 4:00/km numa corrida",
    icon: "🚀", unlocked: bestPaceOverall < 240,
  });

  // 14. SUB45_10K — a 10K under 45 min
  achievements.push({
    id: "sub45_10k", label: "10K relâmpago", description: "10 km em menos de 45 min",
    icon: "🏎️", unlocked: best10k < 45 * 60,
  });

  // 15. SUB2_HALF — half marathon under 2h
  achievements.push({
    id: "sub2_half", label: "Sub-2 na meia", description: "Meia-maratona em menos de 2h",
    icon: "🎯", unlocked: bestHalf < 2 * 3600,
  });

  // 16. SUB4_MARATHON — marathon under 4h
  achievements.push({
    id: "sub4_marathon", label: "Sub-4 na maratona", description: "Maratona em menos de 4h",
    icon: "🏆", unlocked: bestMarathon < 4 * 3600,
  });

  // 17. BIG_WEEK — 100 km in a single week
  achievements.push({
    id: "big_week", label: "Semana monstra", description: "100 km em uma única semana",
    icon: "📅", unlocked: maxWeekKm >= 100, progress: Math.min(100, (maxWeekKm / 100) * 100),
  });

  // 18. EVEREST — cumulative elevation gain >= 8848 m
  achievements.push({
    id: "everest", label: "Everest", description: "8.848 m de ganho de elevação acumulado",
    icon: "🗻", unlocked: totalElevation >= 8848, progress: Math.min(100, (totalElevation / 8848) * 100),
  });

  // 19. MACHINE — 300 runs
  achievements.push({
    id: "machine", label: "Máquina", description: "Complete 300 corridas",
    icon: "🤖", unlocked: runs.length >= 300, progress: Math.min(100, (runs.length / 300) * 100),
  });

  // 20. MILLENNIUM — 1000 km lifetime
  achievements.push({
    id: "millennium", label: "Milhar", description: "Acumule 1.000 km",
    icon: "🌍", unlocked: totalKm >= 1000, progress: Math.min(100, (totalKm / 1000) * 100),
  });

  // 21. IRON_WILL — 100 consecutive days
  achievements.push({
    id: "iron_will", label: "Vontade de ferro", description: "100 dias seguidos de treino",
    icon: "⚙️", unlocked: longestStreak >= 100, progress: Math.min(100, (longestStreak / 100) * 100),
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
    { id: "speed_demon", label: "Velocista", description: "Pace abaixo de 5:00/km", icon: "⚡", unlocked: false },
    { id: "distance_warrior", label: "Guerreiro de distância", description: "Acumule 100 km", icon: "🗺️", unlocked: false },
    { id: "volume_master", label: "Mestre do volume", description: "Acumule 500 km", icon: "⛰️", unlocked: false },
    { id: "century", label: "Century", description: "100 km em um mês", icon: "💯", unlocked: false },
    { id: "long_haul", label: "Longão extremo", description: "Uma corrida de 30 km", icon: "🦵", unlocked: false },
    { id: "ultra_runner", label: "Ultramaratonista", description: "Uma corrida de 50 km (ultra)", icon: "🏔️", unlocked: false },
    { id: "rocket", label: "Foguete", description: "Pace abaixo de 4:00/km numa corrida", icon: "🚀", unlocked: false },
    { id: "sub45_10k", label: "10K relâmpago", description: "10 km em menos de 45 min", icon: "🏎️", unlocked: false },
    { id: "sub2_half", label: "Sub-2 na meia", description: "Meia-maratona em menos de 2h", icon: "🎯", unlocked: false },
    { id: "sub4_marathon", label: "Sub-4 na maratona", description: "Maratona em menos de 4h", icon: "🏆", unlocked: false },
    { id: "big_week", label: "Semana monstra", description: "100 km em uma única semana", icon: "📅", unlocked: false },
    { id: "everest", label: "Everest", description: "8.848 m de ganho de elevação acumulado", icon: "🗻", unlocked: false },
    { id: "machine", label: "Máquina", description: "Complete 300 corridas", icon: "🤖", unlocked: false },
    { id: "millennium", label: "Milhar", description: "Acumule 1.000 km", icon: "🌍", unlocked: false },
    { id: "iron_will", label: "Vontade de ferro", description: "100 dias seguidos de treino", icon: "⚙️", unlocked: false },
  ];
}
