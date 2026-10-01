"use client";

import { useState } from "react";
import { ChevronRight, ChevronLeft, X, Check } from "lucide-react";
import { LimiarMark } from "@/components/LimiarMark";
import { OnboardingScene } from "@/components/onboarding/OnboardingScene";
import { ONBOARDING_STEPS, type OnboardingStepDef } from "@/lib/onboarding-flow";

/**
 * The first-run flow: a showcase and a setup wizard braided together.
 *
 * It has two jobs that pull in opposite directions. Configuration wants to be
 * short; a product tour wants to be thorough. Alternating them is the
 * compromise — each question arrives right after the screen that makes it
 * matter, so answering feels like a consequence rather than paperwork.
 *
 * Nothing here is mandatory. Every step can be skipped and the whole flow can
 * be closed, because whatever is left undone reappears in the dashboard
 * checklist. A wizard that traps someone between signup and the app is worse
 * than no wizard at all.
 *
 * `onCollect` is where the questions actually write: this component owns
 * sequence and presentation, and knows nothing about profiles or Supabase.
 */
export function OnboardingFlow({
  onFinish,
  renderQuestion,
  steps = ONBOARDING_STEPS,
  footer,
}: {
  onFinish: () => void;
  /** Qual sequência rodar: o primeiro acesso (padrão) ou a vitrine. */
  steps?: OnboardingStepDef[];
  /** Oferecido na última tela — é por onde o primeiro acesso leva ao tour. */
  footer?: React.ReactNode;
  /**
   * Renders the form for a question step. Returning null makes the step a
   * plain informational screen — useful while the forms are still being built,
   * and the reason the flow can ship before every field exists.
   */
  renderQuestion?: (step: OnboardingStepDef, next: () => void) => React.ReactNode;
}) {
  const [i, setI] = useState(0);
  const step = steps[i];
  const isLast = i === steps.length - 1;

  const next = () => (isLast ? onFinish() : setI(n => n + 1));
  const back = () => setI(n => Math.max(0, n - 1));

  const form = step.kind === "question" ? renderQuestion?.(step, next) : null;

  return (
    <div className="fixed inset-0 z-[130] bg-surface-900 flex flex-col overlay-fullscreen">
      {/* Progress: thin, non-numeric. "3 de 16" reads as a chore. */}
      <div className="h-0.5 bg-surface-800 shrink-0">
        <div
          className="h-full bg-brand-500 transition-all duration-300"
          style={{ width: `${((i + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <LimiarMark className="h-5 w-auto" />
        <button
          onClick={onFinish}
          className="text-xs text-surface-400 hover:text-surface-200 inline-flex items-center gap-1.5 min-h-[44px] px-2 -mr-2"
        >
          Pular tudo <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Centred when it fits, scrolled when it does not. Top-aligned left a
          form hanging under the title with half the screen empty below it. */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col justify-center">
        <div className="w-full max-w-sm mx-auto space-y-4 py-2">
          <div>
            <h1 className="text-xl font-black text-surface-100 leading-tight">{step.title}</h1>
            <p className="text-xs text-surface-400 leading-relaxed mt-1.5">{step.body}</p>
          </div>

          {step.scene && <OnboardingScene scene={step.scene} />}
          {form}
          {isLast && footer}
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-t border-surface-700 shrink-0">
        {i > 0 && (
          <button onClick={back} aria-label="Voltar"
            className="btn-ghost shrink-0 min-w-[44px]">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* A question already has its own save action; the footer only offers
            the way past it. */}
        {step.kind === "question" && form ? (
          <button onClick={next}
            className="ml-auto text-xs font-semibold text-surface-300 hover:text-surface-100 px-4 min-h-[44px] rounded-xl hover:bg-surface-700/60 transition-colors">
            Faço depois
          </button>
        ) : (
          <button onClick={next} className="btn-primary flex-1 justify-center">
            {isLast ? <><Check className="w-4 h-4" /> Começar</> : <>Continuar <ChevronRight className="w-4 h-4" /></>}
          </button>
        )}
      </div>
    </div>
  );
}
