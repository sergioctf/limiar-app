/**
 * As linhas de um dia na agenda da semana.
 *
 * A grade antiga mostrava o rótulo cortado em seis letras ("Tiros c…") e um
 * emoji, então a única forma de saber o que era quinta-feira era tocar em
 * quinta-feira. Uma semana que só se entende dia a dia não é uma semana.
 *
 * Duas decisões do Sérgio (26/09) moram aqui:
 *
 * 1. **Cada sessão é uma linha, no mesmo estilo.** A musculação aparecia como
 *    um rabicho cinza ("+ musculação") embaixo da corrida, sem a sua duração,
 *    enquanto num dia só dela virava treino de verdade com "50 min" ao lado. A
 *    mesma sessão não pode valer menos por dividir o dia.
 * 2. **Na agenda o treino tem nome curto.** "Tiros curtos 6×200 m" não cabe em
 *    330 px, e o que a lista precisa responder é "que tipo de dia é esse?". O
 *    nome inteiro está a um toque, no card.
 *
 * As sessões vêm de `plannedSessionsOf`, a mesma origem que a Hoje e a adesão
 * usam — um dia com corrida e musculação é dois treinos em toda tela.
 */
import { plannedSessionsOf } from "@/lib/day-status";
import { sessionTone } from "@/lib/session-colors";
import type { WeeklyPlanDay } from "@/types";

export interface AgendaSession {
  /** "Tiro", "Rodagem leve", "Musculação". */
  label: string;
  /** "8 km", "50 min" — nunca um parágrafo. */
  metric: string | null;
  /** O tipo da sessão, para a linha receber a cor certa. */
  type: string;
}

export interface AgendaLine {
  /** Uma entrada por sessão do dia; vazia quando o dia é de descanso. */
  sessions: AgendaSession[];
  /** O dia não tem nada marcado. */
  rest: boolean;
}

const km = (n: number) => `${Number(n.toFixed(1)).toString().replace(".", ",")} km`;

/**
 * Os tipos cujo nome do plano é longo demais para a lista.
 *
 * Um treino de tiro vem do motor como "Tiros curtos 6×200 m" ou "5 × 1 km
 * forte": preciso no card, ilegível numa linha de 330 px que ainda precisa
 * mostrar a distância. Nestes casos a agenda usa o nome do tipo — "Tiro",
 * "Limiar" —, que é a pergunta que a lista responde.
 */
const SHORTEN = new Set(["intervals", "tempo", "hiit"]);

function shortLabel(type: string, label: string): string {
  if (!SHORTEN.has(type)) return label;
  return sessionTone(type).label;
}

export function agendaLine(day: WeeklyPlanDay): AgendaLine {
  const sessions = plannedSessionsOf(day);
  if (sessions.length === 0) return { sessions: [], rest: true };

  return {
    rest: false,
    sessions: sessions.map((s, i) => ({
      label: shortLabel(s.type, s.label),
      type: s.type,
      // A primeira sessão manda no dia, então a medida do dia é dela; as outras
      // trazem a sua própria (a musculação, os seus minutos).
      metric: i === 0
        ? (day.distance_km != null ? km(day.distance_km)
          : day.duration_min != null ? `${day.duration_min} min`
            : s.detail)
        : s.detail,
    })),
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
