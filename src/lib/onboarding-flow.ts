/**
 * O primeiro acesso: o que se pergunta, em que ordem, e o que fica para depois.
 *
 * A espinha mora aqui como dado, para a sequência poder ser discutida — e
 * testada — sem renderizar nada.
 *
 * ## O que mudou em 01/10, e por quê
 *
 * O fluxo tinha **quinze telas**: nove cenas de demonstração e seis perguntas,
 * alternando, antes de o atleta ter um único dado seu no app. A ideia era boa
 * no papel (cada pergunta chega logo depois da tela que a justifica), mas um
 * usuário novo entrou em 26/09 e o resumo do Sérgio foi: *"está tudo muito
 * confuso. O app tem muita coisa, está pouco intuitivo."*
 *
 * Quinze telas antes do primeiro treino é um folheto, não um começo. E a ordem
 * era a da vitrine — amigos, musculação, provas — não a do que o motor precisa
 * para montar a primeira semana.
 *
 * Agora são **quatro perguntas**, na ordem em que o plano depende delas:
 *
 *   1. **quem é você** — nome e @, que é o que as outras pessoas veem (e evita
 *      que o `IdentityGate` interrompa logo depois, uma segunda vez);
 *   2. **de onde vêm suas corridas** — Strava, ou registro na mão;
 *   3. **que dias você corre** — a pergunta que mais muda o plano;
 *   4. **quando você faz o teste de 3 km** — marcando o dia, agora que dá
 *      (ver `planned-test.ts`); sem ele o plano vem sem ritmo.
 *
 * A musculação, a prova-alvo e os avisos saíram daqui: nenhum dos três é
 * necessário para a primeira semana existir, e cada um tem o seu lugar natural
 * no app. Eles continuam na lista de configuração do painel.
 *
 * ## E a vitrine?
 *
 * As nove cenas continuam existindo, em `TOUR_STEPS`, como **"Conheça o app"** —
 * uma coisa que se escolhe ver, não um pedágio. É o que o botão das
 * Configurações abre, e o que o fim do primeiro acesso oferece.
 */

/**
 * Marca que o primeiro acesso já aconteceu.
 *
 * O nome é de 2026 e fica como está: trocá-lo faria o fluxo reaparecer para
 * todo mundo que já passou por ele. Morava no `OnboardingTour`, a primeira
 * implementação do tutorial — apagada em 01/10, quando sobraram três: aquela,
 * este fluxo e a lista do painel.
 */
export const TOUR_STORAGE_KEY = "limiar_onboarded";

export type StepKind = "scene" | "question" | "welcome" | "done";

/** Which profile field a question writes, when it writes one. */
export type QuestionField =
  | "identity"      // nome, sobrenome, @username
  | "runDays"
  | "measureBy"   // km ou minutos
  | "strength"      // dias e grupos musculares
  | "goal"          // objetivo ou prova alvo
  | "strava"
  | "test"          // marcar o teste de 3 km
  | "push";

export interface OnboardingStepDef {
  id:    string;
  kind:  StepKind;
  /** Heading. Short — it competes with the scene for attention. */
  title: string;
  /** One or two sentences saying why this matters to the athlete. */
  body:  string;
  /** For scenes: which mock to render. For questions: which field to collect. */
  scene?: SceneKey;
  field?: QuestionField;
  /**
   * Every step is skippable. Stated per-step rather than assumed so the UI
   * cannot quietly make one mandatory: the checklist on the dashboard is the
   * recovery path for anything left undone.
   */
  skippable: boolean;
}

export type SceneKey =
  | "dashboard"
  | "structuredRun"
  | "strengthCatalogue"
  | "ai"
  | "zones"
  | "predictions"
  | "trainingLoad"
  | "history"
  | "races"
  | "friends";

/**
 * Scene → the feature it demonstrates.
 *
 * Kept separate from the step list because a scene may be reused (the dashboard
 * appears at the start as a promise and at the end as a destination).
 */
export const SCENE_TITLE: Record<SceneKey, string> = {
  dashboard:         "Tudo num lugar só",
  structuredRun:     "Treino desenhado para você",
  strengthCatalogue: "Musculação com 277 exercícios ilustrados",
  ai:                "Um treinador que olha os seus dados",
  zones:             "Seus ritmos e zonas, calculados",
  predictions:       "Quanto você faria numa prova hoje",
  trainingLoad:      "Forma, fadiga e quando descansar",
  history:           "Cada corrida, analisada",
  races:             "Da inscrição à estratégia de prova",
  friends:           "Quem treina com você",
};

