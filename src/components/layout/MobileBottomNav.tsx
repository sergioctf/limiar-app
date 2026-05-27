"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListOrdered,
  Target,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/",          icon: LayoutDashboard, label: "Home"     },
  { href: "/runs",      icon: ListOrdered,     label: "Corridas" },
  { href: "/analytics", icon: BarChart3,       label: "Gráficos" },
  { href: "/goals",     icon: Target,          label: "Metas"    },
  { href: "/settings",  icon: Settings,        label: "Config."  },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50
                    bg-surface-800/95 backdrop-blur-md
                    border-t border-surface-700
                    flex items-center
                    safe-area-pb">
      {navItems.map(({ href, icon: Icon, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors duration-150",
              active ? "text-brand-400" : "text-surface-500"
            )}
          >
            <Icon
              className={cn(
                "w-5 h-5 mb-0.5",
                active && "drop-shadow-[0_0_6px_rgba(249,115,22,0.6)]"
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
