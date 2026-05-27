import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  accent?: boolean;
  className?: string;
}

export function StatCard({
  label, value, sub, icon: Icon, accent, className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "card p-4 flex flex-col gap-1",
        accent && "border-brand-500/40 bg-brand-500/5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="stat-label">{label}</span>
        {Icon && (
          <div className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
            accent ? "bg-brand-500/20" : "bg-surface-700"
          )}>
            <Icon className={cn("w-3.5 h-3.5", accent ? "text-brand-400" : "text-surface-400")} />
          </div>
        )}
      </div>
      <span className={cn("stat-value", accent && "text-brand-300")}>
        {value}
      </span>
      {sub && <span className="text-xs text-surface-500">{sub}</span>}
    </div>
  );
}
