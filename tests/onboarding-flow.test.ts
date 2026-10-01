/**
 * O primeiro acesso fica entre o cadastro e o app, o que torna as regras dele
 * especialmente caras: um passo que não dá para pular é uma porta trancada, e
 * cada tela a mais é uma chance de a pessoa desistir antes de ver o próprio
 * treino.
 *
 * Este arquivo guarda a decisão de 01/10, depois de um usuário novo se perder:
 * **o primeiro acesso pergunta o mínimo que faz a primeira semana existir, e
 * nada além disso.** Quinze telas viraram seis, e a vitrine virou escolha.
 */
import { describe, it, expect } from "vitest";
import {
  ONBOARDING_STEPS, TOUR_STEPS, questionSteps, sceneSteps, SCENE_TITLE,
  type QuestionField,
} from "@/lib/onboarding-flow";

describe("ninguém fica preso", () => {
  it("todo passo é pulável, exceto a tela final", () => {
    const travados = ONBOARDING_STEPS.filter(s => !s.skippable && s.kind !== "done");
    expect(travados).toEqual([]);
  });

  it("termina numa tela de conclusão", () => {
    expect(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1].kind).toBe("done");
  });

  it("começa apresentando, não perguntando", () => {
    expect(ONBOARDING_STEPS[0].kind).toBe("welcome");
  });
});

describe("o mínimo que faz a primeira semana existir", () => {
  it("pergunta só o que o motor precisa", () => {
    const campos = questionSteps().map(s => s.field);
    expect(campos).toEqual(["identity", "strava", "runDays", "test"]);
  });

  it("na ordem em que o plano depende delas", () => {
    // Quem é você → de onde vêm as corridas → que dias você corre → quando
    // você mede o seu ritmo. Qualquer outra ordem pede uma coisa antes de ela
    // fazer sentido.
    const ids = ONBOARDING_STEPS.map(s => s.id);
    expect(ids.indexOf("q-strava")).toBeLessThan(ids.indexOf("q-run-days"));
    expect(ids.indexOf("q-run-days")).toBeLessThan(ids.indexOf("q-test"));
  });

  it("não pede o que pode esperar", () => {
    // Musculação, prova-alvo e notificações não são necessárias para a
    // primeira semana existir — e cada uma tem lugar natural no app depois.
    // Elas continuam na lista de configuração do painel.
    const campos = questionSteps().map(s => s.field);
    for (const adiado of ["strength", "goal", "push"] as QuestionField[]) {
      expect(campos, adiado).not.toContain(adiado);
    }
  });

  it("cabe em um minuto: no máximo quatro perguntas", () => {
    expect(questionSteps().length).toBeLessThanOrEqual(4);
  });

  it("e em seis telas no total", () => {
    // O orçamento é a decisão. Eram quinze.
    expect(ONBOARDING_STEPS.length).toBeLessThanOrEqual(6);
  });

  it("não mostra vitrine no caminho", () => {
    // Nenhuma cena entre as perguntas: quem acabou de se cadastrar quer o
    // próprio treino, não um folheto.
    expect(ONBOARDING_STEPS.filter(s => s.kind === "scene")).toEqual([]);
  });
});

describe("a vitrine virou escolha", () => {
  it("o tour não pergunta nada", () => {
    expect(TOUR_STEPS.filter(s => s.kind === "question")).toEqual([]);
  });

  it("e mostra os recursos principais", () => {
    const cenas = sceneSteps(TOUR_STEPS).map(s => s.scene);
    for (const c of ["structuredRun", "strengthCatalogue", "zones",
                     "predictions", "trainingLoad", "history", "races", "friends"] as const) {
      expect(cenas, c).toContain(c);
    }
  });

  it("também dá para sair dele a qualquer momento", () => {
    const travados = TOUR_STEPS.filter(s => !s.skippable && s.kind !== "done");
    expect(travados).toEqual([]);
  });

  it("toda cena declarada tem título", () => {
    for (const s of [...ONBOARDING_STEPS, ...TOUR_STEPS]) {
      if (s.scene) expect(SCENE_TITLE[s.scene], s.id).toBeTruthy();
    }
  });
});

describe("texto", () => {
  it("todo passo explica o porquê, não só o quê", () => {
    for (const s of [...ONBOARDING_STEPS, ...TOUR_STEPS]) {
      expect(s.title.length, s.id).toBeGreaterThan(3);
      expect(s.body.length, s.id).toBeGreaterThan(30);
    }
  });

  it("não repete id", () => {
    const ids = [...ONBOARDING_STEPS, ...TOUR_STEPS].map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
