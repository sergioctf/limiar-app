"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Flame, Wind, Snowflake, Repeat2, Watch, Loader2, Check, Footprints, Heart,
  AlertCircle, Download,
} from "lucide-react";
import { isRepeatBlock } from "@/types";
import { expandToKmSplits } from "@/lib/workout-builder";
import { haptic } from "@/lib/haptics";
import type { SportKey } from "@/lib/sports";
import type { StructuredWorkout, WeeklyPlanDay, WorkoutStep, WorkoutStepKind } from "@/types";

interface Props {
  structure: StructuredWorkout;
  label: string;       // workout name, e.g. "Tiro 800m"
  /** Drives the sport recorded in the .FIT file and which target type it uses. */
  sport?: SportKey;
  /**
   * A sessão e a semana dela — o que falta para mandar ao relógio.
   *
   * Sem as duas só sobra o arquivo: um treino sem semana e dia não tem onde
   * pousar no calendário, nem como ser substituído sem duplicar.
   */
  session?: WeeklyPlanDay;
  weekStart?: string;
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
    <div className={`flex items-start gap-2.5 py-1.5 ${indent ? "pl-6" : ""}`}>
      <span className={`w-1 self-stretch rounded-full ${ui.bar} shrink-0`} />
      <span className={`${ui.color} shrink-0 mt-0.5`}>{ui.icon}</span>
      <span className="font-mono font-bold text-xs text-surface-200 tabular-nums w-14 shrink-0 mt-0.5">
        {stepAmount(step)}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-surface-300">
          {segmentLabel(step.kind, step.intensity)}
          {step.pace && <span className="font-mono text-surface-200"> · {step.pace}</span>}
          {step.hr && (
            <span className="text-surface-400">
              {" · "}<Heart className="w-3 h-3 inline -mt-0.5 text-red-400" />{" "}
              <span className="font-mono">{step.hr.min}–{step.hr.max}</span>
              <span className="text-[10px] text-surface-500"> {step.hr.zone}</span>
            </span>
          )}
        </p>
        {step.note && <p className="text-[10px] text-surface-500 leading-snug mt-0.5">{step.note}</p>}
      </div>
    </div>
  );
}

/** What each Daniels intensity means, in plain words. */
const INTENSITY_INFO: Record<string, { name: string; feel: string }> = {
  E: { name: "Fácil",     feel: "dá pra conversar frases inteiras" },
  M: { name: "Maratona",  feel: "confortável mas exigente" },
  T: { name: "Limiar",    feel: "forte e controlado, ~1h de prova" },
  I: { name: "VO₂max",    feel: "muito forte, ~10-12 min de prova" },
  R: { name: "Velocidade", feel: "quase máximo, tiros curtos" },
};

/**
 * Label for a segment. Warm-up/recovery/cool-down speak for themselves; a plain
 * "run" takes its name from the intensity — calling an easy jog "Forte" because
 * the step kind is `run` is just wrong.
 */
function segmentLabel(kind: WorkoutStepKind, intensity?: string): string {
  if (kind === "warmup")   return "Aquecimento";
  if (kind === "cooldown") return "Desaquecimento";
  if (kind === "recovery") return "Trote de recuperação";
  switch (intensity) {
    case "E": return "Rodagem";
    case "M": return "Ritmo de prova";
    case "T": return "Limiar";
    case "I": return "Tiro forte";
    case "R": return "Velocidade";
    default:  return "Corrida";
  }
}

/**
 * Kilometre-by-kilometre table. Each row says what that km is for (warm-up,
 * hard, recovery, cool-down), the target pace range and the ideal heart-rate
 * window — the numbers you actually look at mid-workout.
 */
