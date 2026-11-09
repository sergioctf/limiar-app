import { describe, expect, it } from "vitest";
import {
  exerciseComplete, loggableSets, mergeStoredRunner, nextPendingIndex,
  parseStoredRunner, reconcileLate, restRemaining, runnerProgress, runnerStorageKey, seedRunnerState,
  type RunnerState,
} from "@/lib/session-runner";
import type { StrengthExercisePrescription } from "@/lib/strength-builder";

const ex = (over: Partial<StrengthExercisePrescription> = {}): StrengthExercisePrescription => ({
  exerciseId: "supino-reto", name: "Supino reto", sets: 3, reps: [8, 10], rir: 2,
  restSeconds: 90, main: true, unilateral: false, cue: "", timeBased: false, ...over,
});

const session = (exercises: StrengthExercisePrescription[]) => ({ exercises });

describe("semear a sessão", () => {
  it("abre uma linha por série prescrita", () => {
    const state = seedRunnerState(session([ex({ sets: 4 })]));
    expect(state["supino-reto"]).toHaveLength(4);
  });

  it("começa no piso da faixa de repetições e no RIR prescrito", () => {
    const state = seedRunnerState(session([ex({ reps: [8, 12], rir: 3 })]));
    expect(state["supino-reto"][0]).toMatchObject({ reps: "8", rir: "3" });
  });

  it("traz a carga sugerida pela progressão, para ninguém redigitar o que já levantou", () => {
    const state = seedRunnerState(session([ex()]), {
      "supino-reto": { weightKg: 42.5, reason: "subiu", stalled: false, last: null },
    });
    expect(state["supino-reto"][0].weightKg).toBe("42.5");
  });

  it("deixa a carga em branco quando não há histórico — nunca inventa um número", () => {
    expect(seedRunnerState(session([ex()]))["supino-reto"][0].weightKg).toBe("");
  });

  it("nenhuma série nasce marcada", () => {
    const state = seedRunnerState(session([ex({ sets: 3 })]));
    expect(state["supino-reto"].every(s => !s.done)).toBe(true);
  });

  it("garante ao menos uma série mesmo numa prescrição degenerada", () => {
    expect(seedRunnerState(session([ex({ sets: 0 })]))["supino-reto"]).toHaveLength(1);
  });
});

describe("progresso", () => {
  const state: RunnerState = {
    a: [{ weightKg: "40", reps: "8", rir: "2", done: true }, { weightKg: "40", reps: "8", rir: "2", done: false }],
    b: [{ weightKg: "20", reps: "10", rir: "2", done: true }],
  };

  it("conta séries feitas sobre o total", () => {
    expect(runnerProgress(state)).toEqual({ done: 2, total: 3 });
  });

  it("um exercício só está vencido com todas as séries marcadas", () => {
    expect(exerciseComplete(state, "a")).toBe(false);
    expect(exerciseComplete(state, "b")).toBe(true);
  });

  it("exercício desconhecido não conta como vencido", () => {
    expect(exerciseComplete(state, "nao-existe")).toBe(false);
  });
});

describe("para onde ir depois", () => {
  const lista = [{ exerciseId: "a" }, { exerciseId: "b" }, { exerciseId: "c" }];
  const feito = [{ weightKg: "40", reps: "8", rir: "2", done: true }];
  const porFazer = [{ weightKg: "", reps: "8", rir: "2", done: false }];

  it("vai para o próximo que ainda tem série", () => {
    expect(nextPendingIndex(lista, { a: feito, b: porFazer, c: porFazer }, 0)).toBe(1);
  });

  it("volta ao que foi pulado em vez de ir para o fim do treino", () => {
    // O supino ficou para trás porque o banco estava ocupado.
    expect(nextPendingIndex(lista, { a: porFazer, b: feito, c: feito }, 2)).toBe(0);
  });

  it("devolve null quando não sobrou nada", () => {
    expect(nextPendingIndex(lista, { a: feito, b: feito, c: feito }, 0)).toBeNull();
  });
});

describe("o que vira registro", () => {
  it("só as séries marcadas — uma carga sugerida na tela não é um treino feito", () => {
    const state: RunnerState = {
      a: [
        { weightKg: "40", reps: "8", rir: "2", done: true },
        { weightKg: "40", reps: "8", rir: "2", done: false },
      ],
    };
    expect(loggableSets(state)).toEqual([
      { exerciseId: "a", setIndex: 1, weightKg: 40, reps: 8, rir: 2 },
    ]);
  });

  it("numera a série pela posição, não pela ordem em que foi marcada", () => {
    const state: RunnerState = {
      a: [
        { weightKg: "", reps: "", rir: "", done: false },
        { weightKg: "40", reps: "8", rir: "2", done: true },
      ],
    };
    expect(loggableSets(state)[0].setIndex).toBe(2);
  });

  it("descarta a série marcada que não tem nem carga nem repetição", () => {
    expect(loggableSets({ a: [{ weightKg: "", reps: "", rir: "2", done: true }] })).toEqual([]);
  });

  it("aceita vírgula decimal, que é como se digita em português", () => {
    const state: RunnerState = { a: [{ weightKg: "42,5", reps: "8", rir: "", done: true }] };
    expect(loggableSets(state)[0]).toMatchObject({ weightKg: 42.5, rir: null });
  });

  it("guarda o peso corporal: sem carga, com repetição", () => {
    const state: RunnerState = { a: [{ weightKg: "", reps: "12", rir: "1", done: true }] };
    expect(loggableSets(state)[0]).toMatchObject({ weightKg: null, reps: 12 });
  });
});

