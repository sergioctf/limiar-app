"use client";

/**
 * O cabeçalho da semana.
 *
 * Dizia o período e mais nada — "Sua semana, 21 a 27 de set" — enquanto o
 * atleta somava sete dias de cabeça para saber se a semana era grande. Agora
 * diz o tamanho dela, e onde ela está no bloco.
 *
 * As abas de semana ficam aqui, compactas, no canto: são um controle de
 * navegação, não o protagonista. Eram uma barra da largura inteira do card, do
 * mesmo peso visual do plano que servem para escolher.
 */
import { Loader2, RotateCcw } from "lucide-react";
import { formatWeekRange } from "@/components/coach/week/tone";
import type { WeeklyPlanData } from "@/types";

export function WeekHeader({
  weekStart, cycle, summary, tabs, canRegenerate, generating, onRegenerate,
}: {
  weekStart: string;
  cycle: WeeklyPlanData["cycle"] | null;
  /** "3 corridas · 27 km · 2 sessões de musculação". */
  summary: string | null;
  tabs: React.ReactNode;
  /** A semana em andamento é congelada: refazer só vale para a próxima. */
  canRegenerate: boolean;
  generating: boolean;
  onRegenerate: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {/* "Sua semana": o plano é do motor (Daniels/Friel), a IA só escreve o recado. */}
        <h2 className="text-3xl font-semibold tracking-tight leading-tight text-surface-100">Sua semana</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-surface-400">
          <span>{formatWeekRange(weekStart)}</span>
          {cycle && (
            <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${
              cycle.isRecovery ? "bg-cyan-500/15 text-cyan-300" : "bg-surface-700 text-surface-300"
            }`}>
              {cycle.isRecovery ? "Recuperação" : `Semana ${cycle.week} de 4`}
            </span>
          )}
        </p>
        {summary && <p className="mt-1.5 text-sm font-medium text-surface-200">{summary}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {tabs}
        {/*
          Refazer do zero é a ação mais destrutiva desta tela, e era a menos
          explicada: chamava-se "Regenerar", tinha só um tooltip, e na semana
          em andamento — congelada — falha de propósito. Agora diz o nome do
          que faz, avisa o que se perde, e só aparece onde funciona.
        */}
        {canRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={generating}
            title="Refazer do zero"
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-xs text-surface-400 transition-colors hover:bg-surface-700/50 hover:text-surface-200"
          >
            {generating
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RotateCcw className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Refazer do zero</span>
          </button>
        )}
      </div>
    </div>
  );
}
