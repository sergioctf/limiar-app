"use client";

import { useEffect, useId, useState } from "react";
import { TONE, type Tone } from "./tone";

/**
 * A progress ring that draws itself.
 *
 * This is the shape Whoop built its identity on, and the reason is not
 * decoration: a ring encodes a ratio in a form the eye reads before it reads a
 * number, and it gives the screen a focal point that a row of digits never
 * does. An overview screen made only of text is legible and forgettable.
 *
 * The stroke animates from zero on mount. That is what makes the number feel
 * *measured* rather than printed — the same reason the counters count up. It
 * respects `prefers-reduced-motion` by jumping straight to the final value.
 */

interface RingProps {
  /** 0–1. Above 1 is drawn full and tinted as an overshoot. */
  ratio: number;
  /** Rendered in the middle. Keep it to a few characters. */
  children?: React.ReactNode;
  size?: number;
  thickness?: number;
  tone?: Tone;
  label?: string;
  chrome?: boolean;
  /**
   * The same measure a week ago, drawn dimmed behind the live arc.
   *
   * A percentage on its own says where you are; a percentage with last week
   * behind it says whether you are gaining. It costs one more circle and turns
   * a readout into a comparison, which is most of what makes a recovery app
   * feel alive rather than merely accurate.
   */
  ghost?: number | null;
}

const STROKE: Record<Tone, string> = {
  neutral: "stroke-surface-500",
  brand:   "stroke-brand-500",
  good:    "stroke-emerald-500",
  warn:    "stroke-amber-500",
  alert:   "stroke-red-500",
};

export function Ring({
  ratio, children, size = 120, thickness = 10, tone = "brand", label, ghost = null, chrome = false,
}: RingProps) {
  const metal = useId();
  const over = ratio > 1;
  const target = Math.max(0, Math.min(1, ratio));
  const t = over ? "good" : tone;

  /*
   * Start at zero and move to the value one frame later, so the browser has a
   * first paint to transition *from*. Setting it directly gives no animation
   * at all — the element mounts already finished.
   */
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setDrawn(target); return; }
    const id = requestAnimationFrame(() => setDrawn(target));
    return () => cancelAnimationFrame(id);
  }, [target]);

  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        {chrome && (
          <defs>
            <linearGradient id={metal} x1="0" y1=".2" x2="1" y2=".75">
              <stop stopColor="#6d28d9" /><stop offset=".33" stopColor="#b18aff" />
              <stop offset=".54" stopColor="#eef1fa" /><stop offset=".75" stopColor="#78829d" />
              <stop offset="1" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
        )}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={thickness}
          className="stroke-surface-700"
        />
        {ghost != null && ghost > 0 && (
          /* Last week, behind and dimmed — a mark to beat, not a second reading. */
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" strokeWidth={thickness} strokeLinecap="round"
            className={`${STROKE[t]} opacity-25`}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: circumference * (1 - Math.max(0, Math.min(1, ghost))),
            }}
          />
        )}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={thickness} strokeLinecap="round"
          stroke={chrome ? `url(#${metal})` : undefined}
          className={`${chrome ? "" : STROKE[t]} transition-[stroke-dashoffset] duration-700 ease-smooth`}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: circumference * (1 - drawn),
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-black tabular-nums leading-none ${TONE[t].text}`}>
          {children}
        </span>
        {label && (
          <span className="text-[10px] uppercase tracking-wider text-surface-500 mt-1">{label}</span>
        )}
      </div>
    </div>
  );
}

/* ── Sparkline ────────────────────────────────────────────────────────────── */

/**
 * A trend, small enough to sit inside a row.
 *
 * Whoop puts one of these beside almost every number, and it is why a dense
 * screen still reads quickly: the shape answers "which way is this going"
 * without the athlete parsing a chart. A number alone cannot do that, and a
 * full chart costs far too much room to repeat six times.
 */
export function Sparkline({
  values, tone = "brand", width = 72, height = 24,
}: {
  values: number[];
  tone?: Tone;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);

  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(" ");

  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible" aria-hidden>
      <polyline
        points={points}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={STROKE[tone]}
      />
      {/* The last point, so the eye lands on "now" rather than on the whole line. */}
      <circle
        cx={(values.length - 1) * step}
        cy={height - ((values[values.length - 1] - min) / span) * height}
        r={2.5}
        className={`${STROKE[tone]} fill-surface-900`}
        strokeWidth={2}
      />
    </svg>
  );
}
