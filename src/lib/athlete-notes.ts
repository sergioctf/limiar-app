/**
 * A memória do treinador, e até quando cada lembrança vale.
 *
 * O chat do plano extrai notas da conversa para usar nas semanas seguintes
 * ("prefere treinar de manhã", "dor no joelho acima de 10 km"). Até 21/09 toda
 * nota era eterna — e o chat é, quase sempre, uma conversa sobre **uma**
 * semana. "Essa segunda não estou com tempo" virou "[availability] segunda-feira
 * tem pouco tempo" no perfil, e a semana seguinte já nasceu achando que toda
 * segunda do Sérgio era curta.
 *
 * A regra: o que o atleta diz no chat de uma semana sobre **agenda** ou
 * **preferência** é daquela semana — o chat já aplicou ao plano, que é onde
 * aquilo precisava estar. Lesão, objetivo e observação sobrevivem ao domingo.
 * Uma preferência que for mesmo permanente mora nas preferências de treino, e
 * se o atleta repetir no chat de outra semana, ela volta.
 */

/** As categorias que falam de uma semana, não de uma pessoa. */
const WEEK_SCOPED = new Set(["availability", "preference"]);

/**
 * Quando a nota deixa de valer — ISO, ou `null` para "até alguém desativar".
 *
 * Expira à meia-noite de segunda em Brasília (03:00 UTC): a semana acabou, e a
 * próxima é gerada exatamente nessa virada — que foi quando o erro apareceu.
 */
export function noteExpiry(category: string, weekStart: string | null | undefined): string | null {
  if (!WEEK_SCOPED.has(category)) return null;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return null;

  const next = new Date(`${weekStart}T03:00:00.000Z`);
  if (Number.isNaN(next.getTime())) return null;
  next.setUTCDate(next.getUTCDate() + 7);
  return next.toISOString();
}

/**
 * O filtro do PostgREST para "notas que ainda valem": sem prazo, ou com prazo
 * ainda no futuro. Um lugar só, para as telas e o motor lerem a mesma memória.
 */
export function stillValidFilter(now: Date = new Date()): string {
  return `expires_at.is.null,expires_at.gt.${now.toISOString()}`;
}

/**
 * O instante em que a semana começa para o atleta: segunda, 00:00 em Brasília.
 *
 * É o relógio certo para "esta nota vale para a semana X?". Usar o agora foi o
 * furo: a semana de 28/09 foi gerada às 00:02 de 21/09, ainda dentro da semana
 * em que "essa segunda não tenho tempo" valia — e herdou o pedido.
 */
export function weekStartsAt(weekStart: string): Date {
  return new Date(`${weekStart}T03:00:00.000Z`);
}
