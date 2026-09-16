/**
 * The first-run wizard: what it shows, what it asks, and in which order.
 *
 * The spine of the feature lives here as data so the sequence can be reasoned
 * about — and tested — without rendering anything. Every rule that matters is
 * expressible against this list: that nothing is mandatory, that a scene always
 * precedes the question it motivates, that the athlete can leave at any point.
 *
 * Two decisions shaped it:
 *
 *  • Scenes are built from the app's own components with example data, never
 *    screenshots. The app changes weekly; a screenshot is a lie within a month,
 *    and it cannot follow the light/dark theme.
 *
 *  • Scene and question alternate. Ten screens of features followed by six
 *    forms turns configuration into paperwork. Showing the structured workout
 *    with its paces and *then* asking which days you run makes the question a
 *    consequence of what was just demonstrated.
 */

export type StepKind = "scene" | "question" | "welcome" | "done";

/** Which profile field a question writes, when it writes one. */
export type QuestionField =
  | "identity"      // nome, sobrenome, @username
  | "runDays"
  | "strength"      // dias e grupos musculares
  | "goal"          // objetivo ou prova alvo
  | "strava"
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

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    id: "welcome", kind: "welcome", skippable: true,
    title: "Bem-vindo ao Limiar",
    body:  "Dois minutos agora e o app já começa com o seu treino, não com um genérico. Dá para pular tudo e configurar depois.",
  },

  // ── Quem é você ───────────────────────────────────────────────────────────
  {
    id: "scene-friends", kind: "scene", scene: "friends", skippable: true,
    title: SCENE_TITLE.friends,
    body:  "Ranking por dias treinados, desafios e o feed de quem treina com você.",
  },
  {
    id: "q-identity", kind: "question", field: "identity", skippable: true,
    title: "Como você aparece para os outros",
    body:  "Nome, sobrenome e um @username — é assim que seus amigos te encontram.",
  },

  // ── A corrida ─────────────────────────────────────────────────────────────
  {
    id: "scene-run", kind: "scene", scene: "structuredRun", skippable: true,
    title: SCENE_TITLE.structuredRun,
    body:  "Aquecimento, tiros e desaquecimento, cada bloco com ritmo e faixa de batimento. Não é uma distância solta.",
  },
  {
    id: "q-run-days", kind: "question", field: "runDays", skippable: true,
    title: "Que dias você corre?",
    body:  "É a pergunta que mais muda o seu plano. Sem ela o app assume terça, quinta e sábado — que provavelmente não são os seus.",
  },

  // ── A musculação ──────────────────────────────────────────────────────────
  {
    id: "scene-strength", kind: "scene", scene: "strengthCatalogue", skippable: true,
    title: SCENE_TITLE.strengthCatalogue,
    body:  "Séries, repetições e carga sugerida. Com foto de cada movimento, para não restar dúvida na hora.",
  },
  {
    id: "q-strength", kind: "question", field: "strength", skippable: true,
    title: "E a musculação?",
    body:  "Escolha os dias e os grupos musculares. O treinador monta as séries a partir disso.",
  },

  // ── O que o app calcula ───────────────────────────────────────────────────
  {
    id: "scene-zones", kind: "scene", scene: "zones", skippable: true,
    title: SCENE_TITLE.zones,
    body:  "Um teste de 3 km define seus ritmos de treino e suas zonas de frequência cardíaca. Sem ele o app não inventa esses números.",
  },
  {
    id: "scene-predictions", kind: "scene", scene: "predictions", skippable: true,
    title: SCENE_TITLE.predictions,
    body:  "5 km, 10 km, meia e maratona, projetados do seu teste mais recente.",
  },
  {
    id: "scene-load", kind: "scene", scene: "trainingLoad", skippable: true,
    title: SCENE_TITLE.trainingLoad,
    body:  "Carga aguda contra crônica: o app avisa quando você está fundo demais para o treino que vem.",
  },

  // ── De onde vêm os dados ──────────────────────────────────────────────────
  {
    id: "scene-history", kind: "scene", scene: "history", skippable: true,
    title: SCENE_TITLE.history,
    body:  "Previsto contra executado, quilômetro a quilômetro, com o percurso no mapa e um comentário do treinador.",
  },
  {
    id: "q-strava", kind: "question", field: "strava", skippable: true,
    title: "Conectar o Strava",
    body:  "Suas corridas entram sozinhas, sem você apertar nada. Também dá para registrar na mão.",
  },

  // ── O destino ─────────────────────────────────────────────────────────────
  {
    id: "scene-races", kind: "scene", scene: "races", skippable: true,
    title: SCENE_TITLE.races,
    body:  "Cadastre a prova e o plano inteiro se organiza em torno dela, até o polimento da última semana.",
  },
  {
    id: "q-goal", kind: "question", field: "goal", skippable: true,
    title: "Tem uma prova no radar?",
    body:  "Com data e distância o plano vira periodização de verdade. Sem prova, o foco é evoluir com consistência.",
  },
  {
    id: "q-push", kind: "question", field: "push", skippable: true,
    title: "Avisos do treino",
    body:  "O treino do dia de manhã, e alerta quando a carga pedir descanso.",
  },

  {
    id: "done", kind: "done", scene: "dashboard", skippable: false,
    title: "Pronto",
    body:  "O que você pulou continua na lista de configuração do painel — dá para completar quando quiser.",
  },
];

/** Steps that write something to the profile. */
export function questionSteps(steps = ONBOARDING_STEPS): OnboardingStepDef[] {
  return steps.filter(s => s.kind === "question");
}

/** Steps that only show a feature. */
export function sceneSteps(steps = ONBOARDING_STEPS): OnboardingStepDef[] {
  return steps.filter(s => s.kind === "scene");
}

/**
 * The scene that motivates a question, when there is one.
 *
 * Used to keep the pairing honest: a question whose feature was never shown is
 * a form field, and the whole point of this flow is that it is not one.
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
