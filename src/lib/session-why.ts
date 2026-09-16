/**
 * Why today's session is the session it is.
 *
 * The engine already knows all of this — it picked the kind of hard work from
 * the athlete's position in the four-week block, sized the long run as a share
 * of the week, and held the easy days easy on purpose. None of that reasoning
 * ever reached the athlete, so a plan that is in fact carefully argued arrives
 * looking like a spreadsheet that happens to contain numbers.
 *
 * One sentence per session. Not a lesson — a reason. The difference between an
 * app that prescribes and a coach who teaches is mostly this sentence, and it
 * costs nothing to say because the decision was made anyway.
 */
import type { WeeklyPlanDay } from "@/types";
import { CYCLE_WEEKS } from "@/lib/mesocycle";

export interface WhyContext {
  /** 1..4 — position in the four-week block. */
  cycleWeek?: number | null;
  /** Total running volume planned for the week, km. */
  weeklyKm?: number | null;
  /** Whether this week is the block's cutback. */
  isRecovery?: boolean;
}

/**
 * The reason, in one sentence.
 *
 * Returns null when there is nothing worth saying — a sentence that states the
 * obvious ("rest day because you rest") is worse than silence, because it
 * teaches the athlete to skip the line where the real reasons also appear.
 */
export function sessionWhy(day: WeeklyPlanDay, ctx: WhyContext = {}): string | null {
  const week = ctx.cycleWeek ?? null;
  const km = day.distance_km ?? null;

  if (day.type === "rest") {
    return ctx.isRecovery
      ? "Semana de recuo: o ganho das três anteriores aparece agora, no descanso."
      : null;
  }

  if (day.type === "test") {
    return "Primeira semana do bloco, perna descansada — testar cansado mede fadiga, não forma.";
  }

  if (day.type === "long_run") {
    const share = km && ctx.weeklyKm ? Math.round((km / ctx.weeklyKm) * 100) : null;
    if (ctx.isRecovery) {
      return "Longão encurtado: numa semana de recuo ele cai junto com o resto.";
    }
    return share
      ? `Cerca de ${share}% do volume da semana — a fatia que constrói resistência sem custar a semana seguinte.`
      : "O tempo em pé é o que constrói resistência. Ritmo confortável do início ao fim.";
  }

  if (day.type === "easy" || day.type === "recovery") {
    return "Leve de propósito: é o volume fácil que constrói a base, e acelerar aqui custa o treino forte da semana.";
  }

  if (day.type === "strength") {
    return null;   // The lifting card already says what it is for.
  }

  /*
   * Quality work. The label already names the session; what it does not say is
   * why *this* kind today — and that answer is the athlete's position in the
   * block, which is otherwise invisible to them.
   */
  const label = (day.label ?? "").toLowerCase();

  if (label.includes("denso")) {
    return `Terceira semana do bloco: mesma distância de tiro, menos trote entre eles. ` +
      `A recuperação encurtada é o que aumenta o estímulo sem adicionar volume forte.`;
  }
  if (label.includes("tiros curtos") || label.includes("200")) {
    return "Velocidade pura, com recuperação completa: treina giro de pernas e economia, não fôlego.";
  }
  if (label.includes("subida")) {
    return "Força específica: a ladeira produz tensão alta com velocidade baixa, então o custo articular é uma fração do plano.";
  }
  if (label.includes("fartlek")) {
    return "Trocar de marcha e se recuperar correndo — o que uma prova cobra e o tiro com parada nunca ensaia.";
  }
  if (label.includes("progressivo")) {
    return "Termina em limiar depois de começar leve: ensina o controle de ritmo que decide a segunda metade de uma prova.";
  }
  if (label.includes("tempo")) {
    return "Ritmo de limiar é o que você sustentaria por cerca de uma hora — é o treino que mais move o VDOT.";
  }
  if (label.includes("leve +") || label.includes("tiros curtos")) {
    return "Semana de recuo, mas não sem velocidade: tiros curtos mantêm a mecânica rápida sem gerar fadiga.";
  }
  if (label.includes("teste")) {
    return "Perna descansada — testar cansado mede fadiga, não forma.";
  }

  if (week && week >= 1 && week <= CYCLE_WEEKS) {
    return `Semana ${week} de ${CYCLE_WEEKS} do bloco. O treino forte muda de tipo a cada semana ` +
      `para o estímulo não virar rotina.`;
  }
  return null;
}
