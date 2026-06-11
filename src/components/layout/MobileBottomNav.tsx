"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListOrdered,
  Trophy,
  FileText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/",        icon: LayoutDashboard, label: "Home"      },
  { href: "/runs",    icon: ListOrdered,     label: "Corridas"  },
  { href: "/races",   icon: Trophy,          label: "Provas"    },
  { href: "/coach",   icon: FileText,        label: "Treinador" },
  { href: "/settings", icon: Settings,       label: "Config."   },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50
                    bg-surface-800/95 backdrop-blur-md
                    border-t border-surface-700
                    flex items-center
                    pb-safe">
      {navItems.map(({ href, icon: Icon, label }) => {
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
    </nav>
  );
}
