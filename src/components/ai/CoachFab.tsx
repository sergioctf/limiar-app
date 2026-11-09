"use client";

/** The mobile dock reserves a lane for the sphere. On desktop it floats above the page. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LimiOrb } from "@/components/brand/LimiOrb";

export function CoachFab() {
  const pathname = usePathname();
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const check = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      setAtBottom(window.innerWidth >= 1024 && total - scrolled < 140);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [pathname]);

  if (pathname === "/ia" || pathname.startsWith("/ia/") || pathname.startsWith("/auth")) return null;

  return (
    <Link
      href="/ia"
      aria-label="Abrir Limi IA"
      aria-hidden={atBottom}
      tabIndex={atBottom ? -1 : undefined}
      className={`fixed right-2 z-[41] flex h-[52px] w-[52px] items-center justify-center rounded-full
                  limiar-orb-button transition-[transform,opacity] duration-200 hover:scale-105 active:scale-95
                  bottom-[calc(.35rem+env(safe-area-inset-bottom))] lg:right-6 lg:bottom-6 lg:h-14 lg:w-14
                  ${atBottom ? "pointer-events-none translate-y-4 opacity-0" : "opacity-100"}`}
    >
      <LimiOrb className="h-full w-full p-0.5" still />
    </Link>
  );
}
