"use client";

/**
 * A semana como agenda — sete linhas, com o nome de cada sessão e o que
 * aconteceu nela.
 *
 * Antes eram sete caixinhas coloridas de 40 px, com o rótulo cortado em seis
 * letras ("Tiros c…") e um emoji. Para saber o que era quinta-feira, tocava-se
 * em quinta-feira. Uma semana que só se entende tocando dia a dia não é uma
 * semana: é um menu.
 *
 * E ela não mudava depois do treino: sábado dizia "Longão · 12 km" igual antes
 * e depois de você correr. Agora cada linha termina com o estado — Registrado,
 * 1 de 2, Sem registro — que vem de `dayProgress`, que por sua vez lê as mesmas
 * sessões que a Hoje e a adesão leem.
 *
 * Três coisas que a linha diz e não podem se confundir:
 *   **data** (quando) · **hoje** (etiqueta laranja) · **selecionado** (fundo e
 *   borda). Abrir domingo não pode apagar que quinta é hoje.
 */
import { sessionTone } from "@/lib/session-colors";
import { agendaLine } from "@/lib/week-agenda";
import type { DayProgress } from "@/lib/day-progress";
import { DAY_SHORT_PT, dateOfWeekDay } from "@/lib/week";
import { DayState } from "@/components/coach/week/DayState";
import type { WeeklyPlanDay } from "@/types";

export function WeekAgenda({
  days, weekStart, todayKey, selectedDay, progressOf, onSelect,
}: {
  days: WeeklyPlanDay[];
  weekStart: string;
  /** Null na próxima semana: nenhum dia dela é hoje. */
  todayKey: WeeklyPlanDay["day"] | null;
  selectedDay: WeeklyPlanDay | null;
  /** O que aconteceu naquele dia — null quando a semana ainda nem começou. */
  progressOf: (day: WeeklyPlanDay) => DayProgress | null;
  onSelect: (day: WeeklyPlanDay) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {days.map(day => {
        const tone = sessionTone(day.type);
        const isToday = day.day === todayKey;
        const isSelected = selectedDay?.day === day.day;
        const { main, extra, metric } = agendaLine(day);
        const isRest = day.type === "rest";
        const progress = progressOf(day);
        const faded = progress?.state === "missed";

        return (
          <li key={day.day}>
            <button
              type="button"
              onClick={() => onSelect(day)}
              aria-current={isSelected ? "true" : undefined}
              className={[
                // Altura mínima folgada, e mais alta ainda quando o dia tem
                // duas sessões ou um estado: nada espreme o nome do treino.
                "flex w-full min-h-[56px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left",
                "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60",
                isSelected
                  ? "border-brand-500/40 bg-surface-700/70"
                  : "border-transparent hover:bg-surface-700/40",
              ].join(" ")}
            >
              {/* A cor é um marcador do tipo de treino, não uma caixa. */}
              <span className={`h-9 w-1 shrink-0 rounded-full ${isRest ? "bg-surface-700" : tone.dot}`} />

              <span className="w-[4.25rem] shrink-0">
                <span className={`block text-[13px] font-bold uppercase tracking-wide ${isToday ? "text-brand-400" : "text-surface-300"}`}>
                  {DAY_SHORT_PT[day.day] ?? day.day}
                </span>
                <span className="mt-0.5 flex items-baseline gap-1">
                  <span className={`text-xs ${isToday ? "text-brand-400" : "text-surface-500"}`}>
                    {dateOfWeekDay(weekStart, day.day) ?? ""}
                  </span>
                  {/* Hoje é uma etiqueta, não uma cor a ser adivinhada. */}
                  {isToday && (
                    <span className="rounded bg-brand-500/20 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-brand-300">
                      hoje
                    </span>
                  )}
                </span>
              </span>

              <span className="min-w-0 flex-1">
                {/*
                  O nome do treino não é cortado: "Tiros curtos 6×200 m" virava
                  "Tiros curtos 6×20…", que é a informação mais importante da
                  linha perdendo para a largura. Em duas linhas cabe.
                */}
                <span className={[
                  "block line-clamp-2 text-[15px] font-semibold leading-snug",
                  isRest ? "text-surface-400" : faded ? "text-surface-400" : "text-surface-100",
                ].join(" ")}>
                  {main}
                </span>
                {extra && (
                  <span className="mt-0.5 block truncate text-xs text-surface-400">+ {extra}</span>
                )}
                {progress && <DayState progress={progress} className="mt-1" />}
              </span>

              {metric && (
                <span className={`shrink-0 text-[13px] font-medium tabular-nums ${faded ? "text-surface-500" : "text-surface-300"}`}>
                  {metric}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
