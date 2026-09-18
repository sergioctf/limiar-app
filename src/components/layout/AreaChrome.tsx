"use client";

/**
 * What every screen shows above its content, decided by the area it is in.
 *
 *   · On the phone, a slim top bar: the logo, and Configurações one tap away
 *     (Sérgio, 18/09: "vão precisar de mais destaque do que tem hoje").
 *   · In an area with several pages — Treinador (Plano · Provas · Metas) and
 *     Histórico (Corridas · Calendário · Gráficos) — the area's tabs, so the
 *     pages that used to be separate menu entries read as one place.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { LimiarMark } from "@/components/LimiarMark";
import { areaOf } from "@/components/layout/nav-areas";

export function MobileTopBar() {
  const pathname = usePathname();
  const onSettings = areaOf(pathname)?.key === "config";
  return (
    <div className="lg:hidden flex items-center justify-between h-12 px-4 border-b border-surface-800">
      <Link href="/" className="flex items-center gap-2" aria-label="Hoje">
        <LimiarMark size={24} />
        <span className="text-surface-100 font-bold text-sm tracking-tight">LIMIAR</span>
      </Link>
      <Link
        href="/settings"
        aria-label="Configurações"
        aria-current={onSettings ? "page" : undefined}
        className={cn(
          "flex items-center justify-center w-11 h-11 -mr-2 rounded-xl transition-colors",
          onSettings ? "text-brand-400" : "text-surface-400 hover:text-surface-200",
        )}
      >
        <Settings className="w-5 h-5" />
      </Link>
    </div>
  );
}

export function AreaTabs() {
  const pathname = usePathname();
  const area = areaOf(pathname);
  // Only on the area's own pages — a run's detail page is not a tab.
  if (!area?.tabs || !area.tabs.some(t => t.href === pathname)) return null;
  return (
    <nav aria-label={area.label} className={cn(area.width ?? "max-w-4xl", "mx-auto mb-4")}>
      <div className="flex gap-1 bg-surface-800 border border-surface-700 rounded-xl p-1">
        {area.tabs.map(t => {
          const active = t.href === pathname;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex-1 min-h-[40px] flex items-center justify-center rounded-lg text-sm font-semibold transition-colors",
                active ? "bg-surface-700 text-surface-100" : "text-surface-400 hover:text-surface-200",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
