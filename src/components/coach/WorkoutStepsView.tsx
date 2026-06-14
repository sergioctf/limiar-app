"use client";

import { useState } from "react";
import { Flame, Wind, Snowflake, Repeat2, Watch, Loader2, Check, Footprints } from "lucide-react";
import { isRepeatBlock } from "@/types";
import type { StructuredWorkout, WorkoutStep, WorkoutStepKind } from "@/types";

interface Props {
  structure: StructuredWorkout;
  label: string;       // workout name, e.g. "Tiro 800m"
}

const KIND_UI: Record<WorkoutStepKind, { icon: React.ReactNode; label: string; color: string; bar: string }> = {
  warmup:   { icon: <Wind className="w-3.5 h-3.5" />,      label: "Aquecimento",    color: "text-blue-300",   bar: "bg-blue-500/60" },
  run:      { icon: <Flame className="w-3.5 h-3.5" />,     label: "Forte",          color: "text-brand-300",  bar: "bg-brand-500" },
  recovery: { icon: <Footprints className="w-3.5 h-3.5" />,label: "Recuperação",    color: "text-green-300",  bar: "bg-green-500/60" },
  cooldown: { icon: <Snowflake className="w-3.5 h-3.5" />, label: "Desaquecimento", color: "text-cyan-300",   bar: "bg-cyan-500/60" },
};

function stepAmount(s: WorkoutStep): string {
  if (s.distance_km != null) return s.distance_km >= 1 ? `${s.distance_km}km` : `${Math.round(s.distance_km * 1000)}m`;
  if (s.duration_min != null) return `${s.duration_min}min`;
  return "—";
}

function StepRow({ step, indent = false }: { step: WorkoutStep; indent?: boolean }) {
  const ui = KIND_UI[step.kind] ?? KIND_UI.run;
  return (
    <div className={`flex items-center gap-2.5 py-1.5 ${indent ? "pl-6" : ""}`}>
      <span className={`w-1 self-stretch rounded-full ${ui.bar} shrink-0`} />
      <span className={`${ui.color} shrink-0`}>{ui.icon}</span>
      <span className="font-mono font-bold text-xs text-surface-200 tabular-nums w-14 shrink-0">{stepAmount(step)}</span>
      <span className="text-xs text-surface-400 flex-1 min-w-0 truncate">
        {ui.label}{step.pace ? ` · ${step.pace}` : ""}{step.note ? ` — ${step.note}` : ""}
      </span>
    </div>
  );
}

export function WorkoutStepsView({ structure, label }: Props) {
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!structure?.blocks?.length) return null;

  async function exportFit() {
    setExporting(true); setError(null);
    try {
      const res = await fetch("/api/workouts/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, structure }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Falha no export");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.fit`;
      a.click();
      URL.revokeObjectURL(url);
      setExported(true);
      setTimeout(() => setExported(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no export");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="bg-surface-800/60 border border-surface-700 rounded-xl p-3 mt-1">
      <p className="text-[10px] text-surface-500 uppercase tracking-wide mb-1.5">Estrutura do treino</p>

      <div className="space-y-0.5">
        {structure.blocks.map((block, i) =>
          isRepeatBlock(block) ? (
            <div key={i} className="rounded-lg bg-surface-700/30 py-1 my-1">
              <div className="flex items-center gap-1.5 pl-2 py-0.5">
                <Repeat2 className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs font-bold text-yellow-300">{block.repeat}×</span>
              </div>
              {block.steps.map((s, j) => <StepRow key={j} step={s} indent />)}
            </div>
          ) : (
            <StepRow key={i} step={block} />
          )
        )}
      </div>

      <button
        onClick={exportFit}
        disabled={exporting}
        className="mt-2.5 w-full flex items-center justify-center gap-2 text-xs font-semibold rounded-lg py-2 bg-surface-700 text-surface-300 hover:text-brand-300 hover:bg-surface-600 transition-colors active:scale-[0.99]"
      >
        {exporting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando…</>
          : exported ? <><Check className="w-3.5 h-3.5 text-green-400" /> Baixado!</>
          : <><Watch className="w-3.5 h-3.5" /> Enviar pro relógio (.FIT)</>}
      </button>
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
      <p className="text-[9px] text-surface-600 mt-1.5 leading-relaxed">
        Garmin: importe em Connect → Treinos. Coros/Zepp: importe no app. O relógio te guia passo a passo com alertas de ritmo.
      </p>
    </div>
  );
}
