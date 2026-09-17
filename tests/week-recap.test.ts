/**
 * Closing the week: the three questions, answered from data only.
 *
 * Replaces the Monday summary that never ran (debt A1) — and, unlike it, says
 * nothing it cannot show.
 */
import { describe, expect, it } from "vitest";
import { weekRecap, type WeekRecapInput } from "@/lib/week-recap";
import type { DayAdherence, DayStatus, WeekAdherence } from "@/lib/plan-adherence";
import type { WeeklyPlanDay } from "@/types";

const weekStart = "2026-09-07";
const today = "2026-09-17";

const day = (
  key: WeeklyPlanDay["day"], dayPt: string, planned: Partial<WeeklyPlanDay>,
  status: DayStatus, actualKm = 0,
): DayAdherence => ({
  day: key, dayPt, date: "2026-09-07", actualKm, actualMin: 0, status,
  planned: {
    day: key, dayPt, sport: "corrida", type: "easy", label: "Rodagem leve",
    distance_km: 6, description: "", ...planned,
  } as WeeklyPlanDay,
});

const adherence = (days: DayAdherence[]): WeekAdherence => ({
  weekStart, days, score: 75, doneCount: 0, partialCount: 0, adaptedCount: 0, missedCount: 0,
});

const week = adherence([
  day("Mon", "Segunda", { distance_km: 6 }, "done", 6.01),
  day("Tue", "Terça", { type: "strength", label: "Musculação", distance_km: undefined }, "done"),
  day("Wed", "Quarta", { type: "intervals", label: "Subidas 6×45 s", distance_km: 3.5, quality: "hills" }, "adapted", 8.01),
  day("Sat", "Sábado", { type: "long_run", label: "Longão", distance_km: 9.5 }, "missed"),
]);

const nextWeek = {
  weekStart: "2026-09-14",
  days: [
    { day: "Mon", dayPt: "Segunda", sport: "corrida", type: "easy", label: "Rodagem leve", distance_km: 6, description: "" },
    { day: "Wed", dayPt: "Quarta", sport: "corrida", type: "intervals", label: "Tiros curtos 6×200 m", distance_km: 3.5, description: "", quality: "repetitions" },
    { day: "Sat", dayPt: "Sábado", sport: "corrida", type: "long_run", label: "Longão", distance_km: 9.5, description: "" },
  ] as WeeklyPlanDay[],
};

const base: WeekRecapInput = {
  weekStart, adherence: week, previousActualKm: 12, reading: null, checkins: [], nextWeek, today,
};

const text = (section: { headline: string; lines: string[] }) => [section.headline, ...section.lines].join(" ");

describe("a week is only read after it ends", () => {
  it("says nothing about a week still running", () => {
    expect(weekRecap({ ...base, weekStart: "2026-09-14" })).toBeNull();
  });
  it("says nothing when there was neither plan nor run", () => {
    expect(weekRecap({ ...base, adherence: null })).toBeNull();
  });
  it("names the week in the athlete's calendar", () => {
    expect(weekRecap(base)!.range).toBe("7 a 13 de setembro");
  });
});

describe("como foi sua semana", () => {
  it("counts an adapted session as adapted — not as done, not as missed", () => {
    const went = weekRecap(base)!.went;
    expect(went.headline).toBe("14 km em 2 dias de corrida");
    expect(went.lines[0]).toBe("Sessões de corrida: 1 de 3 como previstas · 1 adaptada · 1 não feita.");
  });

  it("says what happened to the session that shapes the week", () => {
    expect(text(weekRecap(base)!.went)).toContain("O treino forte (Subidas 6×45 s) você adaptou");
  });

  it("compares with the week before instead of judging the number alone", () => {
    expect(text(weekRecap(base)!.went)).toContain("2 km a mais que na semana anterior (12 km)");
    expect(text(weekRecap({ ...base, previousActualKm: 14.2 })!.went)).toContain("Praticamente o mesmo volume");
  });

  it("counts strength apart from running", () => {
    expect(text(weekRecap(base)!.went)).toContain("Musculação: 1 de 1 sessão.");
  });

  it("does not dress up a week with no runs", () => {
    const empty = adherence(week.days.map(d => ({ ...d, actualKm: 0, status: "missed" as DayStatus })));
    const went = weekRecap({ ...base, adherence: empty })!.went;
    expect(went.headline).toBe("Nenhuma corrida registrada");
    expect(went.lines).toEqual(["Estavam previstos 19 km."]);
  });
});

