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
 *
 * **E ele sai da frente no fim da página** (01/10). No Treinador, ficava em
 * cima de "Meus dias de sempre" e da conversa da semana: um botão flutuante
 * que cobre um controle é um botão que impede outro. Em vez de empurrá-lo para
 * cima em cada tela — o que só move o problema —, ele desaparece nos últimos
 * 140 px de rolagem, que é onde as ações de rodapé moram.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

export function CoachFab() {
  const pathname = usePathname();
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const check = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      setAtBottom(total - scrolled < 140);
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
      aria-label="Falar com seu treinador"
      aria-hidden={atBottom}
      tabIndex={atBottom ? -1 : undefined}
      className={`fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full
                  bg-brand-500 text-white shadow-lg shadow-brand-500/30
                  transition-all duration-200 hover:bg-brand-400 active:scale-95
                  bottom-[calc(5.25rem+env(safe-area-inset-bottom))] lg:right-6 lg:bottom-6
                  ${atBottom ? "pointer-events-none translate-y-4 opacity-0" : "opacity-100"}`}
    >
      <Sparkles className="h-6 w-6" />
    </Link>
  );
}
