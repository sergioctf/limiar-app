/**
 * A cor de cada tipo de sessão, definida uma vez.
 *
 * O Treinador já pintava o plano assim — rodagem verde, tiro vermelho, longão
 * roxo — e a linguagem pegou: o Sérgio lê o tipo do treino pela cor antes de
 * ler o nome. Só que o mapa morava dentro de `WeeklyPlanCard.tsx`, junto com os
 * ícones, então nenhuma outra tela podia falar a mesma língua.
 *
 * Aqui ficam só as cores (sem JSX), para a Hoje e o Treinador combinarem.
 *
 * Onde **não** usar: em "Minha semana", na Home. Lá a cor já quer dizer outra
 * coisa — feito, previsto, não feito — e duas gramáticas de cor no mesmo bloco
 * não se somam, se anulam (decisão do Sérgio, 20/09).
 */
export interface SessionTone {
  /** Fundo do bloco do ícone. */
  bg: string;
  border: string;
  text: string;
  /** Bolinha de legenda. */
  dot: string;
  /** Como chamar esse tipo em uma palavra. */
  label: string;
}

export const SESSION_TONES: Record<string, SessionTone> = {
  rest:      { bg: "bg-surface-700/40", border: "border-surface-600/60", text: "text-surface-400", dot: "bg-surface-500", label: "Descanso" },
  easy:      { bg: "bg-green-500/10",   border: "border-green-500/30",   text: "text-green-400",   dot: "bg-green-500",   label: "Rodagem" },
  recovery:  { bg: "bg-cyan-500/10",    border: "border-cyan-500/30",    text: "text-cyan-400",    dot: "bg-cyan-500",    label: "Regenerativo" },
  tempo:     { bg: "bg-yellow-500/10",  border: "border-yellow-500/30",  text: "text-yellow-400",  dot: "bg-yellow-500",  label: "Limiar" },
  intervals: { bg: "bg-red-500/10",     border: "border-red-500/30",     text: "text-red-400",     dot: "bg-red-400",     label: "Tiro" },
  long_run:  { bg: "bg-purple-500/10",  border: "border-purple-500/30",  text: "text-purple-400",  dot: "bg-purple-500",  label: "Longão" },
  test:      { bg: "bg-pink-500/10",    border: "border-pink-500/30",    text: "text-pink-400",    dot: "bg-pink-500",    label: "Teste" },
  race:      { bg: "bg-brand-500/15",   border: "border-brand-500/40",   text: "text-brand-400",   dot: "bg-brand-500",   label: "Prova" },
  /*
    Musculação é azul.

    Era cinza, e no Treinador o card dela vinha pintado de roxo à mão — a mesma
    cor do longão. Duas coisas muito diferentes com a mesma cor, na mesma tela,
    é pior do que não ter cor nenhuma (Sérgio, 26/09). Azul não é usado por
    nenhum tipo de corrida.
  */
  strength:  { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300", dot: "bg-blue-400", label: "Musculação" },
  hiit:      { bg: "bg-amber-500/10",  border: "border-amber-500/30",  text: "text-amber-400",  dot: "bg-amber-500",  label: "HIIT" },
};

export function sessionTone(type: string | null | undefined): SessionTone {
  return SESSION_TONES[type ?? ""] ?? SESSION_TONES.easy;
}