describe("o que o treinador entendeu", () => {
  const reading = {
    plannedKm: 19, actualKm: 14, completion: 0.74, status: "short" as const, reason: "life" as const,
    creditedKm: 19, holding: true, ask: null, headline: "Semana curta, volume mantido",
    detail: "Você fez 14 km dos 19 previstos, e os check-ins explicam o motivo.",
  };

  it("repeats the reading that fed the next plan, not a new opinion", () => {
    expect(weekRecap({ ...base, reading })!.understood.headline).toBe("Semana curta, volume mantido");
    expect(weekRecap({ ...base, reading })!.understood.lines[0]).toBe(reading.detail);
  });

  it("lists what the athlete said in the check-ins", () => {
    const recap = weekRecap({ ...base, reading, checkins: [
      { effort: 4, context: "work" }, { effort: 5, context: "sleep" }, { effort: 3, context: "none" },
    ] })!;
    expect(text(recap.understood)).toContain("Nos check-ins você citou: trabalho, dormi pouco.");
    expect(text(recap.understood)).toContain("1 treino foi marcado como muito difícil.");
  });

  it("says the prescription was kept when a session was declared afterwards", () => {
    const swapped = adherence(week.days.map(d => d.day === "Wed" ? {
      ...d,
      planned: {
        ...d.planned,
        adaptation: {
          when: "after" as const, at: "x", reason: null, source: "custom" as const,
          preserves: "", changes: "", verdict: "different" as const,
          doneLabel: "Adaptado: 8×400 m", doneKm: 8, original: d.planned,
        },
      },
    } : d));
    const line = text(weekRecap({ ...base, adherence: swapped })!.understood);
    expect(line).toContain("Na quarta você registrou Adaptado: 8×400 m, com outro objetivo");
    expect(line).toContain("o previsto continua registrado como foi pedido");
  });

  it("admits when there is no reading instead of inventing one", () => {
    expect(text(weekRecap(base)!.understood)).toContain("não há leitura da semana");
  });

  it("surfaces a question still waiting for an answer", () => {
    const asking = { ...reading, ask: "what_happened" as const };
    expect(text(weekRecap({ ...base, reading: asking })!.understood)).toContain("Falta a sua resposta");
  });
});

describe("o que muda na próxima", () => {
  it("puts the consequence in the headline", () => {
    expect(weekRecap(base)!.next.headline).toBe("Volume previsto: 19 km — o mesmo da semana passada");
  });

  it("shows the difference when the plan moved", () => {
    const bigger = { ...nextWeek, days: nextWeek.days.map(d => d.type === "long_run" ? { ...d, distance_km: 11 } : d) };
    expect(weekRecap({ ...base, nextWeek: bigger })!.next.headline).toContain("(+1,5 km)");
  });

  it("explains a week that is held instead of reduced", () => {
    const held = {
      plannedKm: 19, actualKm: 14, completion: 0.74, status: "short" as const, reason: "life" as const,
      creditedKm: 19, holding: true, ask: null, headline: "h", detail: "d",
    };
    expect(text(weekRecap({ ...base, reading: held })!.next)).toContain("não puxou o plano para baixo");
  });

  it("explains a week that does not climb because the athlete asked", () => {
    const eased = {
      plannedKm: 19, actualKm: 19, completion: 1, status: "met" as const, reason: "too_much" as const,
      creditedKm: 19, holding: false, noRamp: true, ask: null, headline: "h", detail: "d",
    };
    expect(text(weekRecap({ ...base, reading: eased })!.next)).toContain("você pediu para aliviar");
  });

  it("names the hard session and the long run of the week ahead", () => {
    const next = text(weekRecap(base)!.next);
    expect(next).toContain("Treino forte: Tiros curtos 6×200 m na quarta.");
    expect(next).toContain("Longão de 9,5 km no sábado.");
  });

  it("does not promise a plan that does not exist yet", () => {
    expect(weekRecap({ ...base, nextWeek: null })!.next.headline).toBe("A próxima semana ainda não foi gerada");
  });
});

describe("weeks written before the quality tag existed", () => {
  it("still names the hard session, by reading it", () => {
    const untagged = adherence(week.days.map(d => d.day === "Wed"
      ? { ...d, planned: { ...d.planned, quality: undefined } } : d));
    const plain = { ...nextWeek, days: nextWeek.days.map(d => ({ ...d, quality: undefined })) };
    const recap = weekRecap({ ...base, adherence: untagged, nextWeek: plain })!;
    expect(text(recap.went)).toContain("O treino forte (Subidas 6×45 s)");
    expect(text(recap.next)).toContain("Treino forte: Tiros curtos 6×200 m na quarta.");
  });

  it("does not mistake an easy run for the session of the week", () => {
    const easyOnly = adherence([day("Mon", "Segunda", { distance_km: 6 }, "done", 6)]);
    expect(text(weekRecap({ ...base, adherence: easyOnly })!.went)).not.toContain("treino forte");
  });
});

describe("a question already answered is not a pending question", () => {
  const asking = {
    plannedKm: 19, actualKm: 0, completion: 0, status: "short" as const, reason: "life" as const,
    creditedKm: 19, holding: true, ask: "does_it_fit" as const,
    headline: "Semana atrapalhada pela rotina", detail: "d",
  };
  it("asks when nothing was answered", () => {
    expect(text(weekRecap({ ...base, reading: asking })!.understood)).toContain("Falta a sua resposta");
  });
  it("stays quiet once the athlete answered", () => {
    expect(text(weekRecap({ ...base, reading: asking, weekAnswered: true })!.understood)).not.toContain("Falta a sua resposta");
  });
});
