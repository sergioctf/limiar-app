/**
 * Quem tem Saúde, e quem ainda não tem.
 *
 * A tela de Saúde nasceu medindo: HRV, sono, frequência de repouso, energia.
 * Sem um aparelho ligado, nada disso existe, e o que sobrava era um check-in
 * manual pedindo que a pessoa dissesse como dormiu — uma tela inteira de
 * perguntas, mais um número de "disposição" na Home que na prática vinha só da
 * carga de treino.
 *
 * Um usuário novo entrou nessa semana e foi exatamente isso que ele viu: uma
 * seção grande, cheia, sobre dados que ele não tem. O Sérgio decidiu (29/09)
 * que Saúde fica **bloqueada** até um relógio estar conectado, e que a Home não
 * menciona disposição nem cansaço para quem não conectou nada.
 *
 * Três portas contam como aparelho:
 *   • **Garmin**, que chega pelo intervals.icu (a API da Garmin está fechada
 *     para apps novos — ver HANDOFF);
 *   • **Whoop**, por OAuth;
 *   • **Saúde da Apple**, pelo Atalho do iPhone, que usa um token de ingestão.
 *
 * O check-in manual continua existindo para quem tem aparelho — ele afina o
 * que o relógio mede. O que ele não pode é ser a única coisa de uma seção.
 */

export interface HealthSourceInput {
  /** Existe conexão com o intervals.icu (Garmin). */
  intervals?: boolean;
  /** Existe conexão com o Whoop. */
  whoop?: boolean;
  /** O Atalho do iPhone tem token — Saúde da Apple mandando dados. */
  wellnessToken?: string | null;
  /**
   * Linhas de `wellness_data` que **não** vieram do check-in manual.
   *
   * É o sinal mais forte de todos: não importa qual porta ficou aberta, aqui há
   * medição de verdade. Cobre também quem conectou e depois desconectou, mas
   * cujo histórico continua valendo alguma coisa.
   */
  measuredRows?: number;
}

export function hasHealthDevice(input: HealthSourceInput): boolean {
  return Boolean(
    input.intervals
    || input.whoop
    || (input.wellnessToken && input.wellnessToken.length > 0)
    || (input.measuredRows ?? 0) > 0,
  );
}

/** As portas que a tela bloqueada oferece, na ordem em que fazem sentido aqui. */
export const HEALTH_DEVICES = [
  {
    key: "garmin",
    label: "Garmin",
    detail: "Sono, HRV e frequência de repouso, via intervals.icu",
  },
  {
    key: "whoop",
    label: "Whoop",
    detail: "Recuperação e sono direto da conta Whoop",
  },
  {
    key: "apple",
    label: "Saúde da Apple",
    detail: "Atalho do iPhone envia sono, energia e frequência",
  },
] as const;
