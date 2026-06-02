"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { CalendarEntry } from "@/types";
import { DayModal } from "./DayModal";
import { GymSessionForm } from "./GymSessionForm";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export function sportColor(type: string): string {
  const t = type?.toLowerCase() ?? "";
  if (t.includes("run") || t.includes("trail"))   return "bg-brand-500";
  if (t.includes("weight") || t.includes("workout") || t.includes("crossfit") || t.includes("gym"))
                                                   return "bg-blue-500";
  if (t.includes("ride") || t.includes("bike") || t.includes("cycling"))
                                                   return "bg-green-500";
  if (t.includes("swim"))                          return "bg-cyan-500";
  if (t.includes("walk") || t.includes("hike"))   return "bg-yellow-500";
  if (t.includes("yoga") || t.includes("pilates")) return "bg-purple-500";
  return "bg-surface-500";
}

export function sportLabel(type: string): string {
  const map: Record<string, string> = {
    Run: "Corrida", TrailRun: "Trail", VirtualRun: "Virtual",
    WeightTraining: "Musculação", Workout: "Treino", Crossfit: "CrossFit",
    Yoga: "Yoga", Pilates: "Pilates",
    Ride: "Pedalada", VirtualRide: "Ciclismo Virtual", EBikeRide: "E-Bike",
    Swim: "Natação", OpenWaterSwim: "Natação Aberta",
    Walk: "Caminhada", Hike: "Trilha",
    Soccer: "Futebol", Tennis: "Tênis", Basketball: "Basquete",
    Other: "Outro",
  };
  return map[type] ?? type;
}