/* ── O primeiro acesso ────────────────────────────────────────────────────── */

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    id: "welcome", kind: "welcome", skippable: true,
    title: "Bem-vindo ao Limiar",
    body:
      "Cinco perguntas, um minuto, e sua primeira semana de treino já nasce com a sua cara. " +
      "Dá para pular qualquer uma — o que faltar fica na lista do painel.",
  },

  {
    id: "q-identity", kind: "question", field: "identity", skippable: true,
    title: "Como você se chama",
    body: "Nome, sobrenome e um @username. É assim que seus amigos te encontram aqui.",
  },

  {
    id: "q-strava", kind: "question", field: "strava", skippable: true,
    title: "De onde vêm suas corridas",
    body:
      "Com o Strava conectado elas entram sozinhas, e o plano já começa sabendo quanto " +
      "você corre hoje. Sem ele, dá para registrar cada corrida na mão.",
  },

  {
    id: "q-run-days", kind: "question", field: "runDays", skippable: true,
    title: "Que dias você corre?",
    body:
      "É a pergunta que mais muda o seu plano: ela decide onde caem o longão e o treino " +
      "forte. Sem resposta, o app chuta terça, quinta e sábado.",
  },

  {
    id: "q-measure", kind: "question", field: "measureBy", skippable: true,
    title: "Você mede seus treinos em quilômetros ou em minutos?",
    body:
      "As duas escolas funcionam. Quem está começando costuma se achar melhor em " +
      "quilômetros — é o número que aparece na prova e no papo com os amigos. " +
      "Dá para trocar quando quiser, sem refazer nada.",
  },

  {
    id: "q-test", kind: "question", field: "test", skippable: true,
    title: "Quando você faz o teste de 3 km?",
    body:
      "São 3 km no seu limite — é o que dá ao plano os seus ritmos e as suas faixas de " +
      "frequência cardíaca. O app não inventa esses números: marque um dia e ele entra na sua semana.",
  },

  {
    id: "done", kind: "done", scene: "dashboard", skippable: false,
    title: "Pronto",
    body:
      "Sua semana está montada. O que você pulou continua na lista do painel, e dá para " +
      "ver o app inteiro quando quiser.",
  },
];

/* ── A vitrine, para quem quiser ver ──────────────────────────────────────── */

/**
 * As nove cenas, sem pergunta nenhuma.
 *
 * Montadas com os componentes do próprio app e dados de exemplo, nunca
 * capturas de tela: o app muda toda semana, um print é mentira em um mês e não
 * acompanha o tema claro/escuro.
 */
export const TOUR_STEPS: OnboardingStepDef[] = [
  {
    id: "tour-welcome", kind: "welcome", skippable: true,
    title: "O que o Limiar faz",
    body: "Nove telas, dois minutos. Nada aqui pede configuração — é só para você ver.",
  },
  {
    id: "scene-dashboard", kind: "scene", scene: "dashboard", skippable: true,
    title: SCENE_TITLE.dashboard,
    body: "O treino de hoje, como está o corpo e o que a semana ainda pede.",
  },
  {
    id: "scene-run", kind: "scene", scene: "structuredRun", skippable: true,
    title: SCENE_TITLE.structuredRun,
    body: "Aquecimento, tiros e desaquecimento, cada bloco com ritmo e faixa de batimento. Não é uma distância solta.",
  },
  {
    id: "scene-zones", kind: "scene", scene: "zones", skippable: true,
    title: SCENE_TITLE.zones,
    body: "Um teste de 3 km define seus ritmos de treino e suas zonas de frequência cardíaca.",
  },
  {
    id: "scene-predictions", kind: "scene", scene: "predictions", skippable: true,
    title: SCENE_TITLE.predictions,
    body: "5 km, 10 km, meia e maratona, projetados do seu teste mais recente.",
  },
  {
    id: "scene-load", kind: "scene", scene: "trainingLoad", skippable: true,
    title: SCENE_TITLE.trainingLoad,
    body: "Carga aguda contra crônica: o app avisa quando você está fundo demais para o treino que vem.",
  },
  {
    id: "scene-strength", kind: "scene", scene: "strengthCatalogue", skippable: true,
    title: SCENE_TITLE.strengthCatalogue,
    body: "Séries, repetições e carga sugerida, com foto de cada movimento.",
  },
  {
    id: "scene-history", kind: "scene", scene: "history", skippable: true,
    title: SCENE_TITLE.history,
    body: "Previsto contra executado, quilômetro a quilômetro, com o percurso no mapa.",
  },
  {
    id: "scene-races", kind: "scene", scene: "races", skippable: true,
    title: SCENE_TITLE.races,
    body: "Cadastre a prova e o plano se organiza em torno dela, até o polimento da última semana.",
  },
  {
    id: "scene-friends", kind: "scene", scene: "friends", skippable: true,
    title: SCENE_TITLE.friends,
    body: "Ranking por dias treinados, desafios e o feed de quem treina com você.",
  },
  {
    id: "tour-done", kind: "done", scene: "ai", skippable: false,
    title: SCENE_TITLE.ai,
    body: "Ele lê os seus dados antes de responder — e propõe, nunca muda o plano sozinho.",
  },
];

/** Steps that write something to the profile. */
export function questionSteps(steps = ONBOARDING_STEPS): OnboardingStepDef[] {
  return steps.filter(s => s.kind === "question");
}

/** Steps that only show a feature. */
export function sceneSteps(steps = TOUR_STEPS): OnboardingStepDef[] {
  return steps.filter(s => s.kind === "scene");
}

/**
 * A cena que motiva uma pergunta, quando existe.
 *
 * Continua aqui porque o teste que garante o pareamento continua valendo para
 * quem montar um fluxo misto no futuro — e porque é ele que documenta a regra:
 * uma pergunta cuja tela nunca foi mostrada é um campo de formulário.
 */
export function sceneBefore(
  stepId: string, steps = ONBOARDING_STEPS,
): OnboardingStepDef | null {
  const i = steps.findIndex(s => s.id === stepId);
  if (i <= 0) return null;
  for (let j = i - 1; j >= 0; j--) {
    if (steps[j].kind === "scene") return steps[j];
    // A question directly after another question has no scene of its own.
    if (steps[j].kind === "question") return null;
  }
  return null;
}
