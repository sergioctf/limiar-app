import { describe, it, expect } from "vitest";
import { buildToday } from "@/lib/today";

/**
 * A tela inicial abria com 26 blocos competindo entre si e não respondia a
 * pergunta que um app de treino existe para responder: o que eu faço hoje.
 *
 * Este motor decide isso — e decide de forma adaptada, porque o app tem
 * atletas em estados muito diferentes: 5 de 7 nunca fizeram o teste de 3 km e
 * por isso não têm ritmo nenhum prescrito, e alguns não têm plano na semana.
 * Mostrar "Rodagem leve" sem ritmo para quem nunca calibrou é oferecer metade
 * de uma resposta.
 */

const dia = (over: Record<string, unknown> = {}) => ({
  day: "Wed", dayPt: "Quarta", type: "easy", sport: "corrida",
  label: "Rodagem leve", distance_km: 6, pace: "5:54–6:33/km",
  description: "d", ...over,
});

const plano = (days: unknown[]) => ({ week_start: "2026-08-31", days } as never);

const base = {
  plan: plano([dia()]),
  runs: [],
  today: "2026-09-02",      // quarta
  weekStart: "2026-08-31",
  hasTest: true,
};

describe("o que fazer hoje", () => {
  it("nomeia a sessão do dia", () => {
    const t = buildToday(base as never);
    expect(t.state).toBe("planned");
    expect(t.headline).toContain("Rodagem leve");
  });

  it("mostra o alvo de ritmo quando existe", () => {
    expect(buildToday(base as never).detail).toContain("5:54");
  });

  it("reconhece descanso como resposta, não como ausência", () => {
    const t = buildToday({ ...base, plan: plano([dia({ type: "rest", label: "Descanso", distance_km: null })]) } as never);
    expect(t.state).toBe("rest");
    expect(t.headline).toMatch(/descanso/i);
  });

  it("sabe quando já foi feito", () => {
    const t = buildToday({ ...base, runs: [{ date: "2026-09-02", distance_km: 6.1 }] } as never);
    expect(t.state).toBe("done");
    expect(t.doneKm).toBeCloseTo(6.1, 1);
  });

  it("um treino parcial ainda conta como feito, não como falha", () => {
    // 5 de 6 km é o treino; chamar isso de perdido ensina a ignorar o app.
    const t = buildToday({ ...base, runs: [{ date: "2026-09-02", distance_km: 5.0 }] } as never);
    expect(t.state).toBe("done");
  });

  it("não confunde corrida de outro dia com a de hoje", () => {
    const t = buildToday({ ...base, runs: [{ date: "2026-09-01", distance_km: 6 }] } as never);
    expect(t.state).toBe("planned");
  });
});

describe("adaptação ao estado do atleta", () => {
  it("sem plano, o convite é gerar um", () => {
    const t = buildToday({ ...base, plan: null } as never);
    expect(t.state).toBe("no_plan");
    expect(t.prompt?.kind).toBe("generate");
  });

  it("sem teste, calibrar vem antes de qualquer ritmo", () => {
    // 5 dos 7 atletas estão aqui: plano com estrutura e nenhum ritmo.
    const t = buildToday({ ...base, hasTest: false } as never);
    expect(t.prompt?.kind).toBe("test");
  });

  it("mas a sessão do dia continua sendo mostrada", () => {
    // Bloquear a tela por falta de teste puniria quem só quer treinar hoje.
    const t = buildToday({ ...base, hasTest: false } as never);
    expect(t.headline).toContain("Rodagem leve");
  });

  it("quem já calibrou não é incomodado", () => {
    expect(buildToday(base as never).prompt).toBeUndefined();
  });

  it("o teste agendado no plano aparece como a sessão do dia", () => {
    const t = buildToday({
      ...base, hasTest: false,
      plan: plano([dia({ type: "test", label: "Teste de 3 km", distance_km: 6 })]),
    } as never);
    expect(t.headline).toContain("Teste de 3 km");
    expect(t.prompt).toBeUndefined();   // já está fazendo — não precisa do aviso
  });
});

describe("robustez", () => {
  it("um dia que não existe no plano não quebra a tela", () => {
    const t = buildToday({ ...base, today: "2026-09-06" } as never);
    expect(t.state).toBe("no_plan");
  });

  it("plano vazio é tratado como sem plano", () => {
    expect(buildToday({ ...base, plan: plano([]) } as never).state).toBe("no_plan");
  });

  it("musculação também é uma resposta para hoje", () => {
    const t = buildToday({ ...base, plan: plano([dia({ type: "strength", label: "Musculação", distance_km: null })]) } as never);
    expect(t.state).toBe("planned");
    expect(t.headline).toContain("Musculação");
  });
});
