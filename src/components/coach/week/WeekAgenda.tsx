"use client";

/**
 * A semana como agenda — uma linha por sessão, com o que aconteceu nela.
 *
 * Antes eram sete caixinhas coloridas de 40 px, com o rótulo cortado em seis
 * letras ("Tiros c…") e um emoji. Para saber o que era quinta-feira, tocava-se
 * em quinta-feira. Uma semana que só se entende tocando dia a dia não é uma
 * semana: é um menu.
 *
 * Depois, cada dia virou uma linha — mas a segunda sessão do dia era um rabicho
 * cinza embaixo da primeira, sem duração. Agora **cada sessão tem a sua
 * linha**, com o mesmo peso e a sua própria medida: a musculação de segunda
 * vale o mesmo que a de quinta, que é o dia inteiro dela.
 *
 * E a linha não muda depois do treino — mudava, sim: o estado (`DayState`) vem
 * de `dayProgress`, que lê as mesmas sessões que a Hoje e a adesão leem.
 *
 * Três coisas que a linha diz e não podem se confundir: **data** (quando),
 * **hoje** (etiqueta laranja) e **selecionado** (fundo e borda). Abrir domingo
 * não pode apagar que quinta é hoje.
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
    <ul className="space-y-1.5">
      {days.map(day => {
        const isToday = day.day === todayKey;
        const isSelected = selectedDay?.day === day.day;
        const { sessions, rest } = agendaLine(day);
        const progress = progressOf(day);
        const faded = progress?.state === "missed";

        return (
          <li key={day.day}>
            <button
              type="button"
              onClick={() => onSelect(day)}
              aria-current={isSelected ? "true" : undefined}
              className={[
                // O dia cresce com o que tem dentro: duas sessões ocupam duas
                // linhas inteiras, não uma linha e um rabicho.
                "flex w-full min-h-[56px] items-stretch gap-2.5 rounded-2xl border px-2.5 py-2.5 text-left",
                "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60",
                isSelected
                  ? "limiar-feature !rounded-2xl"
                  : "border-surface-700 bg-surface-800/70 hover:bg-surface-700/60",
              ].join(" ")}
            >
              {/* Uma barra por sessão: a cor diz o tipo de cada treino do dia. */}
              <span className="flex shrink-0 flex-col justify-center gap-1">
                {rest
                  ? <span className="h-9 w-1 rounded-full bg-surface-700" />
                  : sessions.map((s, i) => (
                    <span key={i} className={`w-1 flex-1 min-h-[16px] rounded-full ${sessionTone(s.type).dot}`} />
                  ))}
              </span>

              <span className="w-[4.25rem] shrink-0 pt-0.5">
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
                {rest ? (
                  <span className="block text-[15px] font-semibold leading-snug text-surface-400">Descanso</span>
                ) : (
                  sessions.map((s, i) => (
                    <span key={i} className={`flex items-baseline justify-between gap-2 ${i > 0 ? "mt-1" : ""}`}>
                      <span className={`min-w-0 flex-1 text-[15px] font-semibold leading-snug ${
                        faded ? "text-surface-400" : "text-surface-100"
                      }`}>
                        {s.label}
                      </span>
                      {s.metric && (
                        <span className={`shrink-0 text-[13px] font-medium tabular-nums ${
                          faded ? "text-surface-500" : "text-surface-300"
                        }`}>
                          {s.metric}
                        </span>
                      )}
                    </span>
                  ))
                )}
                {progress && <DayState progress={progress} className="mt-1" />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
