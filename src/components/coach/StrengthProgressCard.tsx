"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Loader2, ChevronDown, ChevronUp, Info } from "lucide-react";

interface ExerciseTrend {
  exerciseId: string;
  name: string;
  points: Array<{ date: string; weight: number }>;
  sessions: number;
  first: number;
  last: number;
  deltaKg: number;
  deltaPct: number;
}

interface MuscleVolume { muscle: string; label: string; perWeek: number }

/**
 * Strength progress: load per exercise over time and weekly sets per muscle.
 * Only renders once there's something logged — an empty chart teaches nothing.
 */
export function StrengthProgressCard() {
  const [exercises, setExercises] = useState<ExerciseTrend[]>([]);
  const [muscles, setMuscles] = useState<MuscleVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/strength/progress")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return;
        setExercises(d.exercises ?? []);
        setMuscles(d.muscles ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (exercises.length === 0 && muscles.length === 0) return null;

  return (
    <div className="card p-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-400" />
          <div className="text-left">
            <h3 className="font-bold text-surface-100 text-sm">Evolução na musculação</h3>
            <p className="text-[11px] text-surface-500">
              {exercises.length} exercício(s) acompanhado(s) · últimas 12 semanas
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-surface-500" /> : <ChevronDown className="w-4 h-4 text-surface-500" />}
      </button>

      {open && (
        <div className="space-y-4 mt-4">
          {/* Load per exercise */}
          {exercises.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-2">
                Carga por exercício
              </p>
              <div className="space-y-2.5">
                {exercises.map(ex => {
                  const max = Math.max(...ex.points.map(p => p.weight), 1);
                  const min = Math.min(...ex.points.map(p => p.weight));
                  const range = Math.max(max - min, 1);
                  return (
                    <div key={ex.exerciseId}>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <p className="text-xs text-surface-200 truncate">{ex.name}</p>
                        <p className="text-[11px] font-mono shrink-0">
                          <span className="text-surface-100">{ex.last} kg</span>
                          {ex.deltaKg !== 0 && (
                            <span className={ex.deltaKg > 0 ? "text-green-400" : "text-yellow-400"}>
                              {" "}{ex.deltaKg > 0 ? "+" : ""}{ex.deltaKg} kg
                            </span>
                          )}
                        </p>
                      </div>
                      {/* Sparkline */}
                      <div className="flex items-end gap-0.5 h-8">
                        {ex.points.map((p, i) => (
                          <div
                            key={i}
                            title={`${p.date}: ${p.weight} kg`}
                            className={`flex-1 rounded-t ${i === ex.points.length - 1 ? "bg-green-500" : "bg-surface-600"}`}
                            style={{ height: `${20 + ((p.weight - min) / range) * 80}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Weekly sets per muscle */}
          {muscles.length > 0 && (
            <div className="pt-3 border-t border-surface-700/50">
              <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-2">
                Séries por músculo / semana
              </p>
              <div className="space-y-1.5">
                {muscles.map(m => {
                  const pct = Math.min(100, (m.perWeek / 20) * 100);
                  // 12-20 weekly sets is the productive band for hypertrophy (§8.3).
                  const tone = m.perWeek >= 12 ? "bg-green-500"
                    : m.perWeek >= 6 ? "bg-yellow-500" : "bg-surface-500";
                  return (
                    <div key={m.muscle} className="flex items-center gap-2">
                      <span className="text-[11px] text-surface-400 w-20 shrink-0">{m.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-surface-700 overflow-hidden">
                        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] font-mono text-surface-300 w-8 text-right shrink-0">
                        {m.perWeek}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-surface-500 mt-2 flex items-start gap-1.5">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                Faixa produtiva para hipertrofia: 12–20 séries por músculo por semana.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
