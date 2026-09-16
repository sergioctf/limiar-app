"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Moon, Dumbbell, Timer } from "lucide-react";
import { daySessions, dayTitle, isDoubleDay } from "@/lib/day-sessions";
import { savePlanOffline } from "@/lib/offline-store";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const DAY_KEYS: WeeklyPlanDay["day"][] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_DOT: Record<string, string> = {
  rest: "bg-surface-500", easy: "bg-green-500", recovery: "bg-cyan-500",
  tempo: "bg-yellow-500", intervals: "bg-red-400", long_run: "bg-purple-500",
  test: "bg-pink-500", race: "bg-brand-500", strength: "bg-surface-400", hiit: "bg-orange-500",
};

/**
 * Compact read-only view of the week's AI plan, with today highlighted and a
 * shortcut into the coach where the plan can be edited/regenerated.
 */
export function WeeklyPlanSummaryCard({ plan }: { plan: WeeklyPlanData }) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const todayKey = DAY_KEYS[new Date().getDay()];
  const days     = plan.days.filter((d): d is WeeklyPlanDay => !!d && !!d.day);
  const today    = days.find(d => d.day === todayKey) ?? null;

  // The dashboard renders the plan server-side, so this is often the first
  // place it's seen — store it so the workout survives losing signal.
  useEffect(() => {
    if (plan.week_start) savePlanOffline(plan.week_start, plan);
  }, [plan]);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Plano da semana</h2>
        </div>
        <Link
          href="/coach"
          className="flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors py-1 px-2 rounded-lg hover:bg-brand-500/10"
        >
          Ir ao Treinador <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/*
        No "today" block here any more.

        The screen's hero already answers what today is, in type three times
        this size. Repeating it a hundred pixels lower was the old dashboard's
        habit — the same fact stated by two cards, so neither felt authoritative.
      */}
      {/* Week strip */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(d => {
          const isToday = d.day === todayKey;
          return (
            <button
              key={d.day}
              onClick={() => setOpenDay(openDay === d.day ? null : d.day)}
              title={`${d.dayPt ?? d.day}: ${dayTitle(d)}`}
              className={`flex flex-col items-center gap-1 rounded-lg py-2 transition-colors active:opacity-80 ${
                openDay === d.day ? "bg-brand-500/20 border border-brand-400/50"
                  : isToday ? "bg-brand-500/10 border border-brand-500/25" : "bg-surface-700/30 border border-transparent"
              }`}
            >
              <span className={`text-[10px] font-bold uppercase ${isToday ? "text-brand-400" : "text-surface-500"}`}>
                {(d.day ?? "").slice(0, 2)}
              </span>
              <span className="flex items-center gap-0.5 leading-none">
                {/* Colour carries the kind of day; no emoji, in keeping with the rest of the dashboard. */}
                {d.sport === "musculacao"
                  ? <Dumbbell className="w-3 h-3 text-surface-400" aria-hidden />
                  : <span className={`w-2 h-2 rounded-full ${TYPE_DOT[d.type] ?? "bg-surface-500"}`} />}
                {d.strength && d.sport !== "musculacao" && (
                  <Dumbbell className="w-3 h-3 text-surface-400" aria-hidden />
                )}
              </span>
              <span className="text-[10px] text-surface-500 leading-none">
                {d.type === "rest" ? "—" : d.distance_km != null ? `${d.distance_km}k` : d.duration_min != null ? `${d.duration_min}m` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        Any day of the week, opened in place.
        The card used to show only today with a link away; seeing Thursday
        meant leaving the dashboard for the coach.
      */}
      {openDay && (() => {
        const d = days.find(x => x.day === openDay);
        if (!d) return null;
        return (
          <div className="bg-surface-800/60 border border-surface-700 rounded-xl p-3 space-y-2">
            {/* The heading names every session on the day. Reading "Tiro
                3×400 m" on a day that also has a chest workout is how the
                second session went unnoticed. */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-surface-100">{d.dayPt ?? d.day}</span>
              <span className="text-sm text-surface-300">— {dayTitle(d)}</span>
              <span className="ml-auto text-xs text-surface-400">
                {d.distance_km != null ? `${d.distance_km} km` : d.duration_min != null ? `${d.duration_min} min` : ""}
              </span>
            </div>
            {d.pace && <p className="text-xs text-surface-500">Ritmo {d.pace}</p>}
            {d.description && (
              <p className="text-xs text-surface-400 leading-relaxed">{d.description}</p>
            )}
            {d.strength && (
              <div className="flex items-start gap-2 pt-2 border-t border-surface-700/60">
                <Dumbbell className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-purple-300">
                    {isDoubleDay(d) ? "Musculação — segunda sessão do dia" : "Musculação"}
                  </p>
                  <p className="text-[11px] text-surface-400 leading-relaxed mt-0.5">
                    {d.strength.exercises.length} exercícios ·{" "}
                    <span className="inline-flex items-center gap-1">
                      <Timer className="w-3 h-3" />~{d.strength.estimatedMinutes} min
                    </span>
                  </p>
                  <p className="text-[11px] text-surface-500 mt-1">
                    {d.strength.exercises.slice(0, 4).map(e => e.name).join(" · ")}
                    {d.strength.exercises.length > 4 ? " · …" : ""}
                  </p>
                </div>
              </div>
            )}
            <Link href="/coach" className="text-[11px] text-brand-400 hover:text-brand-300 inline-flex items-center gap-1">
              Ver detalhe completo no treinador <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        );
      })()}
    </div>
  );
}
