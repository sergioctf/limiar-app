import { describe, it, expect } from "vitest";
import {
  addDays, hoursLabel, buildVital, buildSleepWeek, readinessOn, recoveryHistory, recoveryTrend,
  sessionAdvice, buildMonitor, watchWeight, CALIBRATION_NIGHTS, type LoadDay,
} from "@/lib/health-view";
import type { WellnessData, WeeklyPlanDay } from "@/types";

const HOJE = "2026-09-14";

function row(date: string, f: Partial<WellnessData> = {}): WellnessData {
  return {
    date, sleep_seconds: null, sleep_score: null, hrv_ms: null, hrv_status: null,
    resting_hr: null, stress_avg: null, body_battery: null, source: "intervals", ...f,
  };
}

/** `n` nights before `date` with the same readings — a steady baseline. */
function steady(n: number, f: Partial<WellnessData>, date = HOJE): WellnessData[] {
  return Array.from({ length: n }, (_, i) => row(addDays(date, -(i + 1)), f));
}

describe("datas e rótulos", () => {
  it("soma dias atravessando o mês", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });
  it("sono em horas e minutos", () => {
    expect(hoursLabel(7.2)).toBe("7h12");
    expect(hoursLabel(6)).toBe("6h00");
    expect(hoursLabel(null)).toBe("—");
  });
});

describe("vitais contra a média do próprio atleta", () => {
  it("HRV acima da média é bom", () => {
    const rows = [...steady(20, { hrv_ms: 40 }), row(HOJE, { hrv_ms: 46 })];
    const v = buildVital("hrv", rows, HOJE);
    expect(v.baseline).toBe(40);
    expect(v.deltaPct).toBeCloseTo(0.15);
    expect(v.tone).toBe("good");
    expect(v.note).toContain("15% acima");
  });

  it("HRV bem abaixo da média é alerta", () => {
    const rows = [...steady(20, { hrv_ms: 50 }), row(HOJE, { hrv_ms: 38 })];
    expect(buildVital("hrv", rows, HOJE).tone).toBe("alert");
  });

  it("a média nunca inclui a noite que está julgando", () => {
    // Uma noite ruim puxava a própria régua para baixo e parecia menos ruim.
    const rows = [...steady(10, { hrv_ms: 50 }), row(HOJE, { hrv_ms: 20 })];
    expect(buildVital("hrv", rows, HOJE).baseline).toBe(50);
  });

  it("FC de repouso: subir é ruim", () => {
    const rows = [...steady(20, { resting_hr: 50 }), row(HOJE, { resting_hr: 57 })];
    const v = buildVital("rhr", rows, HOJE);
    expect(v.delta).toBe(7);
    expect(v.tone).toBe("alert");
  });

  it("FC de repouso: descer é bom", () => {
    const rows = [...steady(20, { resting_hr: 50 }), row(HOJE, { resting_hr: 48 })];
    expect(buildVital("rhr", rows, HOJE).tone).toBe("good");
  });

  it("com poucas noites, calibra em vez de julgar", () => {
    const rows = [...steady(4, { hrv_ms: 40 }), row(HOJE, { hrv_ms: 20 })];
    const v = buildVital("hrv", rows, HOJE);
    expect(v.calibrating).toBe(true);
    expect(v.tone).toBe("neutral");
    expect(v.note).toContain(`4 de ${CALIBRATION_NIGHTS}`);
  });

  it("sem a noite de hoje, usa a de ontem", () => {
    const rows = [...steady(10, { hrv_ms: 40 }, addDays(HOJE, -1)), row(addDays(HOJE, -1), { hrv_ms: 44 })];
    const v = buildVital("hrv", rows, HOJE);
    expect(v.valueDate).toBe(addDays(HOJE, -1));
    expect(v.value).toBe(44);
  });

  it("leitura de anteontem já não é 'esta noite'", () => {
    const v = buildVital("hrv", [row(addDays(HOJE, -2), { hrv_ms: 44 })], HOJE);
    expect(v.value).toBeNull();
  });

  it("sono tem piso absoluto: 5 h não vira normal por hábito", () => {
    const rows = [...steady(20, { sleep_seconds: 5 * 3600 }), row(HOJE, { sleep_seconds: 5 * 3600 })];
    expect(buildVital("sleep", rows, HOJE).tone).toBe("alert");
  });

  it("a série tem 30 dias com lacunas preservadas", () => {
    const v = buildVital("hrv", [row(HOJE, { hrv_ms: 40 })], HOJE);
    expect(v.series).toHaveLength(30);
    expect(v.series[29]).toEqual({ date: HOJE, value: 40 });
    expect(v.series[0].value).toBeNull();
  });
});

describe("semana de sono", () => {
  it("média e dívida só sobre as noites medidas", () => {
    const rows = [
      row(HOJE, { sleep_seconds: 6.5 * 3600, sleep_score: 70 }),
      row(addDays(HOJE, -1), { sleep_seconds: 8 * 3600 }),
      row(addDays(HOJE, -2), { sleep_seconds: 7 * 3600 }),
    ];
    const w = buildSleepWeek(rows, HOJE);
    expect(w.nights).toHaveLength(7);
    expect(w.measured).toBe(3);
    expect(w.avgHours).toBeCloseTo(7.1667, 3);
    expect(w.debtHours).toBe(1.5);   // 1,0 + 0 + 0,5
    expect(w.nights[6].score).toBe(70);
  });
});

