"use client";

import { TONE, type Tone } from "./tone";

/**
 * Numbers, sized by how much they matter.
 *
 * The old screens gave a 26-block dashboard the same visual weight throughout,
 * so the athlete had to read everything to find anything. Whoop's discipline is
 * the opposite: one number is enormous, the rest are small, and the size *is*
 * the hierarchy — you know what the screen is about before you have read a word.
 */

interface MetricProps {
  value: React.ReactNode;
  label: string;
  /** Small text under the value — units, context, a date. */
  detail?: string;
  tone?: Tone;
  /** `hero` is one per screen. `default` for a stat row. `inline` inside prose. */
  size?: "hero" | "default" | "inline";
}

const SIZE = {
  hero:    "text-5xl font-black",
  default: "text-2xl font-bold",
  inline:  "text-base font-semibold",
} as const;

export function Metric({ value, label, detail, tone = "neutral", size = "default" }: MetricProps) {
  const t = TONE[tone];
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-surface-500">{label}</p>
      <p className={`${SIZE[size]} tabular-nums leading-tight mt-1 ${tone === "neutral" ? "text-surface-100" : t.text}`}>
        {value}
      </p>
      {detail && <p className="text-xs text-surface-500 mt-1">{detail}</p>}
    </div>
  );
}

/** Two to four metrics side by side. More than four and none of them read. */
export function MetricGrid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[cols];
  return <div className={`grid ${c} gap-3`}>{children}</div>;
}

/* ── Bar ──────────────────────────────────────────────────────────────────── */

interface BarProps {
  /** 0–1. Values above 1 are clamped but tinted as an overshoot. */
  ratio: number;
  tone?: Tone;
  label?: string;
  value?: string;
}

/**
 * A progress bar that admits when it is over 100%.
 *
 * An athlete who ran 119% of the prescribed week deserves to see that, not a
 * bar sitting flat at full. Clamping without saying so is how a UI quietly
 * throws away the most interesting fact on the screen.
 */
export function Bar({ ratio, tone = "brand", label, value }: BarProps) {
  const over = ratio > 1;
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  const t = TONE[over ? "good" : tone];
  return (
    <div className="space-y-1.5">
      {(label || value) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && <span className="text-xs text-surface-400 truncate">{label}</span>}
          {value && <span className={`text-xs font-semibold tabular-nums ${t.text}`}>{value}</span>}
        </div>
      )}
      <div className="h-1.5 rounded-full bg-surface-700 overflow-hidden">
        <div className={`h-full rounded-full ${t.solid} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ── Pill ─────────────────────────────────────────────────────────────────── */

/** A short state label. Never more than two words. */
export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${t.bg} ${t.text}`}>
      {children}
    </span>
  );
}
