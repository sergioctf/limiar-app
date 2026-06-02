"use client";

import { useState } from "react";
import { X, Plus, Trash2, Dumbbell, Loader2 } from "lucide-react";
import { GymExercise } from "@/types";

const SPORT_OPTIONS = [
  { value: "WeightTraining", label: "Musculação" },
  { value: "Workout",        label: "Treino funcional" },
  { value: "Crossfit",       label: "CrossFit" },
  { value: "Yoga",           label: "Yoga" },
  { value: "Pilates",        label: "Pilates" },
  { value: "Swim",           label: "Natação" },
  { value: "Ride",           label: "Ciclismo / Bike" },
  { value: "Walk",           label: "Caminhada" },
  { value: "Soccer",         label: "Futebol" },
  { value: "Tennis",         label: "Tênis" },
  { value: "Other",          label: "Outro" },
];

const PRESET_EXERCISES = [
  "Supino", "Agachamento", "Leg Press", "Desenvolvimento", "Rosca",
  "Tríceps", "Remada", "Pull-down", "Stiff", "Levantamento Terra",
  "Abdominais", "Prancha", "Afundo", "Elevação Pélvica",
];

interface Props {
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function GymSessionForm({ defaultDate, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const [name,       setName]       = useState("Treino");
  const [sportType,  setSportType]  = useState("WeightTraining");
  const [date,       setDate]       = useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const [duration,   setDuration]   = useState("");      // minutes
  const [calories,   setCalories]   = useState("");
  const [hr,         setHr]         = useState("");
  const [notes,      setNotes]      = useState("");
  const [exercises,  setExercises]  = useState<GymExercise[]>([]);

  function addExercise(name?: string) {
    setExercises(prev => [...prev, { name: name ?? "", sets: undefined, reps: undefined, weight_kg: undefined }]);
  }

  function updateExercise(i: number, field: keyof GymExercise, value: string) {
    setExercises(prev => prev.map((e, idx) =>
      idx !== i ? e : {
        ...e,
        [field]: (field === "name" || field === "notes")
          ? value
          : value === "" ? undefined : Number(value),
      }
    ));
  }

  function removeExercise(i: number) {
    setExercises(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sport_type:       sportType,
          date,
          duration_seconds: duration ? parseInt(duration) * 60 : null,
          calories:         calories ? parseInt(calories) : null,
          avg_hr:           hr ? parseInt(hr) : null,
          notes:            notes || null,
          exercises:        exercises.filter(e => e.name.trim()),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erro ao salvar");
        return;
      }

      onSaved();
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }

  const isGym = sportType === "WeightTraining" || sportType === "Workout" || sportType === "Crossfit";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-surface-800 border border-surface-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-blue-400" />
            <h3 className="text-surface-100 font-bold">Registrar Atividade</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-surface-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 flex flex-col gap-4">
          {/* Type + Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-surface-400 mb-1.5">Tipo</label>
              <select
                value={sportType}
                onChange={e => setSportType(e.target.value)}
                className="w-full bg-surface-750 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-brand-500"
              >
                {SPORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1.5">Nome</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Upper Body"
                className="w-full bg-surface-750 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Date + Duration + Calories */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-surface-400 mb-1.5">Data</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-surface-750 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1.5">Duração (min)</label>
              <input
                type="number"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                placeholder="60"
                min="1"
                className="w-full bg-surface-750 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1.5">Calorias</label>
              <input
                type="number"
                value={calories}
                onChange={e => setCalories(e.target.value)}
                placeholder="400"
                min="0"
                className="w-full bg-surface-750 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* HR + Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-surface-400 mb-1.5">FC média (bpm)</label>
              <input
                type="number"
                value={hr}
                onChange={e => setHr(e.target.value)}
                placeholder="130"
                min="40" max="220"
                className="w-full bg-surface-750 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1.5">Observações</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Como foi..."
                className="w-full bg-surface-750 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Exercises (only for gym types) */}
          {isGym && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-surface-400">Exercícios</label>
                <button
                  type="button"
                  onClick={() => addExercise()}
                  className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Adicionar
                </button>
              </div>

              {/* Quick presets */}
              {exercises.length === 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PRESET_EXERCISES.slice(0, 8).map(ex => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => addExercise(ex)}
                      className="text-[11px] bg-surface-700 hover:bg-surface-600 text-surface-300 px-2 py-1 rounded-md transition-colors"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2">
                {exercises.map((ex, i) => (
                  <div key={i} className="flex items-center gap-2 bg-surface-750 border border-surface-700 rounded-lg p-2">
                    <input
                      value={ex.name}
                      onChange={e => updateExercise(i, "name", e.target.value)}
                      placeholder="Exercício"
                      className="flex-1 bg-transparent text-sm text-surface-100 placeholder-surface-600 focus:outline-none"
                    />
                    <input
                      type="number"
                      value={ex.sets ?? ""}
                      onChange={e => updateExercise(i, "sets", e.target.value)}
                      placeholder="Séries"
                      min="1"
                      className="w-14 bg-transparent text-sm text-surface-300 placeholder-surface-600 text-center focus:outline-none"
                    />
                    <span className="text-surface-600 text-xs">×</span>
                    <input
                      type="number"
                      value={ex.reps ?? ""}
                      onChange={e => updateExercise(i, "reps", e.target.value)}
                      placeholder="Reps"
                      min="1"
                      className="w-12 bg-transparent text-sm text-surface-300 placeholder-surface-600 text-center focus:outline-none"
                    />
                    <span className="text-surface-600 text-xs">@</span>
                    <input
                      type="number"
                      value={ex.weight_kg ?? ""}
                      onChange={e => updateExercise(i, "weight_kg", e.target.value)}
                      placeholder="kg"
                      min="0"
                      step="0.5"
                      className="w-12 bg-transparent text-sm text-surface-300 placeholder-surface-600 text-center focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeExercise(i)}
                      className="p-1 text-surface-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-surface-700">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-300 rounded-xl text-sm font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