describe("prontidão ao longo do tempo", () => {
  const load: Record<string, LoadDay> = { [HOJE]: { tss: 80, tsb: -10 } };

  it("só com carga de treino, não finge ter relógio", () => {
    const h = recoveryHistory([], load, HOJE, 14);
    expect(h).toHaveLength(14);
    expect(h[13].score).not.toBeNull();
    expect(h[13].hasWatch).toBe(false);
    expect(h[13].load).toBe(80);
    expect(h[0].score).toBeNull();   // nenhum sinal naquele dia
  });

  it("com relógio, marca que o relógio participou", () => {
    const rows = [...steady(10, { hrv_ms: 40, resting_hr: 50 }), row(HOJE, { hrv_ms: 44, resting_hr: 49, sleep_score: 85 })];
    const r = readinessOn(HOJE, rows, load);
    expect(r.components.some(c => c.key === "hrv")).toBe(true);
    expect(recoveryHistory(rows, load, HOJE, 1)[0].hasWatch).toBe(true);
  });

  it("tendência compara esta semana com a anterior", () => {
    const mk = (score: number) => ({ date: "x", score, verdict: null, hasWatch: true, load: 0 });
    const t = recoveryTrend([...Array(7).fill(mk(60)), ...Array(7).fill(mk(70))]);
    expect(t).toEqual({ avg: 70, change: 10 });
  });

  it("sem dias suficientes, não inventa tendência", () => {
    expect(recoveryTrend([{ date: "x", score: 70, verdict: "alta", hasWatch: true, load: 0 }])).toBeNull();
  });
});

describe("conselho para o treino do dia", () => {
  const dia = (type: WeeklyPlanDay["type"], label: string, distance_km?: number): WeeklyPlanDay =>
    ({ day: "Mon", dayPt: "Segunda", type, label, distance_km, description: "" });
  const prontidao = (verdict: "alta" | "moderada" | "baixa", watch = true) => ({
    score: verdict === "alta" ? 80 : verdict === "moderada" ? 55 : 30,
    verdict,
    components: watch
      ? [{ key: "hrv" as const, label: "HRV", score: 80, weight: 0.18, auto: true }]
      : [{ key: "tsb" as const, label: "Forma", score: 80, weight: 0.2, auto: true }],
    recommendation: "rec",
    source: watch ? "wearable" as const : "none" as const,
  });

  it("alta + tiro: faça como planejado, citando a sessão", () => {
    const a = sessionAdvice(prontidao("alta"), dia("intervals", "Subidas 6×45 s", 3.5));
    expect(a.detail).toContain("Subidas 6×45 s 3,5 km");
    expect(a.detail).toContain("como planejado");
  });

  it("o título acompanha o dia: não manda 'treinar forte' num dia leve", () => {
    expect(sessionAdvice(prontidao("alta"), dia("easy", "Rodagem leve", 6)).headline).toBe("Corpo recuperado");
    expect(sessionAdvice(prontidao("alta"), dia("intervals", "Tiro")).headline).toBe("Pronto para treinar forte");
  });

  it("baixa + tiro: sugere trocar por leve", () => {
    expect(sessionAdvice(prontidao("baixa"), dia("intervals", "Tiro")).detail).toContain("rodagem leve");
  });

  it("descanso no plano não vira sugestão de treinar", () => {
    expect(sessionAdvice(prontidao("alta"), dia("rest", "Descanso")).detail).toContain("descanso no plano");
  });

  it("sem relógio, diz que a base é só a carga", () => {
    expect(sessionAdvice(prontidao("alta", false), dia("easy", "Rodagem", 6)).detail).toContain("sem dados do relógio");
  });

  it("treino já feito não é mandado fazer de novo", () => {
    // Segunda, 14/09: Sérgio correu os 6 km de manhã e a tela ainda dizia
    // "Rodagem leve 6 km hoje: leve de verdade, como planejado".
    const a = sessionAdvice(prontidao("alta"), dia("easy", "Rodagem leve", 6), {
      doneKm: 6.01,
      tomorrow: dia("strength", "Musculação"),
    });
    expect(a.headline).toBe("Treino de hoje feito");
    expect(a.detail).toContain("6,0 km");
    expect(a.detail).not.toContain("como planejado");
    expect(a.detail).toContain("Amanhã: Musculação");
  });

  it("musculação feita também conta", () => {
    const a = sessionAdvice(prontidao("moderada"), dia("strength", "Musculação"), { strengthDone: true });
    expect(a.headline).toBe("Treino de hoje feito");
  });

  it("depois do treino feito, recuperação baixa vira conselho para o resto do dia", () => {
    const a = sessionAdvice(prontidao("baixa"), dia("intervals", "Tiro", 5), { doneKm: 5 });
    expect(a.detail).toContain("sono");
  });

  it("sem plano, cai na recomendação geral", () => {
    expect(sessionAdvice(prontidao("moderada"), null).detail).toContain("rec");
  });
});

describe("monitor e peso do relógio", () => {
  it("mostra só leituras recentes", () => {
    const rows = [
      row(HOJE, { raw: { steps: 8421 } }),
      row(addDays(HOJE, -1), { raw: { spO2: 96 } }),
      row(addDays(HOJE, -10), { raw: { respiration: 14 } }),   // velho demais
    ];
    const m = buildMonitor(rows, HOJE);
    expect(m.map(i => i.key)).toEqual(["spO2", "steps"]);
    expect(m.find(i => i.key === "steps")!.value).toBe("8.421");
  });

  it("peso do relógio para quem nunca pesou aqui", () => {
    expect(watchWeight([row(addDays(HOJE, -3), { raw: { weight: 77.2 } })], HOJE)).toBe(77.2);
    expect(watchWeight([row(addDays(HOJE, -90), { raw: { weight: 77.2 } })], HOJE)).toBeNull();
  });
});
