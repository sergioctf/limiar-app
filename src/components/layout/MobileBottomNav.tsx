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

const BOTTOM = NAV_AREAS.filter(a => a.key !== "config");

export function MobileBottomNav() {
  const pathname = usePathname();
  const current = areaOf(pathname);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40
                    bg-surface-800/95 backdrop-blur-md
                    border-t border-surface-700
                    flex items-center
                    pb-safe">
      {BOTTOM.map(({ key, href, icon: Icon, label }) => {
        const active = current?.key === key;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-3.5 px-1 text-[11px] font-medium transition-colors duration-150 min-h-16 justify-center",
              active ? "text-brand-400" : "text-surface-500 hover:text-surface-300"
            )}
          >
            <Icon className={cn("w-[22px] h-[22px]", active && "drop-shadow-[0_0_8px_rgba(249,115,22,0.7)]")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