function KmTable({ structure }: { structure: StructuredWorkout }) {
  const splits = expandToKmSplits(structure);
  if (splits.length === 0) {
    return <p className="text-xs text-surface-500 py-2">Sem distância definida para detalhar por km.</p>;
  }

  const hasPace = splits.some(s => s.paceLabel && s.paceLabel !== "—");
  const hasHr   = splits.some(s => s.hr);
  const usedIntensities = Array.from(
    new Set(splits.map(s => s.intensity).filter(Boolean) as string[]),
  );

  return (
    <div className="space-y-2">
      {/* Paces and heart-rate ranges come from the 3 km test only — never
          estimated, so the athlete can always trust the numbers on screen. */}
      {(!hasPace || !hasHr) && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-surface-300 leading-relaxed">
            {!hasPace ? (
              <>
                <strong>Ritmos e FC liberados após o teste de 3 km.</strong>{" "}
                Preferimos não estimar: um número chutado parece tão confiável quanto um
                medido, e você não teria como saber a diferença. Faça o teste em
                <span className="text-surface-200"> Treinador → Testes 3km</span> e regenere o plano.
              </>
            ) : (
              <>
                <strong>Faltam as faixas de FC.</strong>{" "}
                Seu teste de 3 km não tem frequência cardíaca média registrada —
                adicione-a no teste e regenere o plano para desbloquear as zonas.
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1 max-h-80 overflow-y-auto">
        {splits.map(s => {
          const ui = KIND_UI[s.kind] ?? KIND_UI.run;
          const info = s.intensity ? INTENSITY_INFO[s.intensity] : undefined;
          return (
            <div key={s.km} className="flex gap-2.5 py-1.5 border-b border-surface-700/40 last:border-0">
              <span className={`w-1 self-stretch rounded-full ${ui.bar} shrink-0`} />
              <span className="font-mono font-bold text-xs text-surface-300 tabular-nums w-11 shrink-0 pt-0.5">
                km {s.km}
              </span>

              <div className="flex-1 min-w-0">
                {/* What this km is for */}
                <p className={`text-[11px] font-semibold ${ui.color}`}>
                  {segmentLabel(s.kind, s.intensity)}
                  {info && <span className="text-surface-500 font-normal"> · {info.name}</span>}
                </p>

                {/* The numbers */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="font-mono text-xs text-surface-100">
                    {s.paceLabel && s.paceLabel !== "—" ? s.paceLabel : "ritmo —"}
                  </span>
                  {s.hr ? (
                    <span className="font-mono text-[11px] text-surface-300 flex items-center gap-1">
                      <Heart className="w-3 h-3 text-red-400" />
                      {s.hr.min}–{s.hr.max} bpm
                      <span className="text-[10px] text-surface-500">{s.hr.zone}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-surface-500">FC —</span>
                  )}
                </div>

                {(s.note || info) && (
                  <p className="text-[10px] text-surface-500 leading-snug mt-0.5">
                    {s.note ?? info?.feel}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend — so E / I / T aren't cryptic */}
      {usedIntensities.length > 0 && (
        <div className="pt-2 border-t border-surface-700/50">
          <p className="text-[10px] uppercase tracking-wide text-surface-500 mb-1">Intensidades neste treino</p>
          <div className="space-y-0.5">
            {usedIntensities.map(i => (
              <p key={i} className="text-[10px] text-surface-500">
                <span className="font-bold text-surface-400">{i}</span> = {INTENSITY_INFO[i]?.name}
                {INTENSITY_INFO[i] && <span className="text-surface-500"> — {INTENSITY_INFO[i].feel}</span>}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkoutStepsView({
  structure, label, sport = "corrida", session, weekStart,
}: Props) {
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"steps" | "km">("steps");

  /*
    O envio de verdade.

    O `.FIT` baixado nunca chegou a relógio nenhum: o Garmin Connect do celular
    não importa treino de arquivo, e era lá que o atleta estava quando tocava o
    botão (Sérgio, 13/10). Agora o treino vai para o calendário do intervals.icu
    e de lá para o relógio — ver `src/lib/icu-workout.ts`. O arquivo continua
    disponível, um nível abaixo, para quem está no computador.
  */
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState(false);
  const [precisaConectar, setPrecisaConectar] = useState(false);
  const podeEnviar = Boolean(session && weekStart);

  async function enviarAoRelogio() {
    setPushing(true); setError(null); setPrecisaConectar(false);
    try {
      const res = await fetch("/api/workouts/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, day: session?.day, session }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setPrecisaConectar(d?.needsConnection === true);
        throw new Error(d?.error ?? "Não consegui enviar o treino.");
      }
      haptic("success");
      setPushed(true);
      setTimeout(() => setPushed(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui enviar o treino.");
    } finally {
      setPushing(false);
    }
  }

  if (!structure?.blocks?.length) return null;

  async function exportFit() {
    setExporting(true); setError(null);
    try {
      const res = await fetch("/api/workouts/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, structure, sport }),
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
      {/* View switcher */}
      <div className="flex gap-1 bg-surface-700/50 rounded-lg p-0.5 mb-2">
        {([["steps", "Estrutura"], ["km", "Km a km"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex-1 min-h-[44px] py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-colors ${
              view === key ? "bg-surface-600 text-surface-100" : "text-surface-500 hover:text-surface-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "steps" ? (
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
      ) : (
        <KmTable structure={structure} />
      )}

      {podeEnviar && (
        <button
          onClick={enviarAoRelogio}
          disabled={pushing}
          className="btn-primary mt-2.5 min-h-[48px] w-full justify-center"
        >
          {pushing ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
            : pushed ? <><Check className="h-4 w-4" /> No seu relógio</>
            : <><Watch className="h-4 w-4" /> Enviar pro relógio</>}
        </button>
      )}

      {pushed && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-surface-500">
          Está no seu calendário do intervals.icu e segue para o relógio na próxima
          sincronização. No Garmin, abra o Connect uma vez para apressar.
        </p>
      )}

      {error && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-red-400">
          {error}
          {precisaConectar && (
            <>
              {" "}
              <Link href="/settings" className="underline hover:text-red-300">Abrir Configurações</Link>
            </>
          )}
        </p>
      )}

      {/* O arquivo continua aqui, um nível abaixo: serve para quem está no
          computador, ou para relógio que não fala com o intervals.icu. */}
      <button
        onClick={exportFit}
        disabled={exporting}
        className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 text-[11px] font-medium text-surface-500 transition-colors hover:text-surface-300"
      >
        {exporting ? <><Loader2 className="h-3 w-3 animate-spin" /> Gerando…</>
          : exported ? <><Check className="h-3 w-3 text-green-400" /> Arquivo baixado</>
          : <><Download className="h-3 w-3" /> Baixar .FIT para importar à mão</>}
      </button>
    </div>
  );
}
