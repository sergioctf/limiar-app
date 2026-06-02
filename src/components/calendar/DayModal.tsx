"use client";

import { X, Plus, Trash2, Clock, Flame, Heart, Route, Dumbbell } from "lucide-react";
import { CalendarEntry } from "@/types";
import { sportColor, sportLabel } from "./ActivityCalendar";
import { cn } from "@/lib/utils";

function formatPace(sec: number | null | undefined) {
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function formatDur(sec: number | null | undefined) {
  if (!sec) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

const DAY_PT: Record<number, string> = {
  0:"Domingo",1:"Segunda",2:"Terça",3:"Quarta",4:"Quinta",5:"Sexta",6:"Sábado"
};
const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

interface Props {
  date: string;
  entries: CalendarEntry[];
  onClose: () => void;
  onAddGym: () => void;
  onDelete: (id: string, sportType: string) => Promise<void>;
}

export function DayModal({ date, entries, onClose, onAddGym, onDelete }: Props) {
  const d = new Date(date + "T12:00:00");
  const label = `${DAY_PT[d.getDay()]}, ${d.getDate()} de ${MONTHS_PT[d.getMonth()]} de ${d.getFullYear()}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-800 border border-surface-700 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div>
            <p className="text-surface-500 text-xs">{label}</p>
            <h3 className="text-surface-100 font-bold text-lg mt-0.5">
              {entries.length} atividade{entries.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onAddGym}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-lg text-sm font-medium hover:bg-blue-500/25 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Academia
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-surface-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Activity list */}
        <div className="overflow-y-auto p-4 flex flex-col gap-3">
          {entries.map((e) => (
            <div key={e.id} className="bg-surface-750 border border-surface-700 rounded-xl p-4 relative group">
              {/* Type badge */}
              <div className="flex items-center gap-2 mb-2">
                <span className={cn("w-2.5 h-2.5 rounded-full", sportColor(e.sport_type))} />
                <span className="text-xs font-semibold text-surface-400 uppercase tracking-wide">
                  {sportLabel(e.sport_type)}
                </span>
                {e.source === "strava" && (
                  <span className="text-[10px] text-surface-600 ml-auto">Strava</span>
                )}
              </div>

              <p className="text-surface-100 font-semibold text-sm mb-3">{e.name}</p>

              {/* Metrics */}
              <div className="flex flex-wrap gap-3 text-xs text-surface-400">
                {formatDur(e.duration_seconds) && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDur(e.duration_seconds)}
                  </span>
                )}
                {e.distance_km && e.distance_km > 0 && (
                  <span className="flex items-center gap-1">
                    <Route className="w-3 h-3" />
                    {e.distance_km.toFixed(2)} km
                  </span>
                )}
                {e.avg_pace_seconds_per_km && (
                  <span className="flex items-center gap-1">
                    <span className="text-[10px]">⚡</span>
                    {formatPace(e.avg_pace_seconds_per_km)}
                  </span>
                )}
                {e.avg_hr && (
                  <span className="flex items-center gap-1">
                    <Heart className="w-3 h-3 text-red-400" />
                    {e.avg_hr} bpm
                  </span>
                )}
                {e.calories && (
                  <span className="flex items-center gap-1">
                    <Flame className="w-3 h-3 text-orange-400" />
                    {e.calories} kcal
                  </span>
                )}
              </div>

              {/* Gym exercises */}
              {e.exercises && e.exercises.length > 0 && (
                <div className="mt-3 pt-3 border-t border-surface-700">
                  <p className="text-xs text-surface-500 mb-2 flex items-center gap-1">
                    <Dumbbell className="w-3 h-3" /> Exercícios
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {e.exercises.map((ex, i) => (
                      <span key={i} className="text-xs bg-surface-700 text-surface-300 px-2 py-0.5 rounded-md">
                        {ex.name}
                        {ex.sets && ex.reps ? ` ${ex.sets}×${ex.reps}` : ""}
                        {ex.weight_kg ? ` @ ${ex.weight_kg}kg` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Delete button (only for manual activities) */}
              {e.source === "manual" && (
                <button
                  onClick={async () => {
                    if (confirm("Remover esta atividade?")) {
                      await onDelete(e.id, e.sport_type);
                    }
                  }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-surface-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
