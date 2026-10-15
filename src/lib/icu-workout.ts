import { isRepeatBlock, type StructuredWorkout, type WorkoutStep } from "@/types";
import type { PrimarySport } from "@/lib/sports";

/**
 * O treino do Limiar escrito na língua do intervals.icu.
 *
 * ## Por que por aqui
 *
 * "Enviar pro relógio" gerava um `.FIT` e **baixava**. No celular isso é um
 * beco sem saída: o Garmin Connect do telefone não importa treino de arquivo.
 * Só funcionava no computador, em Connect → Treinos → importar — que ninguém
 * faz (Sérgio, 13/10).
 *
 * O que TrainingPeaks, Runna e Final Surge fazem é empurrar o treino para o
 * calendário do Garmin Connect, e o relógio sincroniza sozinho. A porta da
 * Garmin está fechada para apps novos desde 2026 (ADR-12), mas o intervals.icu
 * é parceiro antigo e tem essa porta aberta — e o atleta já está conectado lá
 * pela saúde. Conferido na conta de produção antes de escrever isto:
 *
 * ```
 * icu_garmin_training:        true
 * icu_garmin_upload_workouts: true
 * icu_garmin_last_upload:     2026-09-19T02:10
 * ```
 *
 * Então o Limiar cria um evento no calendário do intervals.icu e ele faz o
 * resto. O `.FIT` continua existindo como saída de computador.
 *
 * ## A sintaxe, e a armadilha dela
 *
 * O intervals.icu lê os passos do **texto da descrição**, uma linha por passo
 * começando com `-`. E tem uma regra que é uma mina:
 *
 * > **`m` significa MINUTOS. Metros se escrevem `mtr`.**
 *
 * Ou seja, `800m` não é um tiro de 800 metros — é um tiro de **800 minutos**.
 * Um treino de 6×800 m viraria oitenta horas de corrida no relógio do atleta.
 * É por isso que a distância aqui nunca é formatada à mão, e `tempoOuDistancia`
 * tem teste para cada caso.
 *
 * As outras regras que o formato impõe:
 *
 *   • Repetição é uma linha `6x` sozinha, com linha em branco antes e depois.
 *     Repetição dentro de repetição não existe.
 *   • Não se mistura alvo de FC com alvo de ritmo no mesmo treino. Como os
 *     nossos passos têm os dois, aqui vale **só o ritmo** — é o que o corredor
 *     persegue, e é o que o motor calcula a partir do VDOT.
 *   • O texto antes da duração vira o nome do passo no relógio.
 */

const SPORT_ICU: Record<PrimarySport, string> = {
  corrida:    "Run",
  ciclismo:   "Ride",
  natacao:    "Swim",
  musculacao: "WeightTraining",
};

export function icuSportType(sport: PrimarySport): string {
  return SPORT_ICU[sport] ?? "Run";
}

/** Como cada tipo de passo se chama no visor. */
const NOME_PASSO: Record<WorkoutStep["kind"], string> = {
  warmup:   "Aquecimento",
  run:      "Forte",
  recovery: "Trote",
  cooldown: "Volta à calma",
};

/**
 * Duração ou distância, na unidade que o intervals.icu entende.
 *
 * **`m` é minuto.** Metro é `mtr`. Trocar os dois manda o atleta correr
 * 800 minutos achando que são 800 metros, então distâncias abaixo de 1 km vão
 * em metros explícitos e o resto em `km`.
 */
export function tempoOuDistancia(step: Pick<WorkoutStep, "distance_km" | "duration_min">): string | null {
  if (step.distance_km != null && step.distance_km > 0) {
    const metros = Math.round(step.distance_km * 1000);
    if (metros < 1000) return `${metros}mtr`;
    // Quilômetro redondo não precisa de casa decimal.
    const km = Math.round(step.distance_km * 100) / 100;
    return Number.isInteger(km) ? `${km}km` : `${km}km`;
  }
  if (step.duration_min != null && step.duration_min > 0) {
    const totalSeg = Math.round(step.duration_min * 60);
    const min = Math.floor(totalSeg / 60);
    const seg = totalSeg % 60;
    if (min === 0) return `${seg}s`;
    return seg === 0 ? `${min}m` : `${min}m${seg}s`;
  }
  return null;
}

