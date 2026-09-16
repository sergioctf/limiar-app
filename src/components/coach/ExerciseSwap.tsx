"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Search } from "lucide-react";
import { substitutesFor, substituteReason } from "@/lib/exercise-substitute";
import { exerciseById, MUSCLE_LABEL, EQUIPMENT_LABEL, type Equipment } from "@/lib/exercises";
import { ExerciseImage } from "@/components/coach/ExerciseImage";
import { ExercisePicker } from "@/components/coach/ExercisePicker";

/**
 * "A máquina está ocupada."
 *
 * Three or four equivalents, each with a photo and one line saying why it is
 * equivalent — not a catalogue. Someone standing between the racks with a phone
 * in one hand is not browsing, and 277 options is the same as none.
 *
 * The full catalogue is one tap away for the times the answer really is
 * "something else entirely".
 */
export function ExerciseSwap({
  exerciseId, exclude, saving, onPick, onCancel,
}: {
  exerciseId: string;
  /** Ids already in the session — swapping into a duplicate helps nobody. */
  exclude: string[];
  saving?: boolean;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const [browsing, setBrowsing] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[] | null>(null);

  /**
   * Read straight from the strength preferences rather than being passed down.
   *
   * The alternative was threading it through the plan card, which has no reason
   * to know about gym equipment. Until it arrives the list is unfiltered — one
   * render with an option too many beats an empty panel.
   */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/strength-prefs")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list = d?.prefs?.equipment;
        if (!cancelled && Array.isArray(list)) setEquipment(list as Equipment[]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const options = useMemo(
    () => substitutesFor(exerciseId, { exclude, equipment, limit: 5 }),
    [exerciseId, exclude, equipment],
  );

  const original = exerciseById(exerciseId);

  if (browsing) {
    return (
      <ExercisePicker
        onPick={onPick}
        onCancel={() => setBrowsing(false)}
        exclude={[...exclude, exerciseId]}
      />
    );
  }

  return (
    <div className="bg-surface-700/30 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-surface-200">
            Trocar {original?.name ?? "exercício"}
          </p>
          {original && (
            <p className="text-[10px] text-surface-500">
              {original.primary.map(m => MUSCLE_LABEL[m]).join(", ")}
              {" · "}mesmas séries e repetições
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-surface-500" />}
          <button onClick={onCancel} aria-label="Cancelar" className="text-surface-500 hover:text-surface-300 min-h-[44px] min-w-[36px] flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {options.length === 0 ? (
        <p className="text-[11px] text-surface-500 py-2">
          Nenhum equivalente com o equipamento disponível.
        </p>
      ) : (
        <div className="space-y-1">
          {options.map(alt => (
            <button
              key={alt.id}
              onClick={() => onPick(alt.id)}
              disabled={saving}
              className="w-full flex items-center gap-2.5 p-1.5 rounded-lg text-left hover:bg-surface-700 transition-colors disabled:opacity-60"
            >
              <ExerciseImage
                exercise={{ name: alt.name, image: alt.image, exerciseId: alt.id }}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-surface-200 truncate">{alt.name}</span>
                <span className="block text-[10px] text-surface-500 truncate">
                  {substituteReason(alt, exerciseId)} {EQUIPMENT_LABEL[alt.equipment]}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setBrowsing(true)}
        className="w-full flex items-center justify-center gap-1.5 text-[11px] text-surface-400 hover:text-surface-200 min-h-[44px]"
      >
        <Search className="w-3.5 h-3.5" /> Ver o catálogo completo
      </button>
    </div>
  );
}
