"use client";

import { useEffect, useState } from "react";
import { PlayCircle } from "lucide-react";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { OnboardingQuestion } from "@/components/onboarding/OnboardingQuestions";
import { ONBOARDING_STEPS, TOUR_STEPS, TOUR_STORAGE_KEY } from "@/lib/onboarding-flow";

/**
 * Decide se mostra o primeiro acesso — e qual dos dois fluxos.
 *
 * "Já mostrei isto?" mora num lugar só: este portão e o botão das
 * Configurações leem e escrevem a mesma chave (`TOUR_STORAGE_KEY`). Três
 * cópias dessa regra é como um tutorial acaba nunca aparecendo, ou aparecendo
 * para sempre — e era o caso: havia três implementações de tutorial no app até
 * 01/10.
 *
 * **Dois fluxos, não um.** Conta nova abre o primeiro acesso: quatro perguntas,
 * na ordem em que o plano depende delas. `?tour=1` abre a vitrine — nove cenas,
 * nenhuma pergunta —, que é o que o botão das Configurações usa e o que a
 * última tela do primeiro acesso oferece a quem quiser ver o app inteiro.
 */
export function OnboardingGate({ isNewUser }: { isNewUser: boolean }) {
  const [open, setOpen] = useState<null | "setup" | "tour">(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const forced = window.location.search.includes("tour=1");
    let seen = false;
    try { seen = !!localStorage.getItem(TOUR_STORAGE_KEY); } catch { /* sem storage */ }
    if (forced) setOpen("tour");
    else if (isNewUser && !seen) setOpen("setup");
  }, [isNewUser]);

  function finish() {
    try { localStorage.setItem(TOUR_STORAGE_KEY, "1"); } catch { /* sem storage */ }
    setOpen(null);
    // Drop ?tour=1 so a refresh does not reopen what was just dismissed.
    if (typeof window !== "undefined" && window.location.search.includes("tour=1")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  if (!open) return null;

  if (open === "tour") {
    return <OnboardingFlow steps={TOUR_STEPS} onFinish={finish} />;
  }

  return (
    <OnboardingFlow
      steps={ONBOARDING_STEPS}
      onFinish={finish}
      renderQuestion={(step, next) =>
        step.field ? <OnboardingQuestion field={step.field} onSaved={next} /> : null}
      footer={
        /*
          A vitrine fica aqui, no fim, como oferta — não como pedágio. Quem
          acabou de configurar já pode usar o app; quem quiser ver o resto
          escolhe ver.
        */
        <button
          type="button"
          onClick={() => setOpen("tour")}
          className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl border border-surface-700 text-sm font-medium text-surface-300 transition-colors hover:border-brand-500/50 hover:text-brand-200"
        >
          <PlayCircle className="h-4 w-4" /> Ver o que o app faz
        </button>
      }
    />
  );
}
