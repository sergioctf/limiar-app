"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  /** decimal places to show (default 0) */
  decimals?: number;
  /** animation duration in ms (default 900) */
  duration?: number;
  /** text appended after the number, e.g. " km" */
  suffix?: string;
  /** text prepended before the number */
  prefix?: string;
  className?: string;
}

/** easeOutExpo — fast start, gentle settle */
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Animates a number from 0 → value when it first scrolls into view.
 * Respects prefers-reduced-motion (shows the final value immediately).
 */
export function CountUp({ value, decimals = 0, duration = 900, suffix = "", prefix = "", className }: Props) {
  // Starts on the real number: if no animation ever runs (no frames, no observer), the number is still right.
  const [display, setDisplay] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setDisplay(value); return; }

    const el = ref.current;
    if (!el) { setDisplay(value); return; }

    let fallback: number | undefined;
    const animate = () => {
      if (started.current) return;
      started.current = true;
      // A page opened in the background gets no animation frames: show the number, not a frozen 0.
      if (document.visibilityState !== "visible") { setDisplay(value); return; }
      const start = performance.now();
      const tick = (now: number) => {
        // The frame timestamp can precede `start`; unclamped, the first frame showed "-87".
        const t = Math.max(0, Math.min(1, (now - start) / duration));
        setDisplay(value * easeOutExpo(t));
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
        else setDisplay(value);
      };
      rafRef.current = requestAnimationFrame(tick);
      // Frames can be withheld (background tab, battery saver); the number must still land.
      fallback = window.setTimeout(() => setDisplay(value), duration + 150);
    };

    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { animate(); io.disconnect(); } }),
      { threshold: 0.3 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      if (fallback) window.clearTimeout(fallback);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}{display.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}
