/**
 * O que aparece no menu, e o que ainda não.
 *
 * O app tem seis áreas e quatorze páginas. Para quem acabou de entrar, quase
 * todas são prateleiras vazias: Histórico sem corrida, Gráficos sem ponto,
 * Provas sem prova, Saúde sem relógio. Mostrar tudo de uma vez não é dar
 * acesso — é pedir que a pessoa descubra sozinha quais das seis portas levam a
 * algum lugar (Sérgio, 01/10, depois de ver um usuário novo se perder).
 *
 * Três regras guiaram o que fica sempre visível:
 *
 *   1. **O app é o treino.** Hoje, Treinador e Configurações nunca somem.
 *   2. **Nada vira beco sem saída.** Uma área só é escondida quando existe
 *      outro caminho para criar o dado que a destrava: corrida entra pelo
 *      Strava ou pelo "+" da Hoje, prova e meta vivem dentro do Treinador,
 *      relógio se conecta nas Configurações.
 *   3. **Esconder é uma promessa, não um sumiço.** `hiddenAreas` existe para
 *      as Configurações poderem listar o que falta para cada porta abrir. Uma
 *      tela que some sem explicação é pior do que uma tela vazia.
 */

export interface NavData {
  runs: number;
  activities: number;
  races: number;
  goals: number;
  /** Amizades aceitas ou pedidos — qualquer vínculo social já conta. */
  friends: number;
  /** Garmin, Whoop ou Saúde da Apple — ver `health-access.ts`. */
  healthDevice: boolean;
}

export const EMPTY_NAV: NavData = {
  runs: 0, activities: 0, races: 0, goals: 0, friends: 0, healthDevice: false,
};

/**
 * Tudo visível — o padrão de quem lê isto sem contagem em mãos.
 *
 * Vale na falha de leitura e nos componentes de menu enquanto o servidor não
 * manda os números: esconder por engano é pior do que mostrar demais.
 */
export const NAV_ALL_VISIBLE: NavData = {
  runs: 99, activities: 99, races: 1, goals: 1, friends: 1, healthDevice: true,
};

/**
 * Gráficos precisam de três pontos.
 *
 * Com uma corrida o gráfico é um ponto; com duas, é uma reta que não diz nada
 * sobre tendência. Três é o mínimo em que a linha começa a significar algo.
 */
const MIN_RUNS_FOR_CHARTS = 3;

export type AreaKey = "hoje" | "treinador" | "historico" | "saude" | "amigos" | "config";

export function isAreaVisible(key: AreaKey, d: NavData): boolean {
  switch (key) {
    case "hoje":
    case "treinador":
    case "config":
      return true;
    case "historico":
      return d.runs > 0 || d.activities > 0;
    case "saude":
      return d.healthDevice;
    case "amigos":
      // Quem tem amigo vê sempre; quem não tem precisa primeiro ter o que
      // mostrar. O convite chega por link e não depende desta aba.
      return d.friends > 0 || d.runs > 0;
  }
}

/** As abas de dentro de uma área seguem a mesma lógica, por href. */
export function isTabVisible(href: string, d: NavData): boolean {
  switch (href) {
    case "/races":    return d.races > 0 || d.runs > 0;
    case "/goals":    return d.goals > 0 || d.runs > 0;
    case "/analytics": return d.runs >= MIN_RUNS_FOR_CHARTS;
    // Plano, Calibração, Atividades, Calendário e Conquistas acompanham a área
    // a que pertencem: se a área apareceu, elas têm o que mostrar.
    default: return true;
  }
}

export interface HiddenArea {
  label: string;
  /** O que falta para ela aparecer, dito como promessa. */
  unlocks: string;
  href: string;
}

/** O que ainda não apareceu, para as Configurações contarem. */
export function hiddenAreas(d: NavData): HiddenArea[] {
  const out: HiddenArea[] = [];

  if (!isAreaVisible("historico", d)) {
    out.push({
      label: "Histórico",
      unlocks: "Aparece com a sua primeira corrida — importada do Strava ou registrada na mão.",
      href: "/runs",
    });
  } else if (!isTabVisible("/analytics", d)) {
    out.push({
      label: "Gráficos",
      unlocks: `Aparecem a partir de ${MIN_RUNS_FOR_CHARTS} corridas: com menos, a linha não diz nada.`,
      href: "/analytics",
    });
  }

  if (!isAreaVisible("saude", d)) {
    out.push({
      label: "Saúde",
      unlocks: "Precisa de um relógio conectado: Garmin, Whoop ou Saúde da Apple.",
      href: "/health",
    });
  }

  if (!isAreaVisible("amigos", d)) {
    out.push({
      label: "Amigos",
      unlocks: "Aparece quando você tiver uma corrida registrada ou um amigo aqui dentro.",
      href: "/friends",
    });
  }

  if (!isTabVisible("/races", d)) {
    out.push({
      label: "Provas",
      unlocks: "Aparece com a sua primeira corrida — e aí o plano pode se organizar em torno de uma prova.",
      href: "/races",
    });
  }

  if (!isTabVisible("/goals", d)) {
    out.push({
      label: "Metas",
      unlocks: "Aparece com a sua primeira corrida.",
      href: "/goals",
    });
  }

  return out;
}
