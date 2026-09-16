/**
 * The subscription is the difference between "syncs automatically" and "syncs
 * when you remember to press something". Its failure mode is silence: no error,
 * no broken screen, activities just stop arriving — which is exactly how this
 * went unnoticed until an athlete asked why nothing was automatic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ensureSubscription, callbackUrl } from "@/lib/strava-subscription";

const CREDS = { clientId: "1", clientSecret: "s", verifyToken: "v" };
const HERE  = "https://limiar-app.vercel.app/api/strava/webhook";
const THERE = "https://limiar-preview-xyz.vercel.app/api/strava/webhook";

/** Stands in for Strava: a list of subscriptions plus a record of the calls. */
function fakeStrava(initial: Array<{ id: number; callback_url: string }>) {
  let subs = [...initial];
  const calls: string[] = [];

  const fetchMock = vi.fn(async (url: string | URL, init?: { method?: string }) => {
    const href = String(url);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${href.split("?")[0]}`);

    if (method === "GET") {
      return { ok: true, json: async () => subs } as Response;
    }
    if (method === "DELETE") {
      const id = Number(href.split("?")[0].split("/").pop());
      subs = subs.filter(s => s.id !== id);
      return { ok: true } as Response;
    }
    const created = { id: 99, callback_url: HERE };
    subs.push(created);
    return { ok: true, json: async () => created } as Response;
  });

  return { fetchMock, calls, current: () => subs };
}

let original: typeof globalThis.fetch;
beforeEach(() => { original = globalThis.fetch; });
afterEach(() => { globalThis.fetch = original; vi.restoreAllMocks(); });

describe("garantir a assinatura", () => {
  it("cria quando não existe nenhuma", async () => {
    const s = fakeStrava([]);
    globalThis.fetch = s.fetchMock as never;

    const r = await ensureSubscription(CREDS, HERE);
    expect(r.status).toBe("created");
    expect(s.calls.some(c => c.startsWith("POST"))).toBe(true);
  });

  it("não recria quando já está correta", async () => {
    // Roda em cron: recriar toda vez gastaria chamada e derrubaria eventos
    // em trânsito por alguns segundos.
    const s = fakeStrava([{ id: 7, callback_url: HERE }]);
    globalThis.fetch = s.fetchMock as never;

    const r = await ensureSubscription(CREDS, HERE);
    expect(r.status).toBe("already");
    expect(r.subscription.id).toBe(7);
    expect(s.calls.filter(c => c.startsWith("POST"))).toHaveLength(0);
    expect(s.calls.filter(c => c.startsWith("DELETE"))).toHaveLength(0);
  });

  it("substitui uma assinatura apontando para outro deploy", async () => {
    // O modo de falha real: a assinatura existe, o Strava está satisfeito, e os
    // eventos vão para uma URL de preview que ninguém lê.
    const s = fakeStrava([{ id: 3, callback_url: THERE }]);
    globalThis.fetch = s.fetchMock as never;

    const r = await ensureSubscription(CREDS, HERE);
    expect(r.status).toBe("replaced");
    expect(s.calls.some(c => c.startsWith("DELETE"))).toBe(true);
    expect(s.current().map(x => x.callback_url)).toEqual([HERE]);
  });

  it("limpa duplicatas e deixa exatamente uma", async () => {
    const s = fakeStrava([
      { id: 1, callback_url: THERE },
      { id: 2, callback_url: HERE },
    ]);
    globalThis.fetch = s.fetchMock as never;

    const r = await ensureSubscription(CREDS, HERE);
    expect(r.status).toBe("replaced");
    expect(s.current()).toHaveLength(1);
    expect(s.current()[0].callback_url).toBe(HERE);
  });

  it("propaga a recusa do Strava em vez de fingir sucesso", async () => {
    globalThis.fetch = vi.fn(async (_u: string | URL, init?: { method?: string }) => {
      if ((init?.method ?? "GET") === "GET") return { ok: true, json: async () => [] } as Response;
      return { ok: false, status: 400, text: async () => "callback url not verifiable" } as Response;
    }) as never;

    await expect(ensureSubscription(CREDS, HERE)).rejects.toThrow(/recusou a assinatura/);
  });
});

describe("URL de callback", () => {
  it("monta a partir da URL do app", () => {
    expect(callbackUrl("https://limiar-app.vercel.app")).toBe(HERE);
  });

  it("tolera barra sobrando", () => {
    expect(callbackUrl("https://limiar-app.vercel.app/")).toBe(HERE);
  });

  it("recusa localhost em vez de entregá-lo ao Strava", () => {
    // Foi exatamente isso que aconteceu: NEXT_PUBLIC_APP_URL valia
    // http://localhost:3000 em produção e o Strava devolveu um 400 opaco.
    expect(callbackUrl("http://localhost:3000")).toBeNull();
    expect(callbackUrl("https://127.0.0.1:3000")).toBeNull();
  });

  it("recusa http sem TLS", () => {
    expect(callbackUrl("http://limiar-app.vercel.app")).toBeNull();
  });
});
