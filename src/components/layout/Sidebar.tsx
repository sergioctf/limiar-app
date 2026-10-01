"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LimiarMark } from "@/components/LimiarMark";
import { NAV_AREAS, areaOf } from "@/components/layout/nav-areas";
import { isAreaVisible, NAV_ALL_VISIBLE, type NavData } from "@/lib/nav-visibility";

/**
 * Six areas instead of ten entries (18/09). Provas and Metas are part of the
 * Treinador; Corridas, Calendário and Gráficos are the Histórico — each reached
 * through the area's own tabs.
 */
export function Sidebar({ nav = NAV_ALL_VISIBLE }: { nav?: NavData }) {
  const pathname = usePathname();
  const current = areaOf(pathname);
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  return (
    <aside className="hidden lg:flex flex-col w-60 min-h-screen bg-surface-800 border-r border-surface-700 px-3 py-6">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 px-3 mb-8">
        <LimiarMark size={36} />
        <div>
          <span className="text-surface-100 font-bold text-lg leading-none tracking-tight">LIMIAR</span>
          <p className="text-surface-500 text-[10px] leading-none mt-0.5 tracking-widest uppercase">Performance</p>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex flex-col gap-1 flex-1">
        {NAV_AREAS.filter(a => isAreaVisible(a.key, nav)).map(({ key, href, icon: Icon, label }) => {
          const active = current?.key === key;
          return (
            <Link
              key={key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                key === "config" && "mt-4",
                active
                  ? "bg-brand-500/15 text-brand-400 border border-brand-500/20"
                  : "text-surface-400 hover:text-surface-200 hover:bg-surface-700/60"
              )}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto">
        <div className="flex items-center gap-2 px-3 py-2 mb-2 text-xs text-surface-500">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Corrida com inteligência</span>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-surface-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          <LogOut className="w-4.5 h-4.5" />
          Sair
        </button>
      </div>
    </aside>
  );
}
