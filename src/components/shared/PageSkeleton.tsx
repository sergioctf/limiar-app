import { AppShell } from "@/components/layout/AppShell";

/**
 * Route-level loading skeletons.
 *
 * Next.js only swaps the page once the server component finishes fetching, so
 * without a `loading.tsx` a tab click feels frozen. These render instantly
 * (inside AppShell, so the nav never flickers) and mirror each page's layout.
 */

export function SkelBar({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-surface-700/60 animate-[pulse-smooth_1.4s_ease-in-out_infinite] ${className}`} />;
}

export function SkelCard({ className = "" }: { className?: string }) {
  return <div className={`card animate-[pulse-smooth_1.4s_ease-in-out_infinite] ${className}`} />;
}

/** Page title + subtitle placeholder. */
export function SkelHeader() {
  return (
    <div className="space-y-2">
      <SkelBar className="h-7 w-44" />
      <SkelBar className="h-3.5 w-60" />
    </div>
  );
}

interface PageSkeletonProps {
  /** Number of full-width card blocks below the stat grid. */
  cards?: number;
  /** Number of small stat tiles (0 to hide the grid). */
  stats?: number;
}

/**
 * Generic page skeleton: header, optional stat grid, then card blocks.
 * Wrapped in AppShell so the sidebar/bottom-nav stay put during navigation.
 */
export function PageSkeleton({ cards = 3, stats = 0 }: PageSkeletonProps) {
  return (
    <AppShell>
      <div className="space-y-5 max-w-3xl mx-auto">
        <SkelHeader />

        {stats > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: stats }).map((_, i) => (
              <SkelCard key={i} className="h-24" />
            ))}
          </div>
        )}

        <div className="space-y-3">
          {Array.from({ length: cards }).map((_, i) => (
            <SkelCard key={i} className={i === 0 ? "h-40" : "h-28"} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
