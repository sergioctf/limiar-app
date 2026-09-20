"use client";

/**
 * O botão da IA — redondo, laranja, no canto inferior direito, em toda aba.
 *
 * Pedido do Sérgio (20/09). Ele fica acima da barra de baixo no celular, para
 * não disputar espaço com a navegação, e some quando a própria tela da IA está
 * aberta — um botão que leva para onde você já está é ruído.
 *
 * A altura usa a mesma conta da barra: 4rem de barra + folga + a área segura do
 * iPhone. No desktop não há barra, então ele desce para o canto.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

export function CoachFab() {
  const pathname = usePathname();
  if (pathname === "/ia" || pathname.startsWith("/ia/") || pathname.startsWith("/auth")) return null;

  return (
    <Link
      href="/ia"
      aria-label="Falar com seu treinador"
      className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full
                 bg-brand-500 text-white shadow-lg shadow-brand-500/30
                 transition-transform hover:bg-brand-400 active:scale-95
                 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] lg:right-6 lg:bottom-6"
    >
      <Sparkles className="h-6 w-6" />
    </Link>
  );
}
