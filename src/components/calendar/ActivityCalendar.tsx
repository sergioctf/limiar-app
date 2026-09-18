"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { CalendarEntry } from "@/types";
import { toSportKey } from "@/lib/sports";
import { DayModal } from "./DayModal";
import { GymSessionForm } from "./GymSessionForm";
import { cn } from "@/lib/utils";
import { localDateStr } from "@/lib/week";
import { SportGlyph } from "@/components/shared/SportGlyph";

/** Monday first, like every other week in the app (the plan, the Home, adherence). */
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const km1 = (n: number) => n.toFixed(1).replace(".", ",");
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
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
  // Blank cells before the 1st, counting from Monday.
  const firstDay = (new Date(year, month - 1, 1).getDay() + 6) % 7;
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

  const todayStr = localDateStr(today);
  const selectedEntries = selected ? (byDate[selected] ?? []) : [];

  // Summary stats
  const totalActivities = entries.length;
  const totalMinutes    = entries.reduce((s, e) => s + (e.duration_seconds ?? 0) / 60, 0);
  // Running km only — mixing in bike distance inflates it and swim deflates it.
  const totalKm         = entries
    .filter(e => toSportKey(e.sport_type) === "corrida")
    .reduce((s, e) => s + (e.distance_km ?? 0), 0);
  const runDays         = new Set(entries.filter(e => e.sport_type === "Run" || e.sport_type === "TrailRun").map(e => e.date)).size;
  const gymDays         = new Set(entries.filter(e => {
    const t = e.sport_type?.toLowerCase();
    return t?.includes("weight") || t?.includes("workout") || t?.includes("crossfit");
  }).map(e => e.date)).size;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 sm:gap-3 min-w-0">
          <button onClick={prevMonth} aria-label="Mês anterior" className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-surface-100 sm:min-w-[200px] text-center truncate">
            {MONTHS_PT[month - 1]} {year}
          </h2>
          <button onClick={nextMonth} aria-label="Próximo mês" className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors shrink-0">
            <ChevronRight className="w-5 h-5" />
          </button>
          {loading && <Loader2 className="w-4 h-4 text-surface-500 animate-spin shrink-0" />}
        </div>
        <button
          onClick={() => { setFormDate(todayStr); setShowForm(true); }}
          aria-label="Registrar treino"
          className="shrink-0 flex items-center gap-2 min-h-[44px] px-3 sm:px-4 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Registrar treino</span>
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Atividades", value: totalActivities },
          { label: "Horas", value: `${Math.floor(totalMinutes / 60)}h ${Math.round(totalMinutes % 60)}min` },
          { label: "KM rodados", value: `${km1(totalKm)} km` },
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
          <div className="py-2 px-2 text-right text-xs font-semibold text-surface-500 hidden sm:block">Semana</div>
        </div>

        {/* Week rows */}
        {Array.from({ length: cells.length / 7 }, (_, weekIdx) => {
          const weekCells = cells.slice(weekIdx * 7, weekIdx * 7 + 7);

          // Compute week totals
          const weekDates = weekCells
            .filter((d): d is number => d !== null)
            .map((d) => `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`);

          const weekKm = weekDates.reduce((sum, dateStr) => {
            return sum + (byDate[dateStr] ?? [])
              .filter(e => toSportKey(e.sport_type) === "corrida")
              .reduce((s, e) => s + (e.distance_km ?? 0), 0);
          }, 0);

          const weekActivityCount = weekDates.reduce((sum, dateStr) => {
            return sum + (byDate[dateStr] ?? []).length;
          }, 0);

          return (
            <div key={`week-${weekIdx}`} className="grid grid-cols-[repeat(7,1fr)_auto]">
              {weekCells.map((day, dayIdx) => {
                const i = weekIdx * 7 + dayIdx;
                if (day === null) {
                  return <div key={`empty-${i}`} className="min-h-[64px] sm:min-h-[80px] bg-surface-850/50 border-b border-r border-surface-700/40" />;
                }
                const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const dayEntries = byDate[dateStr] ?? [];
                const isToday    = dateStr === todayStr;
                const isSelected = dateStr === selected;
                const firstColumn = (dayIdx === 0);

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
                      "min-h-[64px] sm:min-h-[80px] p-1.5 sm:p-2 text-left border-b border-r border-surface-700/40 transition-colors relative flex flex-col gap-1",
                      isSelected
                        ? "bg-brand-500/15 border-brand-500/30"
                        : dayEntries.length > 0
                          ? "hover:bg-surface-700/50 cursor-pointer"
                          : "hover:bg-surface-750/30 cursor-pointer",
                      firstColumn && "border-l-0"
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

                    {/* One icon per activity, the same as on the Home — no colour legend to decode. */}
                    {dayEntries.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 sm:gap-1 text-brand-400">
                        {dayEntries.slice(0, 3).map((e, idx) => (
                          <span key={idx} title={sportLabel(e.sport_type)}>
                            <SportGlyph sport={toSportKey(e.sport_type)} className="w-3.5 h-3.5" />
                          </span>
                        ))}
                        {dayEntries.length > 3 && (
                          <span className="text-[10px] text-surface-500 leading-none self-center">+{dayEntries.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Run distance (desktop only, ≥1km) */}
                    {dayRunKm >= 1 && (
                      <p className="text-[10px] text-brand-400 font-semibold leading-tight hidden sm:block">
                        {km1(dayRunKm)} km
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
              <div className="min-h-[64px] sm:min-h-[80px] border-b border-surface-700/40 px-2 py-2 flex-col items-end justify-center gap-0.5 hidden sm:flex">
                {weekActivityCount > 0 ? (
                  <>
                    {weekKm >= 0.1 && (
                      <span className="text-[10px] font-bold text-surface-300 tabular-nums whitespace-nowrap">
                        {km1(weekKm)} km
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
          <span className="text-surface-500 text-sm">Sem atividades em {dayMonth(selected)}</span>
          <button
            onClick={() => { setFormDate(selected); setShowForm(true); }}
            className="text-brand-400 text-sm hover:text-brand-300 flex items-center gap-1 min-h-[44px]"
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
