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

/**
 * A semana em uma linha: "3 corridas · 21 km · 2 sessões de musculação".
 *
 * O cabeçalho dizia o período e mais nada — "Sua semana, 21 a 27 de set" —
 * enquanto o atleta tinha que somar os sete dias de cabeça para saber se a
 * semana era grande ou pequena. Os números saem das mesmas sessões que a
 * agenda mostra, então resumo e lista nunca discordam.
 *
 * A distância vai arredondada: o total da semana é uma ordem de grandeza,
 * não uma medição (decisão do Sérgio, 20/09).
 */
export function weekSummaryLine(days: WeeklyPlanDay[]): string | null {
  let runs = 0, km = 0, strength = 0, others = 0;

  for (const day of days) {
    for (const s of plannedSessionsOf(day)) {
      if (s.sport === "musculacao") { strength++; continue; }
      if (s.sport === "corrida") { runs++; km += day.distance_km ?? 0; continue; }
      others++;
    }
  }

  const parts: string[] = [];
  if (runs > 0) parts.push(`${runs} ${runs === 1 ? "corrida" : "corridas"}`);
  if (km > 0) parts.push(`${Math.round(km)} km`);
  if (strength > 0) parts.push(`${strength} ${strength === 1 ? "sessão" : "sessões"} de musculação`);
  if (others > 0) parts.push(`${others} ${others === 1 ? "treino" : "treinos"} de outro esporte`);

  return parts.length > 0 ? parts.join(" · ") : null;
}
