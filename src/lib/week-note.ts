/**
 * O recado do treinador sobre a semana — e a trava que impede ele de inventar.
 *
 * O recado é escrito pela IA (ADR-02: o motor prescreve, a IA narra). Em
 * 21/09, a semana de 28/09 do Sérgio era de recuperação, 14 km em 3 + 3 + 8, e
 * o recado disse *"mantenha a corrida curta (6 km)"* e *"antes de aumentar o
 * volume total para 20 km"*. Dois números fora do plano, nenhuma palavra sobre
 * recuperação — e o prompt já proibia distâncias. O modelo escreveu assim mesmo.
 *
 * Regra em prompt é pedido, não garantia. A garantia fica aqui:
 *
 *   1. A IA recebe os fatos da semana — incluindo se ela é de recuperação.
 *   2. Todo número em quilômetros que o recado citar precisa ser um desses
 *      fatos (`noteRespectsPlan`).
 *   3. Se não for, o recado da IA é descartado e entra o do motor
 *      (`fallbackWeekNote`), que só diz o que o plano tem.
 */

export interface WeekNoteFacts {
  weeklyKm: number;
  /** A quarta semana do bloco, mais leve por desenho. */
  isRecovery: boolean;
  /** 1–4 dentro do bloco, quando se sabe. */
  cycleWeek: number | null;
  /** As corridas da semana, como o plano as montou. */
  sessions: Array<{ label: string; km: number }>;
  /** O que a semana anterior pediu — referência legítima para comparar. */
  previousPlannedKm: number | null;
}

const km = (n: number) => `${Number(n.toFixed(1)).toString().replace(".", ",")} km`;

/** Os únicos números em km que o recado pode citar. */
export function allowedWeekNumbers(f: WeekNoteFacts): number[] {
  const out = [f.weeklyKm, ...f.sessions.map(s => s.km)];
  if (f.previousPlannedKm != null) out.push(f.previousPlannedKm);
  return out.filter(n => Number.isFinite(n) && n > 0);
}

/**
 * Todo número seguido de "km" (ou "quilômetros") no recado está entre os
 * permitidos? Aceita vírgula e ponto, e meio quilômetro de arredondamento —
 * "21 km" para uma semana de 20,6 é o motor sendo lido, não inventado.
 */
export function noteRespectsPlan(note: string, allowed: number[]): boolean {
  const cited = Array.from(note.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:km|quil[ôo]metros?)\b/gi))
    .map(m => Number(m[1].replace(",", ".")));
  return cited.every(n => allowed.some(a => Math.abs(a - n) <= 0.5));
}

/**
 * O recado que o motor escreve quando o da IA não passa.
 *
 * Seco de propósito: é melhor um recado curto e verdadeiro do que um bonito com
 * um número que o plano não tem.
 */
export function fallbackWeekNote(f: WeekNoteFacts): string {
  const runs = f.sessions.filter(s => s.km > 0);
  const longest = runs.reduce<{ label: string; km: number } | null>((a, s) => (!a || s.km > a.km ? s : a), null);

  if (f.isRecovery) {
    const drop = f.previousPlannedKm && f.previousPlannedKm > f.weeklyKm
      ? ` — abaixo dos ${km(f.previousPlannedKm)} da semana anterior de propósito`
      : "";
    return `Semana de recuperação, a quarta do bloco: ${km(f.weeklyKm)} no total${drop}. ` +
      "É quando o corpo absorve as três semanas anteriores; correr leve aqui é o treino, não a falta dele.";
  }

  const long = longest ? `, com o longão de ${km(longest.km)} como sessão principal` : "";
  return `${km(f.weeklyKm)} de corrida esta semana${long}. ` +
    "Se as pernas chegarem pesadas no treino forte, reduza o ritmo antes de reduzir a distância.";
}
