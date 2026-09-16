import { describe, it, expect } from "vitest";
import {
  applySwap, undoSwap, swapOffer, canMoveToTomorrow, easyReplacement, dayKeyOf,
} from "@/lib/session-swap";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const d = (day: WeeklyPlanDay["day"], dayPt: string, type: WeeklyPlanDay["type"], label: string, extra: Partial<WeeklyPlanDay> = {}): WeeklyPlanDay =>
  ({ day, dayPt, type, label, description: `${label} desc`, ...extra });

/** A semana do Sérgio de 14/09: leve → tiro → longão, musculação entre eles. */
function semana(): WeeklyPlanData {
  return {
    week_start: "2026-09-14", generated_at: "x",
    days: [
      d("Mon", "Segunda", "easy", "Rodagem leve", { distance_km: 6, pace: "6:40–7:10/km" }),
      d("Tue", "Terça", "strength", "Musculação"),
      d("Wed", "Quarta", "intervals", "Subidas 6×45 s", { distance_km: 3.5 }),
      d("Thu", "Quinta", "strength", "Musculação"),
      d("Fri", "Sexta", "strength", "Musculação"),
      d("Sat", "Sábado", "long_run", "Longão", { distance_km: 9.5 }),
      d("Sun", "Domingo", "rest", "Descanso"),
    ],
  };
}

describe("o que oferecer", () => {
  it("recuperação baixa num dia de tiro oferece as duas trocas", () => {
    expect(swapOffer({ plan: semana(), todayKey: "Wed", verdict: "baixa", done: false }))
      .toEqual({ options: ["easy", "tomorrow"], undo: false });
  });

  it("recuperação boa não oferece nada — o plano segue", () => {
    expect(swapOffer({ plan: semana(), todayKey: "Wed", verdict: "moderada", done: false })).toBeNull();
    expect(swapOffer({ plan: semana(), todayKey: "Wed", verdict: "alta", done: false })).toBeNull();
  });

  it("dia leve não tem o que aliviar", () => {
    expect(swapOffer({ plan: semana(), todayKey: "Mon", verdict: "baixa", done: false })).toBeNull();
  });

  it("treino já feito não é trocado", () => {
    expect(swapOffer({ plan: semana(), todayKey: "Wed", verdict: "baixa", done: true })).toBeNull();
  });

  it("depois de trocar, só resta desfazer", () => {
    const r = applySwap(semana(), "Wed", "easy", "Recuperação 38");
    if ("error" in r) throw new Error(r.error);
    expect(swapOffer({ plan: r.plan, todayKey: "Wed", verdict: "baixa", done: false }))
      .toEqual({ options: [], undo: true });
  });
});

describe("passar para amanhã", () => {
  it("tiro de quarta pode ir para quinta (musculação), longão só no sábado", () => {
    expect(canMoveToTomorrow(semana(), "Wed")).toBe(true);
  });

  it("não cola dois dias fortes: sexta antes do longão não recebe tiro", () => {
    const p = semana();
    p.days[2] = d("Wed", "Quarta", "strength", "Musculação");
    p.days[3] = d("Thu", "Quinta", "intervals", "Tiro", { distance_km: 4 });
    // Quinta → sexta deixaria o tiro colado no longão de sábado.
    expect(canMoveToTomorrow(p, "Thu")).toBe(false);
  });

  it("amanhã forte não recebe outro treino forte", () => {
    expect(canMoveToTomorrow(semana(), "Fri")).toBe(false);   // amanhã é o longão
  });

  it("domingo não empurra para a semana que vem", () => {
    const p = semana();
    p.days[6] = d("Sun", "Domingo", "long_run", "Longão", { distance_km: 10 });
    expect(canMoveToTomorrow(p, "Sun")).toBe(false);
  });

  it("troca as sessões mas mantém os dias no lugar", () => {
    const r = applySwap(semana(), "Wed", "tomorrow", "Recuperação 38", "2026-09-16T10:00:00Z");
    if ("error" in r) throw new Error(r.error);
    const wed = r.plan.days.find(x => x.day === "Wed")!;
    const thu = r.plan.days.find(x => x.day === "Thu")!;
    expect(wed.label).toBe("Musculação");
    expect(wed.dayPt).toBe("Quarta");
    expect(wed.swap?.kind).toBe("tomorrow");
    expect(thu.label).toBe("Subidas 6×45 s");
    expect(thu.dayPt).toBe("Quinta");
    expect(thu.movedFrom).toBe("Quarta");
  });

  it("desfazer devolve os dois dias exatamente como eram", () => {
    const original = semana();
    const r = applySwap(original, "Wed", "tomorrow", "x");
    if ("error" in r) throw new Error(r.error);
    const u = undoSwap(r.plan, "Wed");
    if ("error" in u) throw new Error(u.error);
    expect(u.plan).toEqual(original);
  });
});

describe("trocar por leve", () => {
  it("vira rodagem leve curta, no ritmo leve da própria semana", () => {
    const r = applySwap(semana(), "Wed", "easy", "Recuperação 38");
    if ("error" in r) throw new Error(r.error);
    const wed = r.plan.days.find(x => x.day === "Wed")!;
    expect(wed.type).toBe("easy");
    expect(wed.pace).toBe("6:40–7:10/km");
    expect(wed.distance_km).toBe(4);   // metade de 3,5, com piso de 4
    expect(wed.structure).toBeUndefined();
    expect(wed.swap?.original.label).toBe("Subidas 6×45 s");
  });

  it("longão reduzido pela metade", () => {
    expect(easyReplacement(semana().days[5], semana()).distance_km).toBe(5);
  });

  it("não mexe em nenhum outro dia", () => {
    const original = semana();
    const r = applySwap(original, "Wed", "easy", "x");
    if ("error" in r) throw new Error(r.error);
    r.plan.days.forEach((day, i) => { if (day.day !== "Wed") expect(day).toEqual(original.days[i]); });
  });

  it("desfazer devolve o tiro", () => {
    const original = semana();
    const r = applySwap(original, "Wed", "easy", "x");
    if ("error" in r) throw new Error(r.error);
    const u = undoSwap(r.plan, "Wed");
    if ("error" in u) throw new Error(u.error);
    expect(u.plan).toEqual(original);
  });

  it("não troca duas vezes", () => {
    const r = applySwap(semana(), "Wed", "easy", "x");
    if ("error" in r) throw new Error(r.error);
    expect(applySwap(r.plan, "Wed", "easy", "x")).toHaveProperty("error");
  });
});

describe("dia da semana", () => {
  it("datas viram as chaves do plano", () => {
    expect(dayKeyOf("2026-09-14")).toBe("Mon");
    expect(dayKeyOf("2026-09-20")).toBe("Sun");
  });
});