export function ActivityCalendar() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based
  const [entries,   setEntries]   = useState<CalendarEntry[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState<string | null>(null); // YYYY-MM-DD
  const [showForm,  setShowForm]  = useState(false);
  const [formDate,  setFormDate]  = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/activities?year=${year}&month=${month}`);
      if (res.ok) setEntries(await res.json());
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  // Group entries by date string
  const byDate = entries.reduce<Record<string, CalendarEntry[]>>((acc, e) => {
    (acc[e.date] ??= []).push(e);
    return acc;
  }, {});

  const todayStr = today.toISOString().slice(0, 10);
  const selectedEntries = selected ? (byDate[selected] ?? []) : [];

  // Summary stats
  const totalActivities = entries.length;
  const totalMinutes    = entries.reduce((s, e) => s + (e.duration_seconds ?? 0) / 60, 0);
  const totalKm         = entries.reduce((s, e) => s + (e.distance_km ?? 0), 0);
  const runDays         = new Set(entries.filter(e => e.sport_type === "Run" || e.sport_type === "TrailRun").map(e => e.date)).size;
  const gymDays         = new Set(entries.filter(e => {
    const t = e.sport_type?.toLowerCase();
    return t?.includes("weight") || t?.includes("workout") || t?.includes("crossfit");
  }).map(e => e.date)).size;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-surface-100 min-w-[200px] text-center">
            {MONTHS_PT[month - 1]} {year}
          </h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
          {loading && <Loader2 className="w-4 h-4 text-surface-500 animate-spin" />}
        </div>
        <button
          onClick={() => { setFormDate(todayStr); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Registrar treino
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Atividades", value: totalActivities },
          { label: "Horas", value: `${Math.floor(totalMinutes / 60)}h ${Math.round(totalMinutes % 60)}min` },
          { label: "KM rodados", value: `${totalKm.toFixed(1)} km` },
          { label: "Corrida / Academia", value: `${runDays}d / ${gymDays}d` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-center">
            <p className="text-surface-500 text-xs mb-0.5">{label}</p>
            <p className="text-surface-100 font-bold text-lg">{value}</p>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="bg-surface-800 border border-surface-700 rounded-2xl overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-[repeat(7,1fr)_auto] border-b border-surface-700">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-surface-500">{d}</div>
          ))}
          <div className="py-2 px-2 text-right text-xs font-semibold text-surface-600 hidden sm:block">Semana</div>
        </div>

        {/* Week rows */}
        {Array.from({ length: cells.length / 7 }, (_, weekIdx) => {
          const weekCells = cells.slice(weekIdx * 7, weekIdx * 7 + 7);

          // Compute week totals
          const weekDates = weekCells
            .filter((d): d is number => d !== null)
            .map((d) => `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`);

          const weekKm = weekDates.reduce((sum, dateStr) => {
            return sum + (byDate[dateStr] ?? []).reduce((s, e) => s + (e.distance_km ?? 0), 0);
          }, 0);

          const weekActivityCount = weekDates.reduce((sum, dateStr) => {
            return sum + (byDate[dateStr] ?? []).length;
          }, 0);

          return (
            <div key={`week-${weekIdx}`} className="grid grid-cols-[repeat(7,1fr)_auto]">
              {weekCells.map((day, dayIdx) => {
                const i = weekIdx * 7 + dayIdx;
                if (day === null) {
                  return <div key={`empty-${i}`} className="min-h-[80px] bg-surface-850/50 border-b border-r border-surface-700/40" />;
                }
                const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const dayEntries = byDate[dateStr] ?? [];
                const isToday    = dateStr === todayStr;
                const isSelected = dateStr === selected;
                const hasSunday  = (dayIdx === 0);

                // Run distance for this day
                const dayRunKm = dayEntries.reduce((s, e) => {
                  if (e.sport_type === "Run" || e.sport_type === "TrailRun" || e.sport_type === "VirtualRun") {
                    return s + (e.distance_km ?? 0);
                  }
                  return s;
                }, 0);

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelected(isSelected ? null : dateStr)}
                    className={cn(
                      "min-h-[80px] p-2 text-left border-b border-r border-surface-700/40 transition-colors relative flex flex-col gap-1",
                      isSelected
                        ? "bg-brand-500/15 border-brand-500/30"
                        : dayEntries.length > 0
                          ? "hover:bg-surface-700/50 cursor-pointer"
                          : "hover:bg-surface-750/30 cursor-pointer",
                      hasSunday && "border-l-0"
                    )}
                  >
                    <span className={cn(
                      "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full",
                      isToday
                        ? "bg-brand-500 text-white"
                        : "text-surface-400"
                    )}>
                      {day}
                    </span>

                    {/* Activity dots */}
                    {dayEntries.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {dayEntries.slice(0, 3).map((e, idx) => (
                          <span
                            key={idx}
                            className={cn("w-2 h-2 rounded-full shrink-0", sportColor(e.sport_type))}
                            title={sportLabel(e.sport_type)}
                          />
                        ))}
                        {dayEntries.length > 3 && (
                          <span className="text-[10px] text-surface-500 leading-none">+{dayEntries.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Run distance (desktop only, ≥1km) */}
                    {dayRunKm >= 1 && (
                      <p className="text-[10px] text-brand-400 font-semibold leading-tight hidden sm:block">
                        {dayRunKm.toFixed(1)} km
                      </p>
                    )}

                    {/* First activity name (compact, only if no run distance shown) */}
                    {dayEntries.length > 0 && dayRunKm < 1 && (
                      <p className="text-[10px] text-surface-400 leading-tight truncate mt-auto hidden sm:block">
                        {dayEntries[0].name}
                      </p>
                    )}
                  </button>
                );
              })}

              {/* Week totals sidebar */}
              <div className="min-h-[80px] border-b border-surface-700/40 px-2 py-2 flex flex-col items-end justify-center gap-0.5 hidden sm:flex">
                {weekActivityCount > 0 ? (
                  <>
                    {weekKm >= 0.1 && (
                      <span className="text-[10px] font-bold text-surface-300 tabular-nums whitespace-nowrap">
                        {weekKm.toFixed(1)} km
                      </span>
                    )}
                    <span className="text-[10px] text-surface-500 tabular-nums">
                      {weekActivityCount} {weekActivityCount === 1 ? "treino" : "treinos"}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-surface-500">
        {[
          { color: "bg-brand-500",   label: "Corrida"     },
          { color: "bg-blue-500",    label: "Musculação"  },
          { color: "bg-green-500",   label: "Ciclismo"    },
          { color: "bg-cyan-500",    label: "Natação"     },
          { color: "bg-yellow-500",  label: "Caminhada"   },
          { color: "bg-purple-500",  label: "Yoga/Pilates"},
          { color: "bg-surface-500", label: "Outros"      },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={cn("w-2.5 h-2.5 rounded-full", color)} />
            {label}
          </div>
        ))}
      </div>

      {/* Day modal */}
      {selected && selectedEntries.length > 0 && (
        <DayModal
          date={selected}
          entries={selectedEntries}
          onClose={() => setSelected(null)}
          onAddGym={() => { setFormDate(selected); setShowForm(true); }}
          onDelete={async (id, type) => {
            const table = type === "Run" ? "runs" : "activities";
            if (table === "activities") {
              await fetch(`/api/activities/${id}`, { method: "DELETE" });
            }
            await load();
          }}
        />
      )}
      {selected && selectedEntries.length === 0 && (
        <div className="bg-surface-800 border border-surface-700 rounded-xl p-4 flex items-center justify-between">
          <span className="text-surface-500 text-sm">Sem atividades em {selected}</span>
          <button
            onClick={() => { setFormDate(selected); setShowForm(true); }}
            className="text-brand-400 text-sm hover:text-brand-300 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Registrar
          </button>
        </div>
      )}

      {/* Gym form modal */}
      {showForm && (
        <GymSessionForm
          defaultDate={formDate}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}
