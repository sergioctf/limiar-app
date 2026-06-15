"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListOrdered,
  Target,
  BarChart3,
  FileText,
  Settings,
  LogOut,
  TrendingUp,
  CalendarDays,
  Trophy,
  Users,
  HeartPulse,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LimiarMark } from "@/components/LimiarMark";

const navItems = [
  { href: "/",           icon: LayoutDashboard, label: "Dashboard" },
  { href: "/runs",       icon: ListOrdered,     label: "Corridas"  },
  { href: "/races",      icon: Trophy,          label: "Provas"    },
  { href: "/calendar",   icon: CalendarDays,    label: "Calendário"},
  { href: "/analytics",  icon: BarChart3,       label: "Gráficos"  },
  { href: "/goals",      icon: Target,          label: "Metas"     },
  { href: "/health",     icon: HeartPulse,      label: "Saúde"     },
  { href: "/friends",    icon: Users,           label: "Amigos"    },
  { href: "/coach",      icon: FileText,        label: "Treinador" },
  { href: "/settings",   icon: Settings,        label: "Config."   },
];

export function Sidebar() {
  const pathname = usePathname();
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
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
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
        <div className="flex items-center gap-2 px-3 py-2 mb-2 text-xs text-surface-600">
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
