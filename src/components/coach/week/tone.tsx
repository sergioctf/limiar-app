/**
 * O vocabulário visual da semana, num lugar só.
 *
 * Cor, ícone, e como chamar cada coisa. Estava tudo dentro de
 * `WeeklyPlanCard.tsx`, que por isso era o único arquivo capaz de desenhar uma
 * sessão — e foi assim que ele chegou a mil linhas.
 *
 * As cores vêm de `session-colors.ts` porque a Hoje fala a mesma língua
 * (rodagem verde, tiro vermelho, longão roxo); os ícones ficam aqui, porque só
 * o Treinador usa esse desenho.
 */
import {
  Moon, Wind, Timer, Repeat, Zap, Trophy, FlaskConical, Dumbbell,
} from "lucide-react";
import { sessionTone } from "@/lib/session-colors";

export interface TypeStyle {
  bg: string; border: string; text: string; dot: string;
  /** Como chamar esse tipo em uma palavra: "Rodagem", "Tiro", "Longão". */
  label: string;
  icon: React.ReactNode;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  rest:      <Moon         className="h-3.5 w-3.5" />,
  easy:      <Wind         className="h-3.5 w-3.5" />,
  recovery:  <Wind         className="h-3.5 w-3.5" />,
  tempo:     <Timer        className="h-3.5 w-3.5" />,
  intervals: <Repeat       className="h-3.5 w-3.5" />,
  long_run:  <Zap          className="h-3.5 w-3.5" />,
  test:      <FlaskConical className="h-3.5 w-3.5" />,
  race:      <Trophy       className="h-3.5 w-3.5" />,
  strength:  <Dumbbell     className="h-3.5 w-3.5" />,
  hiit:      <Dumbbell     className="h-3.5 w-3.5" />,
};

export function typeStyle(type: string): TypeStyle {
  const tone = sessionTone(type);
  return { ...tone, icon: TYPE_ICONS[type] ?? TYPE_ICONS.easy };
}

/**
 * O nome do botão que abre o passo a passo, conforme o treino.
 *
 * Um sistema que chama "série" o que é uma rodagem contínua parece inacabado,
 * mesmo quando o conteúdo por trás está certo.
 */
const SERIES_TYPES = new Set(["intervals", "tempo", "hiit", "test", "race"]);

export function structureTitle(type: string): string {
  return SERIES_TYPES.has(type) ? "Ver as séries" : "Ver a estrutura";
}

export function structureSummary(blocks: number): string {
  return blocks > 1
    ? `${blocks} blocos · exportar para o relógio`
    : "Passo a passo · exportar para o relógio";
}

/** "21 a 27 de set" — o intervalo da semana como se fala. */
export function formatWeekRange(mondayStr: string): string {
  const mon = new Date(mondayStr + "T12:00:00");
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  if (mon.getMonth() === sun.getMonth()) {
    return `${mon.getDate()} a ${sun.getDate()} de ${months[mon.getMonth()]}`;
  }
  return `${mon.getDate()} ${months[mon.getMonth()]} – ${sun.getDate()} ${months[sun.getMonth()]}`;
}
