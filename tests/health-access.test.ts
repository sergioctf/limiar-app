/**
 * Saúde é uma seção de medições.
 *
 * Sem aparelho, ela mostrava um questionário no lugar dos sensores e a Home
 * anunciava uma "disposição" que vinha só da carga de treino. Um usuário novo
 * entrou em 26/09 e foi exatamente aí que se perdeu.
 */
import { describe, expect, it } from "vitest";
import { hasHealthDevice } from "@/lib/health-access";

describe("quem tem Saúde", () => {
  it("ninguém, por padrão", () => {
    expect(hasHealthDevice({})).toBe(false);
  });

  it("Garmin pelo intervals.icu abre", () => {
    expect(hasHealthDevice({ intervals: true })).toBe(true);
  });

  it("Whoop abre", () => {
    expect(hasHealthDevice({ whoop: true })).toBe(true);
  });

  it("o Atalho do iPhone abre — é a Saúde da Apple mandando dados", () => {
    expect(hasHealthDevice({ wellnessToken: "tok_123" })).toBe(true);
    expect(hasHealthDevice({ wellnessToken: "" })).toBe(false);
    expect(hasHealthDevice({ wellnessToken: null })).toBe(false);
  });

  it("medição guardada abre, venha da porta que vier", () => {
    expect(hasHealthDevice({ measuredRows: 3 })).toBe(true);
    expect(hasHealthDevice({ measuredRows: 0 })).toBe(false);
  });

  it("check-in manual não é aparelho", () => {
    // `measuredRows` já exclui a fonte "checkin" na consulta; o que chega aqui
    // como zero é justamente o atleta que só respondeu perguntas.
    expect(hasHealthDevice({ measuredRows: 0, intervals: false, whoop: false, wellnessToken: null })).toBe(false);
  });
});
