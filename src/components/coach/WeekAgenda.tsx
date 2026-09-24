"use client";

/**
 * A semana como agenda — sete linhas, com o nome de cada sessão.
 *
 * Antes eram sete caixinhas coloridas de 40 px, com o rótulo cortado em seis
 * letras ("Tiros c…") e um emoji. Para saber o que era quinta-feira, tocava-se
 * em quinta-feira. Uma semana que só se entende tocando dia a dia não é uma
 * semana: é um menu.
 *
 * Agora a linha diz o que o dia é — "Corrida leve + musculação" — e a cor volta
 * a ser o que cor deve ser: um marcador ao lado, não uma caixa grande
 * disputando atenção com as outras seis.
 *
 * A lista é a mesma no computador e no celular. No computador ela fica à
 * esquerda e o dia aberto à direita, então a semana nunca sai da vista.
 */
import { sessionTone } from "@/lib/session-colors";
import { agendaLine } from "@/lib/week-agenda";
import { DAY_SHORT_PT, dateOfWeekDay } from "@/lib/week";
import type { WeeklyPlanDay } from "@/types";

export function WeekAgenda({
  days, weekStart, todayKey, selectedDay, onSelect,
}: {
  days: WeeklyPlanDay[];
  weekStart: string;
  /** Null na próxima semana: nenhum dia dela é hoje. */
  todayKey: WeeklyPlanDay["day"] | null;
  selectedDay: WeeklyPlanDay | null;
  onSelect: (day: WeeklyPlanDay) => void;
}) {
  return (
    <ul className="space-y-1">
      {days.map(day => {
        const tone = sessionTone(day.type);
        const isToday = day.day === todayKey;
        const isSelected = selectedDay?.day === day.day;
        const { main, extra, metric } = agendaLine(day);
        const isRest = day.type === "rest";

        return (
          <li key={day.day}>
            <button
              type="button"
              onClick={() => onSelect(day)}
              aria-current={isSelected ? "true" : undefined}
              className={[
                "flex w-full min-h-[52px] items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                isSelected
                  ? "border-brand-500/50 bg-surface-700/60"
                  : "border-transparent bg-surface-800/60 hover:border-surface-700 hover:bg-surface-700/40",
              ].join(" ")}
            >
              {/* A cor é um marcador, não uma caixa. */}
              <span className={`h-8 w-1 shrink-0 rounded-full ${isRest ? "bg-surface-700" : tone.dot}`} />

              <span className="w-14 shrink-0">
                <span className={`block text-xs font-bold uppercase tracking-wide ${isToday ? "text-brand-400" : "text-surface-400"}`}>
                  {DAY_SHORT_PT[day.day] ?? day.day}
                </span>
                <span className={`block text-[11px] leading-none ${isToday ? "text-brand-400/80" : "text-surface-500"}`}>
                  {dateOfWeekDay(weekStart, day.day) ?? ""}
                  {isToday && <span className="ml-1 font-semibold">hoje</span>}
                </span>
              </span>

              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-semibold ${isRest ? "text-surface-500" : "text-surface-100"}`}>
                  {main}
                </span>
                {extra && (
                  <span className="block truncate text-[11px] text-surface-500">+ {extra}</span>
                )}
              </span>

              {metric && (
                <span className="shrink-0 text-xs tabular-nums text-surface-400">{metric}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
