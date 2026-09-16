"use client";

import { useEffect, useState } from "react";
import { Moon } from "lucide-react";
import { hoursLabel, SLEEP_TARGET_H, type SleepWeek } from "@/lib/health-view";

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** Bars are scaled to this many hours, so the target line sits at a fixed, readable height. */
const SCALE_H = 10;

/**
 * The week of sleep, as bars against the target.
 *
 * One night is noise; seven bars against a line show the pattern the athlete can
 * actually change — the two short nights before the long run, the weekend that
 * never catches up. Debt is summed so the cost of those nights has a number.
 */
export function SleepCard({ week }: { week: SleepWeek }) {
  // Bars grow from zero on mount: same reason the ring draws itself — a measured
  // value should look measured.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const last = week.nights[week.nights.length - 1];
  const lastMeasured = [...week.nights].reverse().find(n => n.hours != null) ?? null;

  if (week.measured === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-surface-700 bg-surface-800 p-4">
        <Moon className="w-5 h-5 shrink-0 text-surface-500" />
        <p className="text-sm text-surface-500">Nenhuma noite registrada nos últimos 7 dias.</p>
      </div>
    );
  }

  const targetPct = (SLEEP_TARGET_H / SCALE_H) * 100;

  return (
    <div className="rounded-2xl border border-surface-700 bg-surface-800 p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">
            {last.hours != null ? "Esta noite" : "Última noite medida"}
          </p>
          <p className="mt-1 text-4xl font-black tabular-nums leading-none text-surface-100">
            {hoursLabel(lastMeasured?.hours)}
          </p>
        </div>
        {lastMeasured?.score != null && (
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Nota</p>
            <p className={`mt-1 text-2xl font-black tabular-nums leading-none ${
              lastMeasured.score >= 80 ? "text-emerald-400" : lastMeasured.score >= 60 ? "text-amber-400" : "text-red-400"
            }`}>{lastMeasured.score}</p>
          </div>
        )}
      </div>

      <div className="relative mt-5 h-28">
        {/* The target's label lives in the footer: any label inside the chart sits on top of a bar. */}
        <div className="absolute inset-x-0 z-10 border-t border-dashed border-surface-400/70" style={{ bottom: `${targetPct}%` }} />

        <div className="absolute inset-0 flex items-end justify-between gap-2">
          {week.nights.map((n, i) => {
            const h = n.hours ?? 0;
            const pct = Math.min(100, (h / SCALE_H) * 100);
            const color = n.hours == null ? "bg-surface-700"
              : h >= 7 ? "bg-indigo-400" : h >= 6 ? "bg-indigo-400/60" : "bg-red-400/70";
            return (
              <div key={n.date} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className={`w-full rounded-t-md ${color} transition-[height] duration-700 ease-smooth`}
                  style={{ height: grown ? `${n.hours == null ? 3 : pct}%` : "0%", transitionDelay: `${i * 60}ms` }}
                  title={n.hours != null ? hoursLabel(n.hours) : "sem registro"}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between gap-2">
        {week.nights.map(n => (
          <span key={n.date} className="flex-1 text-center text-[10px] text-surface-500">
            {WEEKDAY[new Date(`${n.date}T12:00:00Z`).getUTCDay()]}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-surface-700/60 pt-3">
        <div>
          <p className="text-[11px] text-surface-500">Média ({week.measured})</p>
          <p className="text-base font-bold tabular-nums text-surface-100">{hoursLabel(week.avgHours)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-[11px] text-surface-500">
            <span className="inline-block w-3 border-t border-dashed border-surface-400" /> Meta
          </p>
          <p className="text-base font-bold tabular-nums text-surface-100">{hoursLabel(SLEEP_TARGET_H)}</p>
        </div>
        <div>
          <p className="text-[11px] text-surface-500">Dívida</p>
          <p className={`text-base font-bold tabular-nums ${week.debtHours >= 3 ? "text-red-400" : week.debtHours >= 1 ? "text-amber-400" : "text-emerald-400"}`}>
            {week.debtHours > 0 ? hoursLabel(week.debtHours) : "zerada"}
          </p>
        </div>
      </div>
    </div>
  );
}
