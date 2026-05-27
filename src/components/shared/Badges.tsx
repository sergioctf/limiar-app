import { cn } from "@/lib/utils";
import { secondsToPaceString, runTypeLabel, sourceLabel } from "@/lib/utils";

// ─── PaceBadge ───────────────────────────────────────────
export function PaceBadge({ paceSeconds }: { paceSeconds: number }) {
  return (
    <span className="badge bg-brand-500/15 text-brand-300 font-mono">
      {secondsToPaceString(paceSeconds)}/km
    </span>
  );
}

// ─── HeartRateBadge ──────────────────────────────────────
export function HeartRateBadge({ bpm }: { bpm: number }) {
  const color =
    bpm >= 180 ? "bg-red-500/15 text-red-300" :
    bpm >= 170 ? "bg-orange-500/15 text-orange-300" :
    bpm >= 155 ? "bg-yellow-500/15 text-yellow-300" :
                 "bg-green-500/15 text-green-300";
  return (
    <span className={cn("badge", color)}>
      {bpm} bpm
    </span>
  );
}

// ─── SourceBadge ─────────────────────────────────────────
export function SourceBadge({ source }: { source: string }) {
  const styles: Record<string, string> = {
    strava:       "bg-orange-500/20 text-orange-300",
    manual:       "bg-blue-500/15 text-blue-300",
    imported_ai:  "bg-purple-500/15 text-purple-300",
    "strava+ai":  "bg-teal-500/15 text-teal-300",
  };
  return (
    <span className={cn("badge", styles[source] ?? "bg-surface-700 text-surface-400")}>
      {sourceLabel(source)}
    </span>
  );
}

// ─── RunTypeBadge ────────────────────────────────────────
export function RunTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    easy:       "bg-green-500/15 text-green-300",
    long_run:   "bg-blue-500/15 text-blue-300",
    tempo:      "bg-orange-500/15 text-orange-300",
    intervals:  "bg-red-500/15 text-red-300",
    race:       "bg-yellow-500/15 text-yellow-300",
    recovery:   "bg-teal-500/15 text-teal-300",
    steady:     "bg-indigo-500/15 text-indigo-300",
    progression:"bg-purple-500/15 text-purple-300",
    other:      "bg-surface-700 text-surface-400",
  };
  return (
    <span className={cn("badge", styles[type] ?? "bg-surface-700 text-surface-400")}>
      {runTypeLabel(type)}
    </span>
  );
}

// ─── TagBadge ────────────────────────────────────────────
export function TagBadge({ tag }: { tag: string }) {
  return (
    <span className="badge bg-surface-700 text-surface-400 hover:bg-surface-600 cursor-default">
      {tag}
    </span>
  );
}
