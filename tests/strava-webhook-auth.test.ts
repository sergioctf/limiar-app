import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
  O webhook do Strava é público, e até 15/10 ele acreditava em qualquer um.

  O caminho de `delete` apagava uma corrida **só pelo id da atividade**, sem
  conferir de quem ela era:

      POST /api/strava/webhook
      { "object_type":"activity", "aspect_type":"delete", "object_id": 123 }

  marcava `deleted_at` na corrida 123 de quem quer que fosse o dono. Ids de
  atividade do Strava são sequenciais e públicos para atividades públicas:
  apagar o histórico de um atleta era um laço de `for` (dívida A9, aberta desde
  agosto).

  Estes testes existem para que isso não volte.
*/

const { admin, chain } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const n of ["select", "eq", "update", "maybeSingle", "single", "is", "order", "limit"]) chain[n] = vi.fn();
  return { chain, admin: { from: vi.fn() } };
});

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => admin,
  createClient: () => admin,
}));
vi.mock("@/lib/ai", () => ({ analyzeRun: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendPushToUser: vi.fn() }));
vi.mock("@/lib/friend-notify", () => ({ notifyFriendsOfWorkout: vi.fn(), workoutOf: vi.fn() }));
vi.mock("@/lib/strava", () => ({
  refreshStravaToken: vi.fn(), getStravaActivity: vi.fn(), stravaActivityToRun: vi.fn(),
}));

import { POST } from "@/app/api/strava/webhook/route";

const evento = (over: Record<string, unknown> = {}) =>
  new NextRequest("http://localhost/api/strava/webhook", {
    method: "POST",
    body: JSON.stringify({
      object_type: "activity", aspect_type: "delete",
      object_id: 123, owner_id: 999, subscription_id: 364100, ...over,
    }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  for (const f of Object.values(chain)) f.mockReturnValue(chain);
  admin.from.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({ data: { user_id: "dono-de-verdade" } });
  delete process.env.STRAVA_SUBSCRIPTION_ID;
});

describe("o webhook do Strava não apaga a corrida dos outros", () => {
  it("o delete é filtrado pelo dono, não só pelo id da atividade", async () => {
    await POST(evento());
    expect(chain.eq).toHaveBeenCalledWith("strava_activity_id", 123);
    expect(chain.eq, "sem este filtro, o id sozinho apaga a corrida de qualquer um")
      .toHaveBeenCalledWith("user_id", "dono-de-verdade");
  });

  it("atleta que nunca conectou o Strava não tem corrida para apagar", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null });
    await POST(evento());
    // `null` significa "não há nada a fazer", nunca "pode fazer em todo mundo".
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("responde 200 mesmo sem apagar — o Strava reenvia o que falha", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null });
    expect((await POST(evento())).status).toBe(200);
  });
});

describe("a assinatura, quando configurada", () => {
  it("recusa evento de outra assinatura", async () => {
    process.env.STRAVA_SUBSCRIPTION_ID = "364100";
    const res = await POST(evento({ subscription_id: 1 }));
    expect(res.status).toBe(403);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("recusa evento sem assinatura nenhuma", async () => {
    process.env.STRAVA_SUBSCRIPTION_ID = "364100";
    expect((await POST(evento({ subscription_id: undefined }))).status).toBe(403);
  });

  it("aceita a nossa", async () => {
    process.env.STRAVA_SUBSCRIPTION_ID = "364100";
    expect((await POST(evento())).status).toBe(200);
    expect(chain.update).toHaveBeenCalled();
  });

  it("sem a variável configurada, o dono continua sendo a trava que vale", async () => {
    // Fica aberta para o Strava enquanto ninguém configurou — mas o filtro de
    // dono, que não depende de configuração, continua de pé.
    await POST(evento({ subscription_id: 7 }));
    expect(chain.eq).toHaveBeenCalledWith("user_id", "dono-de-verdade");
  });
});

describe("o que não é atividade não mexe em nada", () => {
  it("evento de atleta é ignorado", async () => {
    const res = await POST(evento({ object_type: "athlete", aspect_type: "update" }));
    expect(res.status).toBe(200);
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("JSON inválido não derruba a rota", async () => {
    const res = await POST(new NextRequest("http://localhost/api/strava/webhook", {
      method: "POST", body: "nao é json",
    }));
    expect(res.status).toBe(400);
  });
});
