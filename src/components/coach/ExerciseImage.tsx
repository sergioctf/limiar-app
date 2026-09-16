"use client";

import { useState } from "react";
import { Dumbbell, Maximize2 } from "lucide-react";
import { exerciseImageUrl, exerciseById, type Exercise } from "@/lib/exercises";
import { ExerciseDetail } from "./ExerciseDetail";

/** What the thumbnail needs; the detail view fills the rest from the id. */
type Thumb = { name: string; image?: string; exerciseId?: string };

/**
 * Demonstration photo for an exercise, with a fallback that is not a broken
 * image icon.
 *
 * Two things can go wrong and both are normal: the exercise has no photo (a
 * couple of the curated movements have no upstream equivalent), or the CDN is
 * unreachable (offline, blocked network). Either way the athlete should see a
 * placeholder the same size as the photo, so the layout does not jump.
 *
 * Deliberately a plain <img>: these are fixed-size thumbnails served from a
 * CDN that already handles caching, so routing them through the Next optimiser
 * would add a hop and a domain allowlist for no gain.
 */
export function ExerciseImage({
  exercise, size = "sm", zoomable = false, eager = false, className = "",
}: {
  exercise: Thumb | undefined;
  size?: "sm" | "md" | "lg";
  /**
   * Load immediately instead of on scroll.
   *
   * Lazy is right for the 277-entry picker and wrong for a showcase: inside the
   * onboarding overlay the intersection observer never fired, so the scene that
   * exists to sell the illustrated catalogue rendered four grey placeholders.
   */
  eager?: boolean;
  /**
   * Renders as a button that opens the full-size view. Off by default because
   * several call sites nest the thumbnail inside a button already, and a button
   * inside a button is invalid markup that breaks taps on iOS.
   */
  zoomable?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const url = exerciseImageUrl(exercise);

  const box = { sm: "w-11 h-11", md: "w-16 h-16", lg: "w-full aspect-[4/3]" }[size];
  const shell = `${box} rounded-lg overflow-hidden bg-surface-800 shrink-0 ${className}`;

  const inner = !url || failed ? (
    <div className={`${shell} flex items-center justify-center`}>
      <Dumbbell className="w-1/3 h-1/3 text-surface-500" />
    </div>
  ) : (
    <div className={`${shell} relative group`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={exercise?.name ?? ""}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
      {zoomable && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 className="w-3.5 h-3.5 text-white" />
        </span>
      )}
    </div>
  );

  if (!zoomable) return inner;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ver ${exercise?.name ?? "exercício"} em detalhe`}
        className="shrink-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {inner}
      </button>
      {open && <ExerciseDetail exercise={detailFor(exercise)} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The thumbnail only carries a name and a path; the detail view wants muscles,
 * kit and the cue. Resolving by id gets those without every call site having to
 * pass the whole record around.
 */
function detailFor(thumb: Thumb | undefined): React.ComponentProps<typeof ExerciseDetail>["exercise"] {
  const full = thumb?.exerciseId ? exerciseById(thumb.exerciseId) : undefined;
  if (full) return full;

  return {
    name: thumb?.name ?? "",
    image: thumb?.image,
    primary: [], secondary: [],
    equipment: "peso_corporal",
    category: "composto",
    reps: [8, 12] as Exercise["reps"],
    unilateral: false,
  };
}
