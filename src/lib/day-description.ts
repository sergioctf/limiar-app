/**
 * O texto de um dia do plano — derivado do dia, não guardado nele.
 *
 * A descrição da corrida terminava com uma frase sobre a musculação do mesmo
 * dia ("Depois, idealmente ~6 h depois, musculação: peito"), **gravada** no
 * texto quando o plano nascia. O problema aparece quando a corrida muda de dia,
 * e há quatro caminhos para isso: reorganizar a semana, mover a sessão, adaptar
 * o treino e o chat. Três removiam a cauda ao mover; o quarto não — e a frase
 * viajava, passando a descrever a musculação de outro dia.
 *
 * Foi o que o Sérgio viu em 24/09: quinta-feira dizia "musculação: peito" com
 * agachamento, terra e búlgaro na sessão. "Peito" era a segunda-feira.
 *
 * Aqui a frase deixa de ser texto guardado e passa a ser calculada a partir da
 * sessão que está naquele dia. Uma origem só: se a sessão mudou de lugar, a
 * frase muda junto, porque ela é a sessão sendo lida em voz alta.
 */
import { MUSCLE_LABEL, type MuscleGroup } from "@/lib/exercises";
import type { WeeklyPlanDay } from "@/types";

/** As duas formas que a cauda já teve gravada em planos antigos. */
const LEGACY_TAILS = [" Depois (idealmente", " Depois, musculação:"];

/** O texto da corrida, sem qualquer cauda de musculação que tenha ficado gravada. */
export function stripStrengthTail(description: string): string {
  let out = description;
  for (const marker of LEGACY_TAILS) {
    const i = out.indexOf(marker);
    if (i >= 0) out = out.slice(0, i);
  }
  return out.trim();
}

/**
 * A frase sobre a musculação do mesmo dia — ou null quando não cabe.
 *
 * Não cabe em duas situações: o dia não tem musculação, ou a musculação **é** o
 * treino do dia (aí "depois, musculação" não quer dizer nada).
 */
export function strengthTail(day: Pick<WeeklyPlanDay, "strength" | "sport" | "type">): string | null {
  const session = day.strength;
  if (!session) return null;
  if (day.type === "strength" || day.sport === "musculacao") return null;

  const muscles = ((session as { muscles?: MuscleGroup[] }).muscles ?? [])
    .map(m => MUSCLE_LABEL[m])
    .filter(Boolean);

  // Sem os músculos (sessão de um plano antigo), diz o que se sabe de verdade.
  const what = muscles.length > 0
    ? muscles.join(", ").toLowerCase()
    : `${session.exercises.length} exercícios`;

  return `Depois (idealmente ~6 h depois), musculação: ${what}.`;
}

/** O que a tela mostra: a descrição do treino, mais a musculação do dia. */
export function describeDay(day: Pick<WeeklyPlanDay, "description" | "strength" | "sport" | "type">): string {
  const base = stripStrengthTail(day.description ?? "");
  const tail = strengthTail(day);
  return tail ? `${base} ${tail}`.trim() : base;
}
