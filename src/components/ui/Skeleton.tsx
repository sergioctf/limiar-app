"use client";

/**
 * Placeholders shaped like the thing that is coming.
 *
 * Sections used to appear from nothing, so the screen read as blinking rather
 * than working — and a spinner is no better, because it says "wait" without
 * saying what for. A grey ring where the ring will be tells the athlete the
 * shape of the answer before the answer arrives, and the layout stops jumping
 * when it does.
 *
 * The shimmer is deliberately slow. A fast pulse reads as an error state.
 */

export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-surface-700/60 animate-shimmer ${className}`} />;
}

/** A ring-shaped placeholder, for the week card and the readiness score. */
export function SkeletonRing({ size = 132 }: { size?: number }) {
  return (
    <div
      className="rounded-full border-[13px] border-surface-700/60 animate-shimmer shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

/**
 * The week card while its numbers are still being computed.
 *
 * Mirrors the real layout exactly — centred ring, headline, three cells — so
 * nothing moves when the data lands.
 */
export function SkeletonWeekCard() {
  return (
    <div className="rounded-2xl border border-surface-700 bg-surface-800 p-4">
      <div className="flex flex-col items-center gap-4">
        <SkeletonRing />
        <div className="flex flex-col items-center gap-2">
          <SkeletonBar className="h-8 w-28" />
          <SkeletonBar className="h-3 w-40" />
        </div>
        <div className="w-full grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map(i => <SkeletonBar key={i} className="h-[68px]" />)}
        </div>
      </div>
    </div>
  );
}

/** A generic card placeholder: title line plus a few rows. */
export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-surface-700 bg-surface-800 p-4 space-y-3">
      <SkeletonBar className="h-3 w-32" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBar key={i} className="h-10" />
      ))}
    </div>
  );
}

/** A chart-shaped placeholder — bars of varying height, so it reads as a chart. */
export function SkeletonChart({ height = 160 }: { height?: number }) {
  const heights = [55, 80, 40, 65, 90, 50, 70, 45];
  return (
    <div className="flex items-end justify-between gap-1.5" style={{ height }} aria-hidden>
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-md bg-surface-700/60 animate-shimmer"
          style={{ height: `${h}%`, animationDelay: `${i * 0.08}s` }}
        />
      ))}
    </div>
  );
}
