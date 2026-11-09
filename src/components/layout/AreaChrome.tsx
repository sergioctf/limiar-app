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
import { isTabVisible, NAV_ALL_VISIBLE, type NavData } from "@/lib/nav-visibility";
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
    <div className="lg:hidden flex items-center justify-between h-14 px-5">
      <Link href="/" className="flex items-center gap-2" aria-label="Hoje">
        <LimiarMark size={24} />
        <span className="limiar-wordmark">LIMIAR</span>
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

export function AreaTabs({ nav = NAV_ALL_VISIBLE }: { nav?: NavData }) {
  const pathname = usePathname();
  const area = areaOf(pathname);
  // Only on the area's own pages — a run's detail page is not a tab.
  if (!area?.tabs || !area.tabs.some(t => t.href === pathname)) return null;
  /*
    Aba vazia não é opção. Provas e Metas só aparecem depois da primeira
    corrida, Gráficos a partir de três — e uma aba sozinha não é barra de abas.
  */
  const tabs = area.tabs.filter(t => isTabVisible(t.href, nav) || t.href === pathname);
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={area.label} className={cn(area.width ?? "max-w-4xl", "mx-auto mb-4")}>
      <div className="limiar-segments flex gap-0.5 p-1">
        {tabs.map(t => {
          const active = t.href === pathname;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex-1 min-h-[44px] flex items-center justify-center rounded-full px-1 text-xs sm:text-sm font-semibold transition-colors",
                active ? "limiar-segment-active text-surface-100" : "text-surface-400 hover:text-surface-200",
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
