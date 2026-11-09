"use client";

/**
 * Hoje · Treinador · Histórico · Saúde · Amigos (18/09).
 *
 * The "Mais" drawer is gone: Saúde and Amigos were hidden in it, and they are
 * areas, not extras. Configurações lives in the top bar (see MobileTopBar), one
 * tap away on every screen instead of two taps inside a drawer.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_AREAS, areaOf } from "@/components/layout/nav-areas";
import { isAreaVisible, NAV_ALL_VISIBLE, type NavData } from "@/lib/nav-visibility";

const BOTTOM = NAV_AREAS.filter(a => a.key !== "config");

export function MobileBottomNav({ nav = NAV_ALL_VISIBLE }: { nav?: NavData }) {
  const pathname = usePathname();
  const current = areaOf(pathname);

  return (
    <nav aria-label="Navegação principal" className={cn("limiar-dock lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-center pb-safe",
      pathname === "/ia" || pathname.startsWith("/ia/") ? "" : "pr-[62px]")}>
      {BOTTOM.filter(a => isAreaVisible(a.key, nav)).map(({ key, href, icon: Icon, label }) => {
        const active = current?.key === key;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-3.5 px-1 text-[11px] font-medium transition-colors duration-150 min-h-16 justify-center",
              active ? "limiar-dock-active text-brand-400" : "text-surface-500 hover:text-surface-300"
            )}
          >
            <Icon className="h-[22px] w-[22px]" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
