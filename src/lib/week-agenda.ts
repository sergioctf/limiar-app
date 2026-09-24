/**
 * A linha de um dia na agenda da semana.
 *
 * A grade antiga mostrava o rótulo cortado em seis letras ("Tiros c…") e um
 * emoji, então a única forma de saber o que era quinta-feira era tocar em
 * quinta-feira. Uma semana que só se entende dia a dia não é uma semana.
 *
 * Aqui o dia vira uma frase: o treino que manda ("Corrida leve"), o que vem
 * junto ("+ musculação") e a medida do dia ("8 km"). As sessões vêm de
 * `plannedSessionsOf`, a mesma origem que a Hoje e a adesão usam — um dia com
 * corrida e musculação é dois treinos em toda tela, não um em cada.
 */
import { plannedSessionsOf } from "@/lib/day-status";
import type { WeeklyPlanDay } from "@/types";

export interface AgendaLine {
  /** O treino que manda no dia — ou "Descanso". */
  main: string;
  /** O que mais acontece no mesmo dia, já em minúsculas: "musculação". */
  extra: string | null;
  /** "8 km", "40 min" — nunca um parágrafo. */
  metric: string | null;
}

const km = (n: number) => `${Number(n.toFixed(1)).toString().replace(".", ",")} km`;

export function agendaLine(day: WeeklyPlanDay): AgendaLine {
  const sessions = plannedSessionsOf(day);
  if (sessions.length === 0) return { main: "Descanso", extra: null, metric: null };

  const [first, ...rest] = sessions;

  // A medida do dia é a da sessão que manda; num dia só de musculação, é a
  // dela — que `plannedSessionsOf` já calculou em minutos.
  const metric = day.distance_km != null
    ? km(day.distance_km)
    : day.duration_min != null ? `${day.duration_min} min`
      : first.detail;

  return {
    main: first.label,
    extra: rest.length > 0 ? rest.map(s => s.label.toLowerCase()).join(" + ") : null,
    metric: metric ?? null,
  };
}
