import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  parseISO,
  isWithinInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Run, WeeklyVolume, MonthlyVolume, PaceTrend } from "@/types";

// ─── Tailwind helper ────────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Pace / Time conversions ────────────────────────────────────────────────

/** "5:30" → 330 */
export function paceStringToSeconds(pace: string): number {
  const [min, sec] = pace.split(":").map(Number);
  return min * 60 + (sec || 0);
}

/** 330 → "5:30" */
export function secondsToPaceString(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "1:22:53" → 4973 */
export function timeStringToSeconds(time: string): number {
  const parts = time.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

/** 4973 → "1:22:53" */
export function secondsToTimeString(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** seconds → "1h 22min" or "44min" */
export function secondsToReadable(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

/** distance km + duration seconds → pace seconds/km */
export function calcPace(distanceKm: number, durationSeconds: number): number {
  if (distanceKm <= 0) return 0;
  return durationSeconds / distanceKm;
}

/** meters → km rounded to 2 decimals */
export function metersToKm(meters: number): number {
  return Math.round((meters / 1000) * 100) / 100;
}

/** m/s → pace seconds/km */
export function mpsToSecPerKm(mps: number): number {
  if (mps <= 0) return 0;
  return 1000 / mps;
}

// ─── Aggregate helpers ───────────────────────────────────────────────────────

export function totalDistanceKm(runs: Run[]): number {
  return runs.reduce((acc, r) => acc + r.distance_km, 0);
}

export function totalDurationSeconds(runs: Run[]): number {
  return runs.reduce((acc, r) => acc + r.duration_seconds, 0);
}

export function longestRun(runs: Run[]): Run | null {
  if (!runs.length) return null;
  return runs.reduce((best, r) =>
    r.distance_km > best.distance_km ? r : best
  );
}

export function bestPace(runs: Run[]): Run | null {
  const withPace = runs.filter((r) => r.avg_pace_seconds_per_km);
  if (!withPace.length) return null;
  return withPace.reduce((best, r) =>
    (r.avg_pace_seconds_per_km ?? Infinity) < (best.avg_pace_seconds_per_km ?? Infinity)
      ? r
      : best
  );
}

export function weeklyVolumeKm(runs: Run[], date = new Date()): number {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return runs
    .filter((r) => {
      const d = parseISO(r.date);
      return isWithinInterval(d, { start, end });
    })
    .reduce((acc, r) => acc + r.distance_km, 0);
}

export function monthlyVolumeKm(runs: Run[], date = new Date()): number {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return runs
    .filter((r) => {
      const d = parseISO(r.date);
      return isWithinInterval(d, { start, end });
    })
    .reduce((acc, r) => acc + r.distance_km, 0);
}

export function groupByWeek(runs: Run[]): WeeklyVolume[] {
  const map = new Map<string, WeeklyVolume>();
  runs.forEach((r) => {
    const d = parseISO(r.date);
    const wStart = startOfWeek(d, { weekStartsOn: 1 });
    const key = format(wStart, "yyyy-'W'ww");
    const label = format(wStart, "'Sem' dd/MM", { locale: ptBR });
    const existing = map.get(key) ?? {
      week: key,
      weekLabel: label,
      totalKm: 0,
      runs: 0,
    };
    existing.totalKm = Math.round((existing.totalKm + r.distance_km) * 100) / 100;
    existing.runs += 1;
    map.set(key, existing);
  });
  return Array.from(map.values()).sort((a, b) => a.week.localeCompare(b.week));
}

export function groupByMonth(runs: Run[]): MonthlyVolume[] {
  const map = new Map<string, MonthlyVolume>();
  runs.forEach((r) => {
    const d = parseISO(r.date);
    const key = format(d, "yyyy-MM");
    const label = format(d, "MMM/yy", { locale: ptBR });
    const existing = map.get(key) ?? {
      month: key,
      monthLabel: label,
      totalKm: 0,
      runs: 0,
    };
    existing.totalKm = Math.round((existing.totalKm + r.distance_km) * 100) / 100;
    existing.runs += 1;
    map.set(key, existing);
  });
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function bestWeeklyVolumeKm(runs: Run[]): number {
  const weekly = groupByWeek(runs);
  if (!weekly.length) return 0;
  return Math.max(...weekly.map((w) => w.totalKm));
}

export function bestMonthlyVolumeKm(runs: Run[]): number {
  const monthly = groupByMonth(runs);
  if (!monthly.length) return 0;
  return Math.max(...monthly.map((m) => m.totalKm));
}

export function buildPaceTrend(runs: Run[]): PaceTrend[] {
  return runs
    .filter((r) => r.avg_pace_seconds_per_km)
    .map((r) => ({
      date: r.date,
      pace: r.avg_pace_seconds_per_km!,
      paceLabel: secondsToPaceString(r.avg_pace_seconds_per_km!),
      distance: r.distance_km,
      type: r.type,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Deduplication ───────────────────────────────────────────────────────────

/** Returns true if two runs are likely duplicates (date match + distance within 2%) */
export function isProbableDuplicate(
  a: { date: string; distance_km: number; duration_seconds: number },
  b: { date: string; distance_km: number; duration_seconds: number }
): boolean {
  if (a.date !== b.date) return false;
  const distRatio =
    Math.abs(a.distance_km - b.distance_km) /
    Math.max(a.distance_km, b.distance_km);
  const durRatio =
    Math.abs(a.duration_seconds - b.duration_seconds) /
    Math.max(a.duration_seconds, b.duration_seconds);
  return distRatio < 0.02 && durRatio < 0.05;
}

// ─── Format helpers ──────────────────────────────────────────────────────────

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR });
}

export function formatDateShort(dateStr: string): string {
  return format(parseISO(dateStr), "dd/MM", { locale: ptBR });
}

export function formatDistanceKm(km: number): string {
  return `${km.toFixed(2)} km`;
}

export function runTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    easy: "Leve",
    long_run: "Longão",
    tempo: "Tempo/Ritmo",
    intervals: "Tiros",
    race: "Prova",
    recovery: "Regenerativo",
    steady: "Steady",
    progression: "Progressivo",
    other: "Outro",
  };
  return labels[type] ?? type;
}

export function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    strava: "Strava",
    manual: "Manual",
    imported_ai: "IA",
    "strava+ai": "Strava + IA",
  };
  return labels[source] ?? source;
}
