"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListOrdered,
  Trophy,
  FileText,
  Settings,
  MoreHorizontal,
  CalendarDays,
  Target,
  Users,
  BarChart3,
  HeartPulse,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const primaryItems = [
  { href: "/",        icon: LayoutDashboard, label: "Home"      },
  { href: "/runs",    icon: ListOrdered,     label: "Corridas"  },
  { href: "/races",   icon: Trophy,          label: "Provas"    },
  { href: "/coach",   icon: FileText,        label: "Treinador" },
];

const moreItems = [
  { href: "/health",    icon: HeartPulse,   label: "Saúde"      },
  { href: "/calendar",  icon: CalendarDays, label: "Calendário" },
  { href: "/friends",   icon: Users,        label: "Amigos"     },
  { href: "/goals",     icon: Target,       label: "Metas"      },
  { href: "/analytics", icon: BarChart3,    label: "Gráficos"   },
  { href: "/settings",  icon: Settings,     label: "Configurações" },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // "Mais" is active when on any secondary page
  const onMorePage = moreItems.some(i => pathname.startsWith(i.href));

  return (
    <>
      {/* Backdrop + sheet */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-surface-800 border-t border-surface-700 rounded-t-2xl p-4 pb-safe animate-slide-in-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-surface-100">Mais</h3>
              <button onClick={() => setMoreOpen(false)} className="text-surface-500 hover:text-surface-300 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map(({ href, icon: Icon, label }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 py-4 rounded-xl text-xs font-medium transition-colors",
                      active
                        ? "bg-brand-500/15 text-brand-400 border border-brand-500/20"
                        : "bg-surface-700/40 text-surface-300 hover:bg-surface-700"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40
                      bg-surface-800/95 backdrop-blur-md
                      border-t border-surface-700
                      flex items-center
                      pb-safe">
        {primaryItems.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-3.5 px-2 text-xs font-medium transition-colors duration-150 min-h-16 justify-center",
                active ? "text-brand-400" : "text-surface-500 hover:text-surface-300"
              )}
            >
              <Icon
                className={cn(
                  "w-[22px] h-[22px]",
                  active && "drop-shadow-[0_0_8px_rgba(249,115,22,0.7)]"
                )}
              />
              {label}
            </Link>
          );
        })}

        {/* "Mais" trigger */}
        <button
          onClick={() => setMoreOpen(v => !v)}
          className={cn(
            "flex-1 flex flex-col items-center gap-0.5 py-3.5 px-2 text-xs font-medium transition-colors duration-150 min-h-16 justify-center",
            moreOpen || onMorePage ? "text-brand-400" : "text-surface-500 hover:text-surface-300"
          )}
        >
          <MoreHorizontal
            className={cn(
              "w-[22px] h-[22px]",
              (moreOpen || onMorePage) && "drop-shadow-[0_0_8px_rgba(249,115,22,0.7)]"
            )}
          />
          Mais
        </button>
      </nav>
    </>
  );
}
