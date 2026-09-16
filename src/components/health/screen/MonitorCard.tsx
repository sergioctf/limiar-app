"use client";

import type { MonitorItem } from "@/lib/health-view";

/**
 * The rest of what the watch measures, shown for what it is.
 *
 * None of these move the recovery score, and the card says nothing to suggest
 * they do. They are here because an athlete who owns a watch that reads blood
 * oxygen wants to see it somewhere other than the watch's own app.
 */
export function MonitorCard({ items }: { items: MonitorItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map(i => (
        <div key={i.key} className="rounded-2xl border border-surface-700 bg-surface-800 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">{i.label}</p>
          <p className="mt-1 text-xl font-black tabular-nums text-surface-100">{i.value}</p>
          <p className="text-[10px] text-surface-500">{i.date.slice(8, 10)}/{i.date.slice(5, 7)}</p>
        </div>
      ))}
    </div>
  );
}
