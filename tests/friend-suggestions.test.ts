/**
 * Suggestions are the first thing a new athlete sees on the social side, and
 * the failure modes are all silent: suggesting someone you already asked,
 * suggesting yourself, or showing a reason that is not true. None of those
 * throw — they just make the app look like it does not know its own data.
 */
import { describe, it, expect } from "vitest";
import {
  suggestFriends, shortfallNote, NEW_USER_WEEKS,
  type SuggestionCandidate, type Edge,
} from "@/lib/friend-suggestions";

const TODAY = "2026-08-10";
const WEEK = "2026-08-10";

const person = (id: string, over: Partial<SuggestionCandidate> = {}): SuggestionCandidate => ({
  id, name: id.toUpperCase(), username: id, createdAt: "2025-01-01", ...over,
});

const me = { id: "me", sports: ["corrida"], runDays: ["Mon", "Wed", "Sat"], birthDate: "1990-01-01", weeklyKm: 30 };
const run = (candidates: SuggestionCandidate[], edges: Edge[] = [], limit = 5) =>
  suggestFriends(me, candidates, edges, { weekStart: WEEK, today: TODAY, limit });

describe("quem nunca pode aparecer", () => {
  it("não sugere o próprio atleta", () => {
    expect(run([person("me"), person("a")]).map(s => s.userId)).toEqual(["a"]);
  });

  it("não sugere quem já é amigo", () => {
    const edges: Edge[] = [{ a: "me", b: "a", accepted: true }];
    expect(run([person("a"), person("b")], edges).map(s => s.userId)).toEqual(["b"]);
  });

  it("não sugere quem já tem pedido pendente, nos dois sentidos", () => {
    const edges: Edge[] = [
      { a: "me", b: "a", accepted: false },   // eu pedi
      { a: "b",  b: "me", accepted: false },  // me pediram
    ];
    expect(run([person("a"), person("b"), person("c")], edges).map(s => s.userId)).toEqual(["c"]);
  });
});

describe("motivos", () => {
  it("prioriza amigos em comum e diz quantos", () => {
    const edges: Edge[] = [
      { a: "me", b: "f1", accepted: true },
      { a: "me", b: "f2", accepted: true },
      { a: "alvo", b: "f1", accepted: true },
      { a: "alvo", b: "f2", accepted: true },
    ];
    const [top] = run([person("alvo"), person("novo", { createdAt: TODAY })], edges);
    expect(top.userId).toBe("alvo");
    expect(top.kind).toBe("amigos_em_comum");
    expect(top.mutuals).toBe(2);
    expect(top.reason).toBe("2 amigos em comum");
  });

  it("usa singular com um amigo em comum", () => {
    const edges: Edge[] = [
      { a: "me", b: "f1", accepted: true },
      { a: "alvo", b: "f1", accepted: true },
    ];
    expect(run([person("alvo")], edges)[0].reason).toBe("1 amigo em comum");
  });

  it("não conta amizade pendente como amigo em comum", () => {
    // Um pedido não aceito não é uma conexão — contá-lo inventaria o motivo.
    const edges: Edge[] = [
      { a: "me", b: "f1", accepted: false },
      { a: "alvo", b: "f1", accepted: false },
    ];
    expect(run([person("alvo")], edges)[0].mutuals).toBe(0);
  });

  it("marca quem entrou recentemente", () => {
    const s = run([person("novo", { createdAt: "2026-08-08" })])[0];
    expect(s.kind).toBe("novo_no_app");
    expect(s.reason).toMatch(/Entrou/);
  });

  it("deixa de chamar de novo quem passou da janela", () => {
    const old = new Date(`${TODAY}T12:00:00Z`);
    old.setUTCDate(old.getUTCDate() - (NEW_USER_WEEKS + 2) * 7);
    const s = run([person("antigo", { createdAt: old.toISOString().slice(0, 10) })])[0];
    expect(s.kind).not.toBe("novo_no_app");
  });

  it("cita dias de treino em comum quando existem", () => {
    const s = run([person("p", { runDays: ["Mon", "Wed", "Fri"] })])[0];
    expect(s.kind).toBe("perfil_parecido");
    expect(s.reason).toBe("Também treina segunda e quarta");
  });

  it("cita volume parecido quando é o sinal mais forte", () => {
    const s = run([person("p", { runDays: ["Tue"], sports: [], weeklyKm: 28 })])[0];
    expect(s.reason).toMatch(/Volume semanal parecido/);
  });

  it("nunca inventa motivo para quem não tem nada em comum", () => {
    const s = run([person("p", { runDays: [], sports: [], birthDate: null, weeklyKm: null })])[0];
    expect(s.kind).toBe("descobrir");
    expect(s.reason).toBe("Está no Limiar");
  });
});

describe("rotação semanal", () => {
  const pool = ["a", "b", "c", "d", "e", "f", "g", "h"].map(id => person(id));

  it("é estável dentro da mesma semana", () => {
    const a = suggestFriends(me, pool, [], { weekStart: "2026-08-10", today: TODAY });
    const b = suggestFriends(me, pool, [], { weekStart: "2026-08-10", today: TODAY });
    expect(a.map(x => x.userId)).toEqual(b.map(x => x.userId));
  });

  it("muda de uma semana para a outra", () => {
    const w1 = suggestFriends(me, pool, [], { weekStart: "2026-08-10", today: TODAY });
    const w2 = suggestFriends(me, pool, [], { weekStart: "2026-08-17", today: TODAY });
    expect(w1.map(x => x.userId)).not.toEqual(w2.map(x => x.userId));
  });

  it("não deixa a rotação passar na frente de amigos em comum", () => {
    // A ordem varia entre iguais, nunca entre um conhecido e um desconhecido.
    const edges: Edge[] = [
      { a: "me", b: "f1", accepted: true },
      { a: "h",  b: "f1", accepted: true },
    ];
    for (const weekStart of ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]) {
      const top = suggestFriends(me, pool, edges, { weekStart, today: TODAY })[0];
      expect(top.userId, weekStart).toBe("h");
    }
  });

  it("entrega 5 quando há gente suficiente", () => {
    expect(run(pool)).toHaveLength(5);
  });
});

describe("app pequeno", () => {
  it("devolve o que existe sem inventar ninguém", () => {
    const s = run([person("a"), person("b")]);
    expect(s).toHaveLength(2);
  });

  it("explica a lista curta em vez de mostrar painel vazio", () => {
    expect(shortfallNote(2, 5, 2)).toMatch(/poucos usuários/);
    expect(shortfallNote(0, 5, 0)).toMatch(/dos primeiros/);
    expect(shortfallNote(0, 5, 3)).toMatch(/todo mundo/);
    expect(shortfallNote(5, 5, 90)).toBeNull();
  });
});
