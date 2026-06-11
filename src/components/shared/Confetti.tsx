"use client";

import { useEffect, useState } from "react";

interface Props {
  /** when this changes to true, a burst fires once */
  trigger: boolean;
  /** number of particles (default 28) */
  count?: number;
  /** called after the burst finishes */
  onDone?: () => void;
}

const COLORS = ["#f97316", "#fb923c", "#fbbf24", "#34d399", "#60a5fa", "#f472b6"];

interface Particle {
  id: number;
  left: number;     // %
  dx: number;       // px horizontal drift
  delay: number;    // ms
  duration: number; // ms
  color: string;
  size: number;
  rotate: number;
}

/**
 * Lightweight, dependency-free confetti burst. Renders a fixed overlay of
 * falling colored shards for ~1.6s, then unmounts itself.
 * Respects prefers-reduced-motion (renders nothing).
 */
export function Confetti({ trigger, count = 28, onDone }: Props) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!trigger) return;
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { onDone?.(); return; }

    const items: Particle[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      left: 50 + (Math.random() - 0.5) * 60,
      dx: (Math.random() - 0.5) * 220,
      delay: Math.random() * 150,
      duration: 1100 + Math.random() * 600,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 6,
      rotate: Math.random() * 360,
    }));
    setParticles(items);

    const t = setTimeout(() => { setParticles([]); onDone?.(); }, 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  if (particles.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {particles.map(p => (
        <span
          key={p.id}
          className="absolute top-[30%]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.4,
            background: p.color,
            borderRadius: 2,
            // CSS custom props consumed by the keyframe
            ["--dx" as string]: `${p.dx}px`,
            ["--rot" as string]: `${p.rotate}deg`,
            animation: `confetti-fall ${p.duration}ms cubic-bezier(0.2,0.6,0.4,1) ${p.delay}ms forwards`,
          }}
        />
      ))}
    </div>
  );
}
