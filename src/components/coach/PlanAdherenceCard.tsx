"use client";

import { CheckCircle2, XCircle, CircleDot, Moon, Clock, ClipboardCheck, Plus } from "lucide-react";
import type { WeekAdherence, DayStatus } from "@/lib/plan-adherence";

interface Props {
  history: WeekAdherence[]; // [0] = most recent week
}

const STATUS_UI: Record<DayStatus, { icon: React.ReactNode; label: string; color: string }> = {
  done:     { icon: <CheckCircle2 className="w-4 h-4" />, label: "Feito",     color: "text-green-400" },
  partial:  { icon: <CircleDot className="w-4 h-4" />,    label: "Parcial",   color: "text-yellow-400" },
  missed:   { icon: <XCircle className="w-4 h-4" />,      label: "Perdido",   color: "text-red-400" },
  rest_ok:  { icon: <Moon className="w-4 h-4" />,         label: "Descanso",  color: "text-surface-500" },
  extra:    { icon: <Plus className="w-4 h-4" />,         label: "Extra",     color: "text-blue-400" },
  upcoming: { icon: <Clock className="w-4 h-4" />,        label: "A fazer",   color: "text-surface-600" },
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

export function PlanAdherenceCard({ history }: Props) {
  if (history.length === 0) return null;

  const current = history[0];
  const past = history.slice(1).filter(w => w.score !== null);

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Adesão ao plano</h2>
        </div>
        {current.score !== null && (
          <div className="text-right">
            <span className={`text-2xl font-black tabular-nums ${scoreColor(current.score)}`}>
              {current.score}%
            </span>
            <p className="text-[10px] text-surface-600 -mt-0.5">esta semana</p>
          </div>
        )}
      </div>

      {/* Day-by-day strip */}
      <div className="grid grid-cols-7 gap-1">
        {current.days.map(d => {
          const ui = STATUS_UI[d.status];
          return (
            <div
              key={d.day}
              title={`${d.dayPt}: ${d.planned.label}${d.actualKm > 0 ? ` — ${d.actualKm}km feitos` : ""}`}
              className="flex flex-col items-center gap-1 rounded-lg bg-surface-700/30 py-2"
            >
              <span className="text-[9px] text-surface-500 uppercase">{d.dayPt.slice(0, 3)}</span>
              <span className={ui.color}>{ui.icon}</span>
              <span className="text-[8px] text-surface-600 leading-none text-center px-0.5 line-clamp-1">
                {d.planned.type === "rest" ? "—" : d.planned.distance_km ? `${d.planned.distance_km}k` : d.planned.label.slice(0, 5)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
        {(["done", "partial", "missed", "extra"] as DayStatus[]).map(s => (
          <span key={s} className="flex items-center gap-1 text-[10px] text-surface-500">
            <span className={STATUS_UI[s].color}>{STATUS_UI[s].icon}</span>
            {STATUS_UI[s].label}
          </span>
        ))}
      </div>

      {/* Past weeks mini history */}
      {past.length > 0 && (
        <div className="mt-3 pt-3 border-t border-surface-700/50">
          <p className="text-[10px] text-surface-600 uppercase tracking-wide mb-1.5">Semanas anteriores</p>
          <div className="flex gap-2">
            {past.map(w => (
              <div key={w.weekStart} className="flex-1 text-center bg-surface-700/30 rounded-lg py-1.5">
                <p className={`text-sm font-bold tabular-nums ${scoreColor(w.score!)}`}>{w.score}%</p>
                <p className="text-[9px] text-surface-600">
                  {new Date(`${w.weekStart}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