describe("o descanso", () => {
  it("é derivado do relógio, para continuar certo com a tela apagada", () => {
    const fim = 1_000_000;
    expect(restRemaining(fim, fim - 90_000)).toBe(90);
    // 70 s depois o telefone volta do bolso: faltam 20, não 89.
    expect(restRemaining(fim, fim - 20_000)).toBe(20);
  });

  it("não fica negativo quando passa do tempo", () => {
    expect(restRemaining(1_000_000, 1_060_000)).toBe(0);
  });

  it("sem descanso em andamento, não há o que mostrar", () => {
    expect(restRemaining(null, Date.now())).toBe(0);
  });
});

describe("voltar de onde parou", () => {
  const state: RunnerState = { a: [{ weightKg: "40", reps: "8", rir: "2", done: true }] };
  const guardado = JSON.stringify({ date: "2026-10-03", state });

  it("a chave é do dia", () => {
    expect(runnerStorageKey("atleta-a", "2026-10-03")).not.toBe(runnerStorageKey("atleta-b", "2026-10-03"));
  });

  it("devolve o estado do mesmo dia", () => {
    expect(parseStoredRunner(guardado, "2026-10-03")).toEqual(state);
  });

  it("ignora o treino de ontem", () => {
    expect(parseStoredRunner(guardado, "2026-10-04")).toBeNull();
  });

  it.each([
    ["nada guardado", null],
    ["lixo", "{{{"],
    ["forma errada", JSON.stringify({ date: "2026-10-03", state: "nope" })],
    ["sem data", JSON.stringify({ state })],
  ])("descarta em silêncio: %s", (_caso, raw) => {
    expect(parseStoredRunner(raw, "2026-10-03")).toBeNull();
  });

  it("a prescrição de hoje manda: exercício que saiu do plano não volta", () => {
    const semeado = seedRunnerState(session([ex({ exerciseId: "agachamento", sets: 2 })]));
    const antigo: RunnerState = {
      agachamento: [{ weightKg: "60", reps: "8", rir: "2", done: true }],
      "supino-que-foi-trocado": [{ weightKg: "40", reps: "8", rir: "2", done: true }],
    };
    const merged = mergeStoredRunner(semeado, antigo);
    expect(Object.keys(merged)).toEqual(["agachamento"]);
    expect(merged.agachamento[0].weightKg).toBe("60");
    // A série que o guardado não cobria continua vindo da prescrição.
    expect(merged.agachamento[1].done).toBe(false);
  });

  it("sem nada guardado, fica o semeado", () => {
    const semeado = seedRunnerState(session([ex()]));
    expect(mergeStoredRunner(semeado, null)).toBe(semeado);
  });
});

describe("a rede não apaga o que o atleta já fez", () => {
  const vazia = { weightKg: "", reps: "8", rir: "2", done: false };
  const sugerida = { weightKg: "42.5", reps: "8", rir: "2", done: true };

  it("a série marcada antes da resposta sobrevive à sugestão que chegou depois", () => {
    const marcada = { weightKg: "40", reps: "7", rir: "1", done: true };
    const out = reconcileLate({ a: [marcada] }, { a: [{ ...sugerida, done: false }] });
    expect(out.a[0]).toEqual(marcada);
  });

  it("a carga digitada também é do atleta, mesmo sem a série marcada", () => {
    const digitada = { weightKg: "37,5", reps: "8", rir: "2", done: false };
    const out = reconcileLate({ a: [digitada] }, { a: [{ ...sugerida, done: false }] });
    expect(out.a[0].weightKg).toBe("37,5");
  });

  it("a série intocada aceita a sugestão", () => {
    const out = reconcileLate({ a: [vazia] }, { a: [{ ...sugerida, done: false }] });
    expect(out.a[0].weightKg).toBe("42.5");
  });

  it("espaço em branco não conta como carga digitada", () => {
    const out = reconcileLate({ a: [{ ...vazia, weightKg: "  " }] }, { a: [{ ...sugerida, done: false }] });
    expect(out.a[0].weightKg).toBe("42.5");
  });

  it("a prescrição que chegou manda na forma: série a mais entra, exercício que saiu some", () => {
    const out = reconcileLate(
      { a: [vazia], saiu: [vazia] },
      { a: [vazia, vazia, vazia] },
    );
    expect(Object.keys(out)).toEqual(["a"]);
    expect(out.a).toHaveLength(3);
  });
});
