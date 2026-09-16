"use client";

import { useEffect, useState } from "react";
import { X, Dumbbell, Info } from "lucide-react";
import {
  exerciseFrames, MUSCLE_LABEL, EQUIPMENT_LABEL, type Exercise,
} from "@/lib/exercises";

const CATEGORY_LABEL: Record<Exercise["category"], string> = {
  composto: "Composto",
  unilateral: "Unilateral",
  isolado: "Isolado",
  pliometrico: "Pliométrico",
  core: "Core",
};

/**
 * Full-size look at a movement: both frames, muscles, kit, and the cue.
 *
 * A 44px thumbnail answers "is this the one I think it is?" and nothing more.
 * When the answer is no — which is the normal case while browsing 240 movements
 * the athlete has never done — they need to actually see the position.
 *
 * Two frames rather than one because start and end are different exercises to
 * the eye: a lat pulldown at the top and at the bottom look like separate
 * movements, and either one alone can mislead.
 */
export function ExerciseDetail({
  exercise, onClose,
}: {
  exercise: Pick<Exercise, "name" | "primary" | "secondary" | "equipment" | "category" | "reps" | "unilateral"> &
            Partial<Pick<Exercise, "cue" | "image">>;
  onClose: () => void;
}) {
  const frames = exerciseFrames(exercise);
  const [broken, setBroken] = useState<Record<number, boolean>>({});

  // Escape closes it — this opens on top of the logger, which is itself a modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = frames.filter((_, i) => !broken[i]);
  const timeBased = exercise.reps[1] > 30;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-sm overlay-safe"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-4 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-surface-100 text-sm leading-snug">{exercise.name}</h3>
            <p className="text-[11px] text-surface-500 mt-0.5">
              {exercise.primary.map(m => MUSCLE_LABEL[m]).join(" · ")}
              {exercise.secondary.length > 0 && (
                <span className="text-surface-500">
                  {" "}(+ {exercise.secondary.map(m => MUSCLE_LABEL[m]).join(", ")})
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar"
            className="text-surface-500 hover:text-surface-300 p-1 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {visible.length > 0 ? (
          <div className={`grid gap-2 ${visible.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {frames.map((url, i) => broken[i] ? null : (
              <figure key={url} className="space-y-1">
                <div className="rounded-lg overflow-hidden bg-surface-800 aspect-[4/3]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`${exercise.name} — ${i === 0 ? "início" : "fim"}`}
                    loading="lazy"
                    onError={() => setBroken(b => ({ ...b, [i]: true }))}
                    className="w-full h-full object-cover"
                  />
                </div>
                <figcaption className="text-[10px] text-surface-500 uppercase tracking-wide text-center">
                  {i === 0 ? "Início" : "Fim"}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-surface-800 aspect-[4/3] flex flex-col items-center justify-center gap-2">
            <Dumbbell className="w-8 h-8 text-surface-500" />
            <p className="text-[11px] text-surface-500">Sem foto para este exercício</p>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Badge>{CATEGORY_LABEL[exercise.category]}</Badge>
          <Badge>{EQUIPMENT_LABEL[exercise.equipment]}</Badge>
          <Badge>
            {timeBased
              ? `${exercise.reps[0]}-${exercise.reps[1]}s`
              : `${exercise.reps[0]}-${exercise.reps[1]} reps`}
          </Badge>
          {exercise.unilateral && <Badge>Cada lado</Badge>}
        </div>

        {/* Only the curated list has a cue; imported entries carry no coaching. */}
        {exercise.cue && (
          <p className="text-[11px] text-surface-400 leading-relaxed flex items-start gap-1.5 bg-surface-700/30 rounded-lg p-2.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-400" />
            {exercise.cue}
          </p>
        )}
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-700/60 text-surface-400">
      {children}
    </span>
  );
}