/**
 * O alvo de ritmo, traduzido.
 *
 * O motor escreve `6:12–5:48/km`, com travessão e a unidade só no fim. O
 * intervals.icu quer hífen e a unidade dos dois lados, seguida de `Pace`.
 * Travessão é o tipo de detalhe que não quebra nada em teste e devolve um
 * treino sem alvo nenhum no relógio.
 */
export function alvoDeRitmo(pace: string | undefined): string | null {
  if (!pace) return null;
  const limpo = pace.replace(/\s/g, "").replace(/[–—]/g, "-");
  const faixa = limpo.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\/(km|mi)$/);
  if (faixa) return `${faixa[1]}/${faixa[3]}-${faixa[2]}/${faixa[3]} Pace`;
  const unico = limpo.match(/^(\d{1,2}:\d{2})\/(km|mi)$/);
  if (unico) return `${unico[1]}/${unico[2]} Pace`;
  return null;
}

/** Uma linha de passo: `- Forte 800mtr 4:10/km-4:00/km Pace`. */
export function linhaDoPasso(step: WorkoutStep): string | null {
  const medida = tempoOuDistancia(step);
  if (!medida) return null;
  const alvo = alvoDeRitmo(step.pace);
  return `- ${NOME_PASSO[step.kind]} ${medida}${alvo ? ` ${alvo}` : ""}`;
}

/**
 * O treino inteiro como texto.
 *
 * Blocos de repetição ganham linha em branco antes e depois porque é assim que
 * o analisador do intervals.icu separa as seções.
 */
export function icuWorkoutText(structure: StructuredWorkout): string {
  const linhas: string[] = [];

  for (const bloco of structure.blocks) {
    if (isRepeatBlock(bloco)) {
      const passos = bloco.steps.map(linhaDoPasso).filter((l): l is string => l !== null);
      if (passos.length === 0) continue;
      if (linhas.length > 0 && linhas[linhas.length - 1] !== "") linhas.push("");
      linhas.push(`${bloco.repeat}x`, ...passos, "");
      continue;
    }
    const linha = linhaDoPasso(bloco);
    if (linha) linhas.push(linha);
  }

  // Uma linha em branco sobrando no fim o analisador perdoa; duas, não.
  while (linhas[linhas.length - 1] === "") linhas.pop();
  return linhas.join("\n");
}

export interface IcuEvent {
  category: "WORKOUT";
  start_date_local: string;
  type: string;
  name: string;
  description: string;
  target: "PACE";
  /** Nosso identificador, para não criar o mesmo treino duas vezes. */
  external_id: string;
  moving_time?: number;
  distance?: number;
}

/**
 * O evento pronto para o calendário.
 *
 * `external_id` carrega a semana e o dia do plano. É o que permite reenviar um
 * treino que mudou sem empilhar duplicatas no calendário de quem tocou duas
 * vezes — o envio apaga o anterior com o mesmo id antes de criar.
 */
export function icuEventPayload(args: {
  date: string;
  label: string;
  structure: StructuredWorkout;
  sport: PrimarySport;
  weekStart: string;
  day: string;
  distanceKm?: number;
  durationMin?: number;
}): IcuEvent | null {
  const description = icuWorkoutText(args.structure);
  if (!description) return null;
  return {
    category: "WORKOUT",
    start_date_local: `${args.date}T00:00:00`,
    type: icuSportType(args.sport),
    name: args.label,
    description,
    target: "PACE",
    external_id: `limiar-${args.weekStart}-${args.day}`,
    ...(args.durationMin ? { moving_time: Math.round(args.durationMin * 60) } : {}),
    ...(args.distanceKm ? { distance: Math.round(args.distanceKm * 1000) } : {}),
  };
}
