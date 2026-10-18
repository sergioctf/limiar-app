import { describe, expect, it } from "vitest";
import {
  hashWellnessToken, looksLikeWellnessToken, newWellnessToken, sameToken,
} from "@/lib/wellness-token";

/*
  `profiles.wellness_token` guardava o token em texto puro, e a policy
  "Authenticated can search profiles" libera a tabela inteira para qualquer
  usuário logado — RLS filtra linhas, não colunas. Com a anon key que vai no
  navegador dava para ler o token de qualquer atleta, e esse token autentica
  /api/ingest/wellness, que grava sono, HRV e calorias.

  O banco passou a guardar o hash. Ler a coluna agora rende um SHA-256, que não
  autentica nada.
*/

describe("o token que vai para o banco não é o token", () => {
  it("o que se guarda é um SHA-256, não o valor", () => {
    const t = newWellnessToken();
    const h = hashWellnessToken(t);
    expect(h).not.toBe(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("wlt_");
  });

  it("o mesmo token dá sempre a mesma impressão — é assim que ele é reconhecido", () => {
    const t = newWellnessToken();
    expect(hashWellnessToken(t)).toBe(hashWellnessToken(t));
  });

  it("tokens diferentes dão impressões diferentes", () => {
    expect(hashWellnessToken(newWellnessToken())).not.toBe(hashWellnessToken(newWellnessToken()));
  });

  it("espaço em volta não muda nada — o Atalho cola com quebra de linha", () => {
    const t = newWellnessToken();
    expect(hashWellnessToken(` ${t}\n`)).toBe(hashWellnessToken(t));
  });

  it("não dá para voltar do hash ao token", () => {
    // Não é prova criptográfica: é o contrato que a tela passou a depender.
    // O app não consegue mostrar o token de novo, e é por isso que ele aparece
    // uma vez só.
    const t = newWellnessToken();
    expect(hashWellnessToken(t)).not.toContain(t.slice(4, 12));
  });
});

describe("o token novo", () => {
  it("tem prefixo que o identifica e aleatoriedade de sobra", () => {
    const t = newWellnessToken();
    expect(t.startsWith("wlt_")).toBe(true);
    expect(t).toHaveLength(4 + 48);
  });

  it("nunca se repete", () => {
    const n = new Set(Array.from({ length: 200 }, newWellnessToken));
    expect(n.size).toBe(200);
  });
});

describe("a forma aceita", () => {
  it("aceita o que geramos", () => {
    expect(looksLikeWellnessToken(newWellnessToken())).toBe(true);
  });

  it("aceita o formato antigo, mais curto, que já existia no banco", () => {
    expect(looksLikeWellnessToken("wlt_abcdef1234567890")).toBe(true);
  });

  it("recusa vazio, curto demais e com caractere estranho", () => {
    for (const ruim of [null, undefined, "", "   ", "wlt_curto", "wlt_" + "a".repeat(200), "tem espaço aqui", "<script>"]) {
      expect(looksLikeWellnessToken(ruim), String(ruim)).toBe(false);
    }
  });
});

describe("comparação em tempo constante", () => {
  it("reconhece iguais", () => {
    const h = hashWellnessToken("abc");
    expect(sameToken(h, h)).toBe(true);
  });

  it("recusa diferentes, inclusive de tamanhos diferentes", () => {
    expect(sameToken(hashWellnessToken("a"), hashWellnessToken("b"))).toBe(false);
    expect(sameToken("curto", hashWellnessToken("a"))).toBe(false);
  });
});
