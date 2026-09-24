"use client";

/**
 * O foco da semana: uma frase, sem caixa.
 *
 * Era um bloco com borda, fundo, título e dois parágrafos — a explicação do
 * ciclo de quatro semanas repetida toda segunda-feira, empurrando a agenda
 * para baixo. O recado do treinador fica; a aula sobre periodização vai para
 * trás de "Entender o planejamento", que é onde se procura uma explicação
 * quando se quer uma.
 */
import { useState } from "react";
import { Moon, Sparkles } from "lucide-react";
import type { WeeklyPlanData } from "@/types";

export function WeekFocus({ plan }: { plan: WeeklyPlanData }) {
  const [open, setOpen] = useState(false);
  if (!plan.cycle && !plan.ai_message) return null;

  const isRecovery = !!plan.cycle?.isRecovery;

  return (
    <div className="flex items-start gap-2.5">
      {isRecovery
        ? <Moon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
        : <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-surface-300">
          {plan.ai_message
            ?? (isRecovery
              ? "Semana mais leve de propósito: é ela que faz as três anteriores virarem ganho."
              : "Três semanas subindo e uma de recuperação — é assim que o bloco funciona.")}
        </p>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="mt-1 min-h-[36px] text-xs font-medium text-surface-400 transition-colors hover:text-brand-300"
        >
          {open ? "Mostrar menos" : "Entender o planejamento"}
        </button>
        {open && (
          <div className="mt-1 space-y-2 border-l border-surface-700 pl-3 text-xs leading-relaxed text-surface-400">
            <p>
              {isRecovery
                ? "Esta é a quarta semana do bloco, mais leve de propósito: é quando o corpo absorve as três anteriores. Na próxima, o volume volta a subir."
                : `O bloco tem quatro semanas: três subindo e uma de recuperação, que é onde o ganho se fixa.${
                    plan.cycle ? ` Esta é a ${plan.cycle.week}ª.` : ""}`}
            </p>
            {/*
              Como a semana anterior entrou nesta. O atleta não deveria ter que
              adivinhar por que o volume mudou — nem por que não mudou, depois
              de uma semana que o trabalho ou a chuva quebraram. Quando ela ficou
              curta, isso já está dito acima, em destaque.
            */}
            {plan.week_reading && plan.week_reading.status !== "short" && (
              <p>
                <span className="text-surface-300">{plan.week_reading.headline}</span>{" "}
                {plan.week_reading.detail}
              </p>
            )}
            <p>
              Os ritmos vêm do seu teste de 3 km (VDOT) e as zonas do seu limiar; o volume
              sobe com teto, e nunca por causa de uma semana só.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
