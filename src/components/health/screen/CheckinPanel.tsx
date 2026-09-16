"use client";

import { PencilLine, Moon, Zap, Flame, ArrowRight } from "lucide-react";
import { hoursLabel, addDays } from "@/lib/health-view";
import type { HealthCheckin } from "@/types";

const SORENESS = ["Nenhuma", "Leve", "Moderada", "Forte", "Muita"];
const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * The heart of Saúde for an athlete without a watch.
 *
 * With no sensor, the only information about the night is what the athlete
 * says. Burying that behind a small button made the screen a training-load
 * readout pretending to be a recovery screen. So here the check-in is the first
 * thing below the score, and the week of answers is drawn like the week of
 * sleep a watch would have produced — the same shapes, honestly labelled.
 */
export function CheckinPanel({
  today, checkin, checkins, onOpen,
}: {
  today: string;
  checkin: HealthCheckin | null;
  checkins: HealthCheckin[];
  onOpen: () => void;
}) {
  const byDate = new Map(checkins.map(c => [c.date, c]));
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map(date => ({ date, c: byDate.get(date) ?? null }));
  const answered = week.filter(d => d.c != null).length;

  return (
    <div className="rounded-2xl border border-surface-700 bg-surface-800 p-4">
      {checkin ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Check-in de hoje</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {checkin.sleep_hours != null && (
                <Chip icon={<Moon className="w-3 h-3" />}>{hoursLabel(checkin.sleep_hours)}{checkin.sleep_quality ? ` · ${checkin.sleep_quality}/5` : ""}</Chip>
              )}
              {checkin.soreness != null && <Chip icon={<Flame className="w-3 h-3" />}>Dor {SORENESS[checkin.soreness - 1]?.toLowerCase()}</Chip>}
              {checkin.rpe != null && <Chip icon={<Zap className="w-3 h-3" />}>Ontem {checkin.rpe}/10</Chip>}
            </div>
          </div>
          <button onClick={onOpen} className="flex min-h-[44px] shrink-0 items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300">
            <PencilLine className="w-3.5 h-3.5" /> Editar
          </button>
        </div>
      ) : (
        <button onClick={onOpen} className="flex w-full items-center gap-3 text-left active:scale-[0.99]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15">
            <PencilLine className="w-5 h-5 text-brand-400" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-surface-100">Como você dormiu?</span>
            <span className="block text-xs text-surface-500">Três toques, 20 segundos — sem relógio, é isso que diz como foi a noite.</span>
          </span>
          <ArrowRight className="w-4 h-4 shrink-0 text-surface-500" />
        </button>
      )}

      {/* The week of answers — the pattern matters more than any one morning. */}
      <div className="mt-4 border-t border-surface-700/60 pt-3">
        <p className="text-[11px] text-surface-500">
          {answered > 0 ? `${answered} de 7 dias respondidos` : "Responda por alguns dias para ver o padrão"}
        </p>
        <div className="mt-2 grid grid-cols-7 gap-1.5">
          {week.map(({ date, c }) => {
            const sore = c?.soreness ?? null;
            return (
              <div key={date} className="flex flex-col items-center gap-1">
                <span
                  className={`flex h-8 w-full items-center justify-center rounded-lg text-[11px] font-bold tabular-nums ${
                    c?.sleep_hours == null ? "bg-surface-700/40 text-surface-600"
                      : c.sleep_hours >= 7 ? "bg-indigo-400/25 text-indigo-300"
                      : c.sleep_hours >= 6 ? "bg-amber-400/20 text-amber-300"
                      : "bg-red-400/20 text-red-300"
                  }`}
                  title={c?.sleep_hours != null ? `Sono ${hoursLabel(c.sleep_hours)}` : "sem check-in"}
                >
                  {c?.sleep_hours != null ? Math.round(c.sleep_hours) : "·"}
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${sore == null ? "bg-surface-700" : sore >= 4 ? "bg-red-400" : sore >= 3 ? "bg-amber-400" : "bg-emerald-400"}`}
                  title={sore != null ? `Dor ${SORENESS[sore - 1]}` : ""}
                />
                <span className="text-[10px] text-surface-500">{WEEKDAY[new Date(`${date}T12:00:00Z`).getUTCDay()]}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-surface-500">Número: horas de sono · ponto: dor muscular</p>
      </div>
    </div>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-700/50 px-2.5 py-1 text-xs font-medium text-surface-200">
      <span className="text-surface-400">{icon}</span>{children}
    </span>
  );
}
