/**
 * Conversar sobre a semana: propor não é aplicar.
 *
 * Até 24/09 a conversa tinha uma chamada só, que gravava. O modelo nunca
 * escreveu o plano — ele escolhe de um vocabulário fixo (`plan-edit.ts`) e o
 * motor aplica —, mas o atleta lia sobre a mudança depois de ela já estar
 * salva. A ADR-05 diz o contrário: propõe, ele confirma.
 *
 * E no confirmar, o servidor refaz as edições sobre o plano **guardado**, não
 * sobre o que o navegador mostrou.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, chain, processPlanFeedback, extractAthleteNotes } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["select", "eq", "is", "order", "limit", "insert", "update", "or"]) chain[name] = vi.fn();
  return {
    chain,
    db: { auth: { getUser: vi.fn() }, from: vi.fn() },
    processPlanFeedback: vi.fn(),
    extractAthleteNotes: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: () => db, createAdminClient: () => db }));
vi.mock("@/lib/ai", () => ({ processPlanFeedback, extractAthleteNotes }));

import { POST } from "@/app/api/coach/weekly-plan/chat/route";

const week = "2026-09-21";
const plan = {
  week_start: week, generated_at: "x",
  days: [
    { day: "Mon", dayPt: "Segunda", type: "easy", sport: "corrida", label: "Rodagem leve", distance_km: 6, description: "" },
    { day: "Sat", dayPt: "Sábado", type: "long_run", sport: "corrida", label: "Longão", distance_km: 11.5, description: "" },
  ],
};

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/coach/weekly-plan/chat", { method: "POST", body: JSON.stringify(body) });
const post = (body: unknown) => POST(req(body));

beforeEach(() => {
  vi.resetAllMocks();
  for (const f of Object.values(chain)) f.mockReturnValue(chain);
  db.from.mockReturnValue(chain);
  db.auth.getUser.mockResolvedValue({ data: { user: { id: "sergio" } } });
  // A extração de memória roda solta (fire-and-forget) e nunca deve derrubar a rota.
  extractAthleteNotes.mockResolvedValue([]);
  // Nenhuma nota de perfil, e o plano guardado quando alguém pedir.
  chain.limit.mockResolvedValue({ data: [{ id: "report-1", full_report: JSON.stringify(plan) }] });
  chain.select.mockImplementation(() => chain);
});

describe("a conversa propõe", () => {
  it("não grava o plano ao propor", async () => {
    processPlanFeedback.mockResolvedValue({
      updatedPlan: { ...plan, days: [{ ...plan.days[0], distance_km: 8 }, plan.days[1]] },
      assistantMessage: "Posso deixar assim:\n• Segunda: 6 km → 8 km",
      edits: [{ kind: "set_distance", day: "Mon", km: 8 }],
      changes: ["Segunda: 6 km → 8 km"],
      rejected: [],
    });

    const res = await post({ message: "aumenta a segunda para 8", currentPlan: plan });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.changes).toEqual(["Segunda: 6 km → 8 km"]);
    expect(data.edits).toHaveLength(1);
    // O que importa: nada foi salvo.
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("uma pergunta não vira proposta", async () => {
    processPlanFeedback.mockResolvedValue({
      updatedPlan: null, assistantMessage: "O longão é no sábado.",
      edits: [], changes: [], rejected: [],
    });

    const data = await (await post({ message: "quando é o longão?", currentPlan: plan })).json();
    expect(data.edits).toEqual([]);
    expect(chain.update).not.toHaveBeenCalled();
  });
});

describe("e aplica só quando confirmam", () => {
  it("grava as edições recalculadas sobre o plano guardado", async () => {
    chain.select.mockImplementation(() => chain);
    chain.update.mockReturnValue(chain);
    chain.eq.mockImplementation(() => chain);
    // O update termina com .select("id") devolvendo a linha escrita.
    let selectCalls = 0;
    chain.select.mockImplementation(() => { selectCalls++; return selectCalls > 1 ? Promise.resolve({ data: [{ id: "report-1" }] }) : chain; });

    const res = await post({ apply: true, week, edits: [{ kind: "set_distance", day: "Mon", km: 8 }] });
    const data = await res.json();

    expect(data.applied).toBe(true);
    expect(chain.update).toHaveBeenCalled();
    // O plano salvo é o do banco com a edição aplicada — não o que veio do navegador.
    const saved = JSON.parse((chain.update.mock.calls[0][0] as { full_report: string }).full_report);
    expect(saved.days.find((d: { day: string }) => d.day === "Mon").distance_km).toBe(8);
    expect(saved.days.find((d: { day: string }) => d.day === "Sat").distance_km).toBe(11.5);
  });

  it("recusa um pedido de aplicar sem edições", async () => {
    const res = await post({ apply: true, week, edits: [] });
    expect(res.status).toBe(400);
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("não aplica nada para quem não está logado", async () => {
    db.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await post({ apply: true, week, edits: [{ kind: "set_distance", day: "Mon", km: 8 }] });
    expect(res.status).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });
});
