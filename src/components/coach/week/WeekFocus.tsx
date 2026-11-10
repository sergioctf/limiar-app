"use client";

import { ChevronDown } from "lucide-react";
import { ChromeRibbon } from "@/components/brand/ChromeRibbon";
import { isRunSession } from "@/lib/sports";
import type { WeeklyPlanData } from "@/types";

export function WeekFocus({ plan }: { plan: WeeklyPlanData }) {
  if (!plan.cycle && !plan.ai_message) return null;
  const running = plan.days.some(isRunSession);
  const strength = plan.days.some(day => day.strength);
  const phase = { base: "Base aeróbica", build: "Desenvolvimento", peak: "Pico de treino",
    taper: "Polimento", race: "Semana de prova" };
  const title = plan.cycle?.isRecovery ? "Semana de recuperação"
    : strength && !running ? "Treino de força"
    : running ? phase[plan.phase ?? "base"]
    : "Objetivo da semana";

  return (
    <details className="limiar-feature group">
      <summary className="relative flex min-h-[108px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-5">
        {/*
          A fita estava a 45% de opacidade, e metal a 45% não é metal: é véu.
          O próprio gradiente já termina em quase-preto nas duas pontas, então
          ele se funde ao card sozinho — a opacidade só roubava o estouro
          especular, que é justamente o que faz a superfície parecer polida.
        */}
        <ChromeRibbon className="pointer-events-none absolute -right-10 top-0 -z-10 h-full w-72 opacity-90" />
        <span className="min-w-0">
          <span className="limiar-kicker block">Foco da semana</span>
          <span className="mt-1 block text-2xl font-semibold tracking-tight text-surface-100">{title}</span>
          {plan.cycle && (
            <span className="mt-2 flex gap-1.5" aria-label={`Semana ${plan.cycle.week} de 4`}>
              {[1, 2, 3, 4].map(n => <span key={n} className={`h-1.5 w-5 rounded-full ${n <= plan.cycle!.week ? "bg-brand-500" : "bg-surface-600"}`} />)}
            </span>
          )}
        </span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-surface-600 bg-surface-900/60">
          <ChevronDown className="h-4 w-4 text-surface-300 transition-transform group-open:rotate-180" aria-label="Entender o planejamento" />
        </span>
      </summary>
      <div className="space-y-2 border-t border-surface-700 px-4 py-4 text-sm leading-relaxed text-surface-400 sm:px-5">
        {plan.ai_message && <p>{plan.ai_message}</p>}
        {plan.week_reading && plan.week_reading.status !== "short" && (
          <p><strong className="text-surface-200">{plan.week_reading.headline}</strong> {plan.week_reading.detail}</p>
        )}
        {running && <p>O volume progride com teto. Os ritmos e as zonas ficam mais precisos quando você calibra o plano com seu teste.</p>}
      </div>
    </details>
  );
}
