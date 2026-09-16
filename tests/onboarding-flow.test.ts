/**
 * The wizard sits between signup and the app, which makes its rules unusually
 * consequential: a step that cannot be skipped is a locked door, and a question
 * whose feature was never shown is a form field wearing an onboarding costume.
 *
 * Both are checked here against the flow definition, before anything renders.
 */
import { describe, it, expect } from "vitest";
import {
  ONBOARDING_STEPS, questionSteps, sceneSteps, sceneBefore, SCENE_TITLE,
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

describe("cada pergunta nasce de algo mostrado", () => {
  it("as perguntas de configuração vêm depois de uma cena", () => {
    // A exceção é identidade, que não precisa de demonstração — mas ela também
    // ganhou uma (amigos), porque @username só faz sentido com contexto social.
    for (const q of questionSteps()) {
      if (q.field === "push") continue;   // notificações dispensam vitrine
      expect(sceneBefore(q.id), q.id).not.toBeNull();
    }
  });

  it("não encadeia perguntas sem respiro", () => {
    // Duas perguntas seguidas viram formulário. Só o par final (prova e avisos)
    // é admitido, e é o último trecho do fluxo.
    const kinds = ONBOARDING_STEPS.map(s => s.kind);
    let seguidas = 0;
    for (let i = 1; i < kinds.length; i++) {
      if (kinds[i] === "question" && kinds[i - 1] === "question") seguidas++;
    }
    expect(seguidas).toBeLessThanOrEqual(1);
  });
});

describe("cobertura", () => {
  it("coleta tudo que o app precisa para montar um plano", () => {
    const campos = questionSteps().map(s => s.field);
    const exigidos: QuestionField[] = ["identity", "runDays", "strength", "goal", "strava", "push"];
    for (const f of exigidos) expect(campos, f).toContain(f);
  });

  it("apresenta os recursos principais", () => {
    const cenas = sceneSteps().map(s => s.scene);
    for (const c of ["structuredRun", "strengthCatalogue", "zones",
                     "predictions", "trainingLoad", "history", "races", "friends"] as const) {
      expect(cenas, c).toContain(c);
    }
  });

  it("toda cena declarada tem título", () => {
    for (const s of ONBOARDING_STEPS) {
      if (s.scene) expect(SCENE_TITLE[s.scene], s.id).toBeTruthy();
    }
  });
});

describe("texto", () => {
  it("todo passo explica o porquê, não só o quê", () => {
    for (const s of ONBOARDING_STEPS) {
      expect(s.title.length, s.id).toBeGreaterThan(3);
      expect(s.body.length, s.id).toBeGreaterThan(30);
    }
  });

  it("não repete id", () => {
    const ids = ONBOARDING_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
