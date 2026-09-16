/**
 * Saying what CTL, ATL and TSB actually mean for the person reading them.
 *
 * The card showed three numbers and a chart. "Fitness 42, Fadiga 51, Forma −9"
 * is precise and useless: nothing on screen said whether −9 was good, what it
 * was measuring, or what to do about it. Numbers without a sentence are a
 * dashboard for someone who already knows.
 *
 * The definitions are the standard exponentially-weighted ones:
 *   CTL — average training load over ~42 days. Fitness, slow to build, slow to
 *         lose. This is the number that goes up over a season.
 *   ATL — the same over ~7 days. Fatigue: what this week did to you.
 *   TSB — CTL minus ATL. Form: how fresh you are relative to your own fitness.
 *         Positive means rested, negative means you are carrying work.
 *
 * Deliberately not advice about a specific session — that is the advisor's job,
 * and it has the plan in front of it. This explains the instrument.
 */

export interface LoadReading {
  ctl: number;
  atl: number;
  tsb: number;
}

export interface LoadExplanation {
  /** One sentence on where the athlete stands. */
  headline: string;
  /** What to do with that, in plain terms. */
  advice:   string;
  /** Per-number definitions, for the athlete who has never seen CTL before. */
  glossary: Array<{ term: string; label: string; text: string }>;
  /** Which of the six bands the form sits in, for styling and testing. */
  band: "muito_descansado" | "descansado" | "equilibrio" | "treinando" | "fatigado" | "overreaching";
  /** True while there is not enough history for the numbers to mean much. */
  warmingUp: boolean;
}

export const LOAD_GLOSSARY = [
  {
    term: "CTL",
    label: "Fitness",
    text: "A média do seu treino nas últimas ~6 semanas. Sobe devagar e cai devagar — " +
      "é o que você construiu, não o que fez ontem.",
  },
  {
    term: "ATL",
    label: "Fadiga",
    text: "A mesma conta, mas dos últimos 7 dias. Reage rápido: uma semana forte " +
      "levanta, três dias parados derrubam.",
  },
  {
    term: "TSB",
    label: "Forma",
    text: "Fitness menos fadiga. Positivo é descanso acumulado, negativo é trabalho " +
      "acumulado. É o número que diz se hoje você rende.",
  },
] as const;

/**
 * The bands.
 *
 * Ranges follow the convention used in the training-load literature: around
 * zero is sustainable training, deeply negative is a block you should be
 * finishing rather than starting, and strongly positive is race-ready — or a
 * warning that the last few weeks were quieter than you think.
 */
export function explainLoad(reading: LoadReading, opts: { daysOfData?: number } = {}): LoadExplanation {
  const { ctl, atl, tsb } = reading;
  const warmingUp = (opts.daysOfData ?? 999) < 28;

  const band = bandOf(tsb);
  const rounded = Math.round(tsb);
  const sinal = rounded > 0 ? `+${rounded}` : `${rounded}`;

  const headline = warmingUp
    ? `Ainda faltam semanas de histórico para estes números significarem muito — eles se firmam depois de um mês treinando com o app.`
    : HEADLINE[band](sinal, Math.round(ctl), Math.round(atl));

  return {
    headline,
    advice: warmingUp ? ADVICE.equilibrio : ADVICE[band],
    glossary: LOAD_GLOSSARY.map(g => ({ ...g })),
    band,
    warmingUp,
  };
}

function bandOf(tsb: number): LoadExplanation["band"] {
  if (tsb >  15) return "muito_descansado";
  if (tsb >   5) return "descansado";
  if (tsb >  -5) return "equilibrio";
  if (tsb > -20) return "treinando";
  if (tsb > -35) return "fatigado";
  return "overreaching";
}

/*
 * Two short sentences: what the state is, and what to do about it.
 *
 * The old copy ran to four lines and repeated the numbers printed directly
 * above it — "fadiga (22) e fitness (18) andando juntos" restates two cards the
 * eye has already read — then followed with a second paragraph saying much the
 * same thing again. It explained; it did not advise.
 *
 * A coach says the state and the next move. Anything longer is a textbook, and
 * a textbook on a dashboard goes unread.
 */
const HEADLINE: Record<LoadExplanation["band"], (sinal: string, ctl: number, atl: number) => string> = {
  muito_descansado: s =>
    `Forma ${s}: descansado para prova — e descansado demais para construir.`,
  descansado: s =>
    `Forma ${s}: fresco. É assim que se chega numa prova ou num teste.`,
  equilibrio: s =>
    `Forma ${s}: fadiga e condicionamento em equilíbrio.`,
  treinando: s =>
    `Forma ${s}: carregando trabalho, como se espera dentro de um bloco.`,
  fatigado: s =>
    `Forma ${s}: fadiga alta. Sustentável por uma ou duas semanas, não por um mês.`,
  overreaching: s =>
    `Forma ${s}: no vermelho — o treino já custa mais recuperação do que entrega.`,
};

const ADVICE: Record<LoadExplanation["band"], string> = {
  muito_descansado:
    "Se tem prova à vista, está no ponto. Se não tem, volte a subir volume — o condicionamento escorre depois de duas semanas leves.",
  descansado:
    "Bom dia para uma prova, um teste de 3 km ou um treino forte de verdade.",
  equilibrio:
    "Siga o plano. É daqui que sai progresso mês após mês.",
  treinando:
    "Mantenha os dias leves realmente leves — é isso que vira ganho.",
  fatigado:
    "Priorize sono e um dia regenerativo.",
  overreaching:
    "Reduza agora: um ou dois dias de descanso, ou uma semana leve.",
};
;
