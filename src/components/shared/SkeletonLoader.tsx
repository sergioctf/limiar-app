"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "card" | "text" | "line" | "circle" | "stat";
}

export function Skeleton({ className, variant = "line" }: SkeletonProps) {
  const baseClasses = "animate-pulse bg-surface-700";

  const variants = {
    line:   "h-4 rounded",
    text:   "h-5 rounded w-3/4",
    circle: "h-10 w-10 rounded-full",
    card:   "h-32 rounded-lg",
    stat:   "h-8 rounded",
  };

  return (
    <div className={cn(baseClasses, variants[variant], className)} />
  );
}

/** Skeleton for a stat card (e.g., "Corridas: 5") */
export function SkeletonStatCard() {
  return (
    <div className="card p-4 space-y-3">
      <Skeleton variant="line" className="h-3 w-20" />
      <Skeleton variant="stat" className="w-1/3" />
      <Skeleton variant="line" className="h-2 w-1/2" />
    </div>
  );
}

/** Skeleton for a full-width card with title + content */
export function SkeletonCardContent() {
  return (
    <div className="card p-4 space-y-4">
      <Skeleton variant="text" className="w-1/3" />
      <div className="space-y-2">
        <Skeleton variant="line" className="w-full" />
        <Skeleton variant="line" className="w-5/6" />
      </div>
    </div>
  );
}

/** Grid of stat cards (e.g., Esta semana overview) */
export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStatCard key={i} />
      ))}
    </div>
  );
}

/** Activity feed skeleton */
export function SkeletonActivityFeed() {
  return (
    <div className="card p-4 space-y-4">
      <Skeleton variant="text" className="w-1/4" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton variant="circle" />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" className="w-2/3" />
              <Skeleton variant="line" className="h-2 w-1/2" />
            </div>
            <Skeleton variant="line" className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
