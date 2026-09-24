"use client";

import { useState } from "react";
import { Timer, Repeat2, Flame, ClipboardList, TrendingDown, Replace } from "lucide-react";
import { StrengthLogger } from "@/components/coach/StrengthLogger";
import { ExerciseImage } from "@/components/coach/ExerciseImage";
import { ExerciseSwap } from "@/components/coach/ExerciseSwap";
import { exerciseById } from "@/lib/exercises";
import type { StrengthSession } from "@/lib/strength-builder";
import type { CardioSession } from "@/lib/cardio-builder";
import type { DayKey } from "@/types";
import { localDateStr } from "@/lib/week";

/** What the swap endpoint hands back — enough to redraw the row. */
interface SwapResult {
  exerciseId: string;
  name:       string;
  cue:        string;
  unilateral: boolean;
}

/**
 * The prescribed lifting session: what to do, how many sets, in what rep range,
 * how close to failure (RIR) and how long to rest — the numbers you check
 * between sets.
 */
export function StrengthSessionView({ session, date, day, weekStart }: {
  session: StrengthSession;
  /** Day this session belongs to (YYYY-MM-DD), for logging. */
  date?: string;
  /** Which weekday, so a swap can be persisted to the right session. */
  day?: DayKey;
  /** Monday of the week this plan belongs to (YYYY-MM-DD). */
  weekStart?: string;
}) {
  const [logging, setLogging] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  /**
   * Swaps applied here, keyed by the exercise they replaced.
   *
   * Held locally as well as saved because the plan arrives as a prop from a
   * parent that will not refetch: without this the athlete taps, the server
   * agrees, and the screen keeps showing the machine that was occupied.
   */
  const [swapped, setSwapped] = useState<Record<string, SwapResult>>({});

  if (session.exercises.length === 0) return null;

  const canSwap = Boolean(day && weekStart);

  async function applySwap(fromId: string, toId: string) {
    if (!day || !weekStart) return;
    setSaving(true);
    setSwapError(null);
    try {
      const res = await fetch("/api/strength/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, day, fromId, toId }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setSwapError(d?.error ?? "Não foi possível trocar.");
        return;
      }
      setSwapped(prev => ({ ...prev, [fromId]: d.exercise as SwapResult }));
      setSwapping(null);
    } catch {
      setSwapError("Falha na conexão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    /*
      Só a sessão.

      Este bloco abria com "Sessão de força · ~51 min", repetindo o que o card
      acima já diz, e fechava com dois parágrafos cinzas — as notas do gerador
      e a explicação do que é RIR — mais uma linha de dica embaixo de cada
      exercício. Quatro textos pequenos em volta dos números que alguém procura
      entre duas séries. "Estão sujando muito a tela" (Sérgio, 26/09).

      O que ficou é o que se usa de pé na academia: o exercício, as séries, a
      carga em reserva, o descanso e o botão de registrar. O significado do RIR
      está no `title` da própria etiqueta.
    */
    <div className="bg-surface-800/60 border border-surface-700 rounded-xl p-3 mt-1 space-y-2.5">
      {/*
        A deload week cuts sets by design. Left as a grey footnote under the
        exercise list, that reads as the plan losing volume for no reason — so
        it goes above the sets it explains, not below them.
      */}
      {session.deloaded && (
        <div className="bg-blue-500/10 border border-blue-500/25 rounded-lg p-2.5 flex items-start gap-2">
          <TrendingDown className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-blue-300">Semana de volume reduzido</p>
            <p className="text-[10px] text-surface-400 leading-snug mt-0.5">
              Menos séries é o objetivo desta semana, não uma falha do plano.
              Mantenha a carga e ganhe a adaptação do bloco descansando.
            </p>
          </div>
        </div>
      )}

      {/* Cardio before the lifting */}
      {session.cardio?.position === "antes" && <CardioRow cardio={session.cardio} session={session.cardioSession} />}

      <div className="space-y-1.5">
        {session.exercises.map((prescribed, i) => {
          // What is on screen: the swap if there was one, otherwise the plan.
          const swap = swapped[prescribed.exerciseId];
          const ex = swap
            ? { ...prescribed, exerciseId: swap.exerciseId, name: swap.name, cue: swap.cue, unilateral: swap.unilateral }
            : prescribed;

          return (
          <div key={prescribed.exerciseId} className="py-1.5 border-b border-surface-700/40 last:border-0 space-y-2">
            <div className="flex gap-2.5">
            <span className={`w-1 self-stretch rounded-full shrink-0 ${
              ex.main ? "bg-brand-500" : "bg-surface-600"
            }`} />
            <span className="text-[10px] font-mono text-surface-500 w-4 shrink-0 pt-0.5">{i + 1}</span>
            {/* A photo answers "which movement is this?" faster than any cue. */}
            <ExerciseImage
              exercise={{ name: ex.name, image: exerciseById(ex.exerciseId)?.image, exerciseId: ex.exerciseId }}
              size="sm"
              zoomable
            />

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-surface-200">
                {ex.name}
                {ex.unilateral && <span className="text-[10px] text-surface-500 font-normal"> · cada lado</span>}
                {ex.main && <span className="text-[10px] text-brand-400 font-normal"> · principal</span>}
                {swap && <span className="text-[10px] text-surface-500 font-normal"> · trocado</span>}
              </p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                <span className="font-mono text-xs text-surface-100">
                  {ex.sets} × {ex.timeBased
                    ? `${ex.reps[0]}-${ex.reps[1]}s`
                    : ex.reps[0] === ex.reps[1] ? ex.reps[0] : `${ex.reps[0]}-${ex.reps[1]}`}
                </span>
                <span
                  className="text-[11px] text-surface-400 flex items-center gap-1"
                  title="Repetições em reserva: quantas você ainda conseguiria fazer ao parar a série."
                >
                  <Flame className="w-3 h-3 text-orange-400" /> RIR {ex.rir}
                </span>
                <span className="text-[11px] text-surface-500 flex items-center gap-1">
                  <Repeat2 className="w-3 h-3" /> {ex.restSeconds}s
                </span>
              </div>
            </div>

            {canSwap && (
              <button
                onClick={() => setSwapping(s => s === prescribed.exerciseId ? null : prescribed.exerciseId)}
                aria-label={`Trocar ${ex.name}`}
                className="shrink-0 text-surface-500 hover:text-brand-300 min-h-[44px] min-w-[36px] flex items-center justify-center"
              >
                <Replace className="w-3.5 h-3.5" />
              </button>
            )}
            </div>

            {swapping === prescribed.exerciseId && (
              <ExerciseSwap
                exerciseId={ex.exerciseId}
                exclude={session.exercises.map(e => swapped[e.exerciseId]?.exerciseId ?? e.exerciseId)}
                saving={saving}
                onPick={id => applySwap(prescribed.exerciseId, id)}
                onCancel={() => setSwapping(null)}
              />
            )}
          </div>
          );
        })}
      </div>

      {swapError && <p className="text-[11px] text-red-400">{swapError}</p>}

      {/* Cardio after the lifting */}
      {session.cardio?.position === "depois" && <CardioRow cardio={session.cardio} session={session.cardioSession} />}

      <button
        onClick={() => setLogging(true)}
        className="w-full flex items-center justify-center gap-2 text-xs font-semibold rounded-lg py-2 bg-surface-700 text-surface-300 hover:text-brand-300 hover:bg-surface-600 transition-colors active:scale-[0.99]"
      >
        <ClipboardList className="w-3.5 h-3.5" /> Registrar treino
      </button>

      {logging && (
        <StrengthLogger
          session={session}
          date={date ?? localDateStr()}
          onClose={() => setLogging(false)}
        />
      )}
    </div>
  );
}

function CardioRow({ cardio, session }: {
  cardio: NonNullable<StrengthSession["cardio"]>;
  session?: CardioSession | null;
}) {
  // Without a structured session, fall back to the bare summary line.
  if (!session) {
    return (
      <div className="flex items-center gap-2.5 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2.5 py-2">
        <Timer className="w-3.5 h-3.5 text-orange-400 shrink-0" />
        <p className="text-[11px] text-surface-300">
          <span className="font-semibold capitalize">{cardio.machine}</span> · {cardio.minutes} min
          <span className="text-surface-500"> ({cardio.position} do treino)</span>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <Timer className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-surface-200 capitalize">
            {session.machine} · {session.minutes} min
            <span className="text-surface-500 font-normal"> ({session.position} do treino)</span>
          </p>
          <p className="text-[10px] text-surface-400 leading-snug mt-0.5">{session.purpose}</p>
        </div>
      </div>

      <div className="space-y-1">
        {session.blocks.map((b, i) => (
          <div key={i} className="flex gap-2 text-[10px] items-start">
            <span className="font-mono text-surface-300 w-11 shrink-0">{b.minutes} min</span>
            <div className="min-w-0">
              <p className="text-surface-200">
                {b.label}
                {b.setting && <span className="text-surface-500"> · {b.setting}</span>}
                {b.hr && (
                  <span className="text-surface-400 font-mono"> · {b.hr.min}-{b.hr.max} bpm
                    <span className="text-surface-500"> {b.hr.zone}</span>
                  </span>
                )}
              </p>
              {b.note && <p className="text-surface-500 leading-snug">{b.note}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
