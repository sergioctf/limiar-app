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
 *
 * **Hoje e selecionado são coisas diferentes** e não podem se parecer: hoje é
 * um fato (a etiqueta na data, laranja), selecionado é onde você está olhando
 * (o fundo e a borda). Abrir domingo não pode apagar que quinta é hoje.
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
    <ul className="space-y-0.5">
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
                // Altura mínima folgada, e mais alta ainda quando o dia tem
                // duas sessões: a segunda linha não pode espremer a primeira.
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
                  O nome do treino não é cortado.

                  "Tiros curtos 6×200 m" virava "Tiros curtos 6×20…", que é a
                  informação mais importante da linha perdendo para a largura.
                  Em duas linhas cabe; em três, aí sim reticências.
                */}
                <span className={`block line-clamp-2 text-[15px] font-semibold leading-snug ${isRest ? "text-surface-400" : "text-surface-100"}`}>
                  {main}
                </span>
                {extra && (
                  <span className="mt-0.5 block truncate text-xs text-surface-400">+ {extra}</span>
                )}
              </span>

              {metric && (
                <span className="shrink-0 text-[13px] font-medium tabular-nums text-surface-300">{metric}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
