/**
 * Encolher a sessão de musculação sem descaracterizá-la.
 *
 * A corrida tem "Adaptar este treino" desde 09/26 — menos tempo, corpo pedindo
 * calma, chuva. A musculação não tinha nada: ou dava a hora inteira, ou o
 * atleta simplesmente não ia. E "não fui" é a pior adaptação de todas, porque
 * some do plano e o motor nunca fica sabendo por quê.
 *
 * Duas formas de ceder, e as duas preservam o que a sessão existe para fazer:
 *
 * - **menos tempo**: saem os acessórios do fim, nunca o composto principal, e
 *   só então caem séries. Meia hora de agachamento e terra é um treino; meia
 *   hora de rosca e abdominal é uma visita à academia.
 * - **mais leve**: uma série a menos e uma repetição a mais em reserva. A
 *   mesma sessão, com menos custo — é o que um treinador faria num dia ruim.
 *
 * O que estas funções **não** fazem é crescer. Aumentar a sessão exige
 * escolher exercícios do catálogo com os equipamentos e as preferências do
 * atleta, e isso é trabalho do gerador (`strength-builder.ts`), não de um
 * ajuste feito de pé na academia.
 */
import type { StrengthSession, StrengthExercisePrescription } from "@/lib/strength-builder";

/** A mesma conta do gerador: trabalho + descanso, em minutos. */
function setMinutes(restSeconds: number, timeBased: boolean): number {
  const work = timeBased ? 45 : 40;
  return (work + restSeconds) / 60;
}

function costOf(ex: StrengthExercisePrescription): number {
  return ex.sets * setMinutes(ex.restSeconds, ex.timeBased) * (ex.unilateral ? 1.6 : 1);
}

/** Quanto a sessão custa hoje, contando o cardio que vier junto. */
export function sessionMinutes(session: StrengthSession): number {
  const lifting = session.exercises.reduce((sum, ex) => sum + costOf(ex), 0);
  return Math.round(lifting + (session.cardio?.minutes ?? 0));
}

/**
 * A duração que a tela mostra para esta sessão.
 *
 * A guardada no plano, quando existe: é ela que aparece no card e na agenda, e
 * duas durações diferentes para o mesmo treino na mesma tela é pior do que
 * qualquer imprecisão. Para planos antigos, sem o número, vale a conta.
 */
export function displayMinutes(session: StrengthSession): number {
  return session.estimatedMinutes > 0 ? session.estimatedMinutes : sessionMinutes(session);
}

/** Os tamanhos que fazem sentido oferecer para esta sessão — só menores. */
export function shorterOptions(session: StrengthSession): number[] {
  const now = displayMinutes(session);
  return [50, 40, 30, 20].filter(m => m < now - 4);
}

/**
 * A sessão em até `minutes` minutos.
 *
 * Ordem: tira acessórios do fim (nunca abaixo de três exercícios, nunca o
 * principal), depois corta séries dos acessórios até duas, e por último do
 * principal até três. Se ainda não couber, devolve o menor treino honesto que
 * conseguiu — prometer 20 minutos e entregar 26 é melhor do que devolver meia
 * sessão sem composto.
 */
export function fitToMinutes(session: StrengthSession, minutes: number): StrengthSession {
  const budget = Math.max(10, minutes) - (session.cardio?.minutes ?? 0);
  let exercises = session.exercises.map(ex => ({ ...ex }));

  const total = () => exercises.reduce((sum, ex) => sum + costOf(ex), 0);

  // 1. Acessórios do fim para fora.
  for (let i = exercises.length - 1; i >= 0 && total() > budget && exercises.length > 3; i--) {
    if (exercises[i].main) continue;
    exercises.splice(i, 1);
  }

  // 2. Séries dos acessórios.
  for (let pass = 0; pass < 2 && total() > budget; pass++) {
    for (let i = exercises.length - 1; i >= 0 && total() > budget; i--) {
      const ex = exercises[i];
      if (ex.main || ex.sets <= 2) continue;
      ex.sets -= 1;
    }
  }

  // 3. E, no limite, do principal.
  for (const ex of exercises) {
    while (ex.main && ex.sets > 3 && total() > budget) ex.sets -= 1;
  }

  const next = { ...session, exercises };
  return { ...next, estimatedMinutes: sessionMinutes(next) };
}

/**
 * A mesma sessão, mais leve: uma série a menos (mínimo duas) e uma repetição a
 * mais em reserva (máximo quatro — além disso não é mais treino de força).
 */
export function lighten(session: StrengthSession): StrengthSession {
  const exercises = session.exercises.map(ex => ({
    ...ex,
    sets: Math.max(2, ex.sets - 1),
    rir: Math.min(4, ex.rir + 1),
  }));
  const next = { ...session, exercises, deloaded: true };
  return { ...next, estimatedMinutes: sessionMinutes(next) };
}
