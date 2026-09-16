/**
 * Identity is the one piece of data other people see. Every failure here is
 * social, not technical: a leaderboard row reading "pedro" next to "Sérgio
 * Carmelo", a friend search that cannot resolve a handle, or an e-mail address
 * leaking into a public username.
 */
import { describe, it, expect } from "vitest";
import {
  splitFullName, fullNameOf, normalizeUsername, identityProblems,
  isIdentityComplete, suggestUsernames, profileNeedsIdentity, USERNAME_MIN,
} from "@/lib/profile-identity";

describe("separar nome e sobrenome", () => {
  it("separa o nome guardado num campo só", () => {
    expect(splitFullName("Sérgio Carmelo")).toEqual({ firstName: "Sérgio", lastName: "Carmelo" });
  });

  it("mantém sobrenome composto inteiro", () => {
    expect(splitFullName("Ana Paula de Souza"))
      .toEqual({ firstName: "Ana", lastName: "Paula de Souza" });
  });

  it("mantém conectivos em minúscula", () => {
    // "da" fica minúsculo por estar no meio de "João da Silva" — arrumar a
    // caixa do sobrenome isolado devolvia "Da Silva".
    expect(splitFullName("joão DA silva")).toEqual({ firstName: "João", lastName: "da Silva" });
  });

  it("normaliza caixa bagunçada", () => {
    expect(splitFullName("SÉRGIO carmelo")).toEqual({ firstName: "Sérgio", lastName: "Carmelo" });
  });

  it("devolve sobrenome vazio para quem só tem primeiro nome", () => {
    // O caso real do pedro: o app precisa saber que falta, não chutar.
    expect(splitFullName("pedro")).toEqual({ firstName: "Pedro", lastName: "" });
  });

  it("aguenta vazio e nulo", () => {
    expect(splitFullName(null)).toEqual({ firstName: "", lastName: "" });
    expect(splitFullName("   ")).toEqual({ firstName: "", lastName: "" });
  });

  it("remonta o nome completo", () => {
    expect(fullNameOf({ firstName: "Sérgio", lastName: "Carmelo" })).toBe("Sérgio Carmelo");
    expect(fullNameOf({ firstName: "Pedro", lastName: "" })).toBe("Pedro");
  });
});

describe("username", () => {
  it("normaliza para o formato guardado", () => {
    expect(normalizeUsername("@Sérgio.CTF")).toBe("sergio.ctf");
    expect(normalizeUsername("  joão_silva  ")).toBe("joao_silva");
    expect(normalizeUsername("a b c")).toBe("abc");
  });

  it("apara pontuação das pontas", () => {
    expect(normalizeUsername("._pedro_.")).toBe("pedro");
  });

  it("recusa nomes reservados", () => {
    for (const u of ["admin", "limiar", "settings", "api"]) {
      expect(identityProblems({ firstName: "Ana", lastName: "Souza", username: u }).username,
        u).toBeTruthy();
    }
  });

  it("recusa username já em uso, ignorando caixa e acento", () => {
    const p = identityProblems(
      { firstName: "Ana", lastName: "Souza", username: "@Sérgioctf" },
      { taken: ["sergioctf"] },
    );
    expect(p.username).toMatch(/já está em uso/);
  });

  it("exige o mínimo de caracteres", () => {
    const p = identityProblems({ firstName: "Ana", lastName: "Souza", username: "ab" });
    expect(p.username).toContain(String(USERNAME_MIN));
  });
});

describe("validação de identidade", () => {
  const ok = { firstName: "Sérgio", lastName: "Carmelo", username: "sergioctf" };

  it("aceita um perfil completo", () => {
    expect(identityProblems(ok)).toEqual({});
    expect(isIdentityComplete(ok)).toBe(true);
  });

  it("aponta sobrenome faltando sem inventar um", () => {
    const p = identityProblems({ ...ok, lastName: "" });
    expect(p.lastName).toBeTruthy();
    expect(p.firstName).toBeUndefined();
  });

  it("rejeita número no nome — é prefixo de e-mail vazando", () => {
    expect(identityProblems({ ...ok, firstName: "pedro2003" }).firstName).toMatch(/números/);
  });

  it("rejeita nome de uma letra", () => {
    expect(identityProblems({ ...ok, lastName: "C" }).lastName).toBeTruthy();
  });
});

describe("sugestão de username", () => {
  it("sugere a partir do nome, nunca do e-mail", () => {
    const s = suggestUsernames({ firstName: "Sérgio", lastName: "Carmelo" });
    expect(s).toContain("sergiocarmelo");
    expect(s.every(u => /^[a-z0-9_.]+$/.test(u))).toBe(true);
  });

  it("pula as opções já tomadas", () => {
    const s = suggestUsernames({ firstName: "Sérgio", lastName: "Carmelo" }, ["sergiocarmelo"]);
    expect(s).not.toContain("sergiocarmelo");
    expect(s.length).toBeGreaterThan(0);
  });

  it("sempre devolve alguma opção, mesmo com tudo tomado", () => {
    const taken = ["sergiocarmelo", "sergio.carmelo", "sergioc", "sergio"];
    expect(suggestUsernames({ firstName: "Sérgio", lastName: "Carmelo" }, taken).length)
      .toBeGreaterThan(0);
  });

  it("não sugere nada sem primeiro nome", () => {
    expect(suggestUsernames({ firstName: "", lastName: "Carmelo" })).toEqual([]);
  });
});

describe("quem ainda precisa completar o perfil", () => {
  it("aprova quem está completo", () => {
    expect(profileNeedsIdentity({ name: "Sérgio Carmelo", username: "sergioctf" },
      "sctcarmelo@gmail.com")).toBe(false);
  });

  it("pega quem tem só o primeiro nome", () => {
    // Estado real em produção — 'pedro', sem sobrenome.
    expect(profileNeedsIdentity({ name: "pedro", username: "pedropanucci_" },
      "pedromartins2003@uol.com.br")).toBe(true);
  });

  it("pega quem não tem username", () => {
    expect(profileNeedsIdentity({ name: "Ana Souza", username: null }, "ana@x.com")).toBe(true);
  });

  it("trata nome igual ao prefixo do e-mail como ausente", () => {
    // Isso é o que o cadastro escreveu sozinho, não o que a pessoa digitou.
    expect(profileNeedsIdentity({ name: "anasouza", username: "anasouza" },
      "anasouza@gmail.com")).toBe(true);
  });

  it("aguenta perfil inexistente", () => {
    expect(profileNeedsIdentity(null, "x@y.com")).toBe(true);
    expect(profileNeedsIdentity(undefined, undefined)).toBe(true);
  });
});
