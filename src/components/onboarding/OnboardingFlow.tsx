"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronLeft, X, Check } from "lucide-react";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { OnboardingScene } from "@/components/onboarding/OnboardingScene";
import { ONBOARDING_STEPS, type OnboardingStepDef } from "@/lib/onboarding-flow";

export function OnboardingFlow({
  onFinish,
  renderQuestion,
  steps = ONBOARDING_STEPS,
  footer,
  initialStep = 0,
  onStepChange,
  onDismiss = onFinish,
  busy = false,
  error,
}: {
  onFinish: () => void;
  steps?: OnboardingStepDef[];
  footer?: React.ReactNode;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  onDismiss?: () => void;
  busy?: boolean;
  error?: string | null;
  renderQuestion?: (step: OnboardingStepDef, next: (skipRunningSteps?: boolean) => void) => React.ReactNode;
}) {
  const [i, setI] = useState(initialStep);
  const [skippedRunning, setSkippedRunning] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const step = steps[i];
  const isLast = i === steps.length - 1;
  const setup = steps === ONBOARDING_STEPS;

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    scroll.current?.scrollTo(0, 0);
  }, [i]);

  function goTo(index: number) {
    setI(index);
    onStepChange?.(index);
  }
  const next = () => isLast ? onFinish() : goTo(i + 1);
  const back = () => goTo(skippedRunning && isLast ? steps.findIndex(s => s.field === "runDays") : i - 1);

  const form = step.kind === "question" ? renderQuestion?.(step, skip => {
    if (step.field === "runDays") setSkippedRunning(Boolean(skip));
    if (skip) goTo(steps.length - 1);
    else next();
  }) : null;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="onboarding-step-title"
      onCancel={event => { event.preventDefault(); if (!busy) onDismiss(); }}
      className="limiar-onboarding m-0 max-h-none max-w-none p-0 bg-surface-900 text-surface-300"
    >
      <div className="h-1 bg-surface-700 shrink-0" role="progressbar"
        aria-label="Progresso da configuração" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={i + 1}>
        <div className="h-full bg-gradient-brand transition-[width] duration-300" style={{ width: `${(i + 1) / steps.length * 100}%` }} />
      </div>

      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-2 px-5 py-3 shrink-0">
        <BrandLockup />
        <button disabled={busy} onClick={onDismiss}
          className="text-xs text-surface-400 hover:text-surface-200 inline-flex items-center gap-1.5 min-h-[44px] px-2">
          {setup ? "Configurar depois" : "Fechar tour"} <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>

      <div ref={scroll} className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4 flex flex-col">
        <div key={step.id} className="limiar-enter w-full max-w-md mx-auto my-auto space-y-5 py-5">
          {setup && step.kind === "welcome" && <div className="limiar-onboarding-art" aria-hidden />}
          <div>
            <p className="limiar-kicker mb-2">{step.kind === "question" ? "Seu perfil de treino" : "Performance pessoal"}</p>
            <h1 ref={heading} tabIndex={-1} id="onboarding-step-title"
              className="text-3xl sm:text-4xl font-semibold tracking-tight text-surface-100 leading-tight outline-none">{step.title}</h1>
            <p className="text-sm text-surface-400 leading-relaxed mt-2.5">{step.body}</p>
          </div>
          {step.scene && <OnboardingScene scene={step.scene} />}
          {form}
          {isLast && footer}
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-lg items-center gap-2 px-5 py-3 border-t border-surface-700 shrink-0">
        {i > 0 && (
          <button disabled={busy} onClick={back} aria-label="Voltar" className="btn-ghost shrink-0 min-w-[44px]">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {step.kind === "question" && form ? (
          <button onClick={next} className="btn-ghost ml-auto">
            {step.field === "strava" ? "Continuar sem Strava" : "Faço depois"}
          </button>
        ) : (
          <button disabled={busy} onClick={next} className="btn-primary flex-1">
            {isLast ? <><Check className="w-4 h-4" /> {busy ? "Preparando…" : setup ? "Ver meu primeiro treino" : "Concluir"}</>
              : <>Continuar <ChevronRight className="w-4 h-4" /></>}
          </button>
        )}
      </div>
    </dialog>
  );
}
