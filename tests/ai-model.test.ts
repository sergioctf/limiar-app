import { describe, it, expect } from "vitest";
import { MODEL, GROQ_API_URL, supportsReasoningEffort, groqBody } from "@/lib/ai";

/**
 * Groq retired `llama-3.3-70b-versatile` on 16 August 2026 and every narrative
 * in the app went through it. The replacement is pinned here so a future model
 * swap has to look at these rules instead of rediscovering them:
 *
 *   • `reasoning_effort` is a 400 on models that do not reason, and callGroq
 *     turns failures into `null` — so the wrong flag is a silent, total outage.
 *   • the reasoning budget comes out of `max_tokens`, so it has to stay low or
 *     the answer gets truncated to nothing.
 */

describe("o modelo", () => {
  it("não é o modelo aposentado", () => {
    expect(MODEL).not.toBe("llama-3.3-70b-versatile");
  });

  it("aponta para a API da Groq", () => {
    expect(GROQ_API_URL).toContain("api.groq.com");
  });
});

describe("reasoning_effort", () => {
  it("vai para os modelos que raciocinam", () => {
    for (const m of ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"]) {
      expect(supportsReasoningEffort(m), m).toBe(true);
    }
  });

  it("não vai para os que devolvem 400", () => {
    // Verificado contra a API real: ambos respondem
    // "`reasoning_effort` is not supported with this model".
    for (const m of ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]) {
      expect(supportsReasoningEffort(m), m).toBe(false);
    }
  });

  it("trata modelo desconhecido como sem raciocínio", () => {
    // Errar para menos custa alguns tokens; errar para mais derruba tudo.
    expect(supportsReasoningEffort("algum-modelo-novo-2027")).toBe(false);
  });

  it("é 'low' — o orçamento pertence à resposta", () => {
    const body = JSON.parse(groqBody("s", "u", { maxTokens: 600, temperature: 0.7 }));
    if (supportsReasoningEffort()) expect(body.reasoning_effort).toBe("low");
  });
});

describe("o corpo da requisição", () => {
  const body = JSON.parse(groqBody("sistema", "usuário", { maxTokens: 900, temperature: 0.65 }));

  it("leva o que foi pedido, sem reescrever", () => {
    expect(body.model).toBe(MODEL);
    expect(body.max_tokens).toBe(900);
    expect(body.temperature).toBe(0.65);
    expect(body.messages).toEqual([
      { role: "system", content: "sistema" },
      { role: "user",   content: "usuário" },
    ]);
  });

  it("omite o campo em vez de mandar nulo", () => {
    // `reasoning_effort: undefined` viraria a chave no JSON e a API recusaria.
    if (!supportsReasoningEffort()) expect("reasoning_effort" in body).toBe(false);
  });
});
