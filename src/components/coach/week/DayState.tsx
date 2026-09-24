"use client";

/**
 * O estado de execução do dia, dito com texto e símbolo.
 *
 * Nunca só com cor: verde já quer dizer "rodagem" nesta tela, e uma cor que
 * significa duas coisas não significa nenhuma. Quem não distingue verde de
 * cinza continua lendo "Registrado".
 */
import { Check, CircleDashed, MinusCircle, Plus } from "lucide-react";
import type { DayProgress } from "@/lib/day-progress";

const ICONS = {
  done:    <Check className="h-3 w-3" />,
  partial: <CircleDashed className="h-3 w-3" />,
  missed:  <MinusCircle className="h-3 w-3" />,
  extra:   <Plus className="h-3 w-3" />,
} as const;

const TONES: Record<string, string> = {
  done:    "text-green-400",
  partial: "text-yellow-400",
  missed:  "text-surface-500",
  extra:   "text-cyan-400",
};

export function DayState({ progress, className = "" }: { progress: DayProgress; className?: string }) {
  if (!progress.label) return null;
  const icon = ICONS[progress.state as keyof typeof ICONS];
  if (!icon) return null;

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${TONES[progress.state] ?? "text-surface-500"} ${className}`}>
      {icon}
      {progress.label}
    </span>
  );
}
