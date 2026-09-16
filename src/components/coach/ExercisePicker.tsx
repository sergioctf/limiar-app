"use client";

import { useMemo, useState } from "react";
import { Search, X, Star } from "lucide-react";
import {
  allExercises, MUSCLE_LABEL, EQUIPMENT_LABEL,
  type Exercise, type MuscleGroup, type Equipment,
} from "@/lib/exercises";
import { ExerciseImage } from "./ExerciseImage";

const MUSCLES = Object.keys(MUSCLE_LABEL) as MuscleGroup[];
const EQUIPMENT = Object.keys(EQUIPMENT_LABEL) as Equipment[];

/** Short labels — the full ones ("Academia completa") do not fit a filter chip. */
const EQUIPMENT_CHIP: Record<Equipment, string> = {
  peso_corporal: "Peso corporal",
  elasticos: "Elástico",
  halteres: "Halteres",
  academia: "Academia",
};

/**
 * Searchable exercise catalogue — ~280 movements, each with a photo.
 *
 * Two filters rather than one long list, because the two questions an athlete
 * actually asks at the rack are "what else hits chest?" and "what can I do with
 * only dumbbells?". Typing is the third path, not the only one.
 *
 * Curated exercises sort first and carry a star. They are the ones the coach
 * would have chosen anyway, and burying them under 240 imported alternatives
 * would quietly make the catalogue a downgrade.
 */
export function ExercisePicker({
  onPick, onCancel, exclude = [],
}: {
  onPick: (id: string) => void;
  onCancel: () => void;
  /** Ids already in the session — showing them again just invites a no-op tap. */
  exclude?: string[];
}) {
  const [search, setSearch] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const taken = new Set(exclude);

    return allExercises()
      .filter(e => !taken.has(e.id))
      .filter(e => !muscle || e.primary.includes(muscle) || e.secondary.includes(muscle))
      .filter(e => !equipment || e.equipment === equipment)
      .filter(e => !q
        || e.name.toLowerCase().includes(q)
        || e.primary.some(m => MUSCLE_LABEL[m].toLowerCase().includes(q)))
      .sort((a, b) =>
        // Exercises that actually train the filtered muscle come first. Without
        // this, "Bíceps" opens with barra fixa and remada — back movements that
        // merely use the biceps — and the filter reads as broken.
        primaryFirst(b, muscle) - primaryFirst(a, muscle)
        // Then the curated list, which is the one with a runner's judgement in it.
        || (b.cue ? 1 : 0) - (a.cue ? 1 : 0)
        || b.runnerValue - a.runnerValue
        || a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, 60);
  }, [search, muscle, equipment, exclude]);

  const secondaryFrom = muscle
    ? results.findIndex(e => !e.primary.includes(muscle))
    : -1;

  return (
    <div className="bg-surface-700/30 rounded-xl p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-surface-500 shrink-0" />
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar exercício ou músculo…"
          className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
        />
        <button onClick={onCancel} aria-label="Cancelar" className="text-surface-500 hover:text-surface-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      <Chips
        options={MUSCLES.map(m => [m, MUSCLE_LABEL[m]] as const)}
        selected={muscle}
        onSelect={m => setMuscle(m)}
      />
      <Chips
        options={EQUIPMENT.map(e => [e, EQUIPMENT_CHIP[e]] as const)}
        selected={equipment}
        onSelect={e => setEquipment(e)}
      />

      <div className="max-h-72 overflow-y-auto space-y-1 -mx-1 px-1">
        {results.map((e, i) => (
          <div key={e.id}>
            {/* Where the muscle stops being the point of the exercise. */}
            {i === secondaryFrom && secondaryFrom > 0 && muscle && (
              <p className="text-[10px] uppercase tracking-wide text-surface-500 px-1.5 pt-2 pb-1">
                Trabalham {MUSCLE_LABEL[muscle].toLowerCase()} de forma secundária
              </p>
            )}
            <Result exercise={e} onPick={onPick} />
          </div>
        ))}
        {results.length === 0 && (
          <p className="text-[11px] text-surface-500 px-2 py-4 text-center">
            Nenhum exercício com esses filtros.
          </p>
        )}
      </div>

      {(muscle || equipment || search.trim()) && results.length > 0 && (
        <p className="text-[10px] text-surface-500 text-center">
          {results.length === 60 ? "60+ exercícios" : `${results.length} exercício${results.length > 1 ? "s" : ""}`}
        </p>
      )}
    </div>
  );
}

/** 1 when the exercise trains the filtered muscle as its point, 0 otherwise. */
function primaryFirst(e: Exercise, muscle: MuscleGroup | null): number {
  return muscle && e.primary.includes(muscle) ? 1 : 0;
}

function Chips<T extends string>({
  options, selected, onSelect,
}: {
  options: ReadonlyArray<readonly [T, string]>;
  selected: T | null;
  onSelect: (value: T | null) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
      {options.map(([value, label]) => {
        const on = selected === value;
        return (
          <button
            key={value}
            onClick={() => onSelect(on ? null : value)}
            className={`shrink-0 text-[10px] px-2.5 min-h-[44px] py-1 rounded-full border transition-colors ${
              on
                ? "bg-brand-500/20 border-brand-500/40 text-brand-300"
                : "bg-surface-800 border-surface-700 text-surface-400 hover:text-surface-200"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The photo and the name are separate targets on purpose: browsing 240 movements
 * you have never done, "show me what this is" and "put this in my session" are
 * different intentions, and merging them means every look costs an undo.
 */
function Result({ exercise, onPick }: { exercise: Exercise; onPick: (id: string) => void }) {
  const curated = !!exercise.cue;
  return (
    <div className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-surface-700 transition-colors">
      <ExerciseImage
        exercise={{ name: exercise.name, image: exercise.image, exerciseId: exercise.id }}
        size="sm"
        zoomable
      />
      <button onClick={() => onPick(exercise.id)} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1">
          <span className="text-xs text-surface-200 truncate">{exercise.name}</span>
          {curated && <Star className="w-2.5 h-2.5 text-brand-400 fill-brand-400 shrink-0" />}
        </span>
        <span className="block text-[10px] text-surface-500 truncate">
          {exercise.primary.map(m => MUSCLE_LABEL[m]).join(", ")}
          {" · "}{EQUIPMENT_CHIP[exercise.equipment]}
        </span>
      </button>
    </div>
  );
}
