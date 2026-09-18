/**
 * "O que está melhorando para mim?" — and the discipline of not saying more
 * than the history shows.
 */
import { describe, expect, it } from "vitest";
import { progressReport, type ProgressInput, type ProgressRun } from "@/lib/progress-reading";
import type { WeeklyPlanDay } from "@/types";

const today = "2026-09-17";           // Thursday; the last closed week is 07–13/09

let seq = 0;
const run = (date: string, km: number, paceSec: number, hr: number | null, extra: Partial<ProgressRun> = {}): ProgressRun => ({
  id: `r${++seq}`, date, distance_km: km, duration_seconds: Math.round(km * paceSec),
  moving_time_seconds: Math.round(km * paceSec), avg_pace_seconds_per_km: paceSec, avg_hr: hr, ...extra,
});

const base = (over: Partial<ProgressInput> = {}): ProgressInput => ({
  today, runs: [], plans: [], checkins: [], weekAnswers: [], raceDates: [], ...over,
});

const reading = (input: ProgressInput, key: string) => progressReport(input).readings.find(r => r.key === key)!;

/** Closed weeks, oldest first: 20/07 … 07/09. */
const WEEKS = ["2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"];
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
/** n runs in the week starting `monday`, on Mon/Wed/Fri/Sat. */
const weekOf = (monday: string, n: number) => [0, 2, 4, 5].slice(0, n).map(d => run(addDays(monday, d), 6, 360, 150));

describe("consistência", () => {
  it("compares the last four weeks with the four before", () => {
    const runs = [...WEEKS.slice(0, 4).flatMap(w => weekOf(w, 1)), ...WEEKS.slice(4).flatMap(w => weekOf(w, 3))];
    const r = reading(base({ runs }), "consistency");
    expect(r.signal).toBe("better");
    expect(r.headline).toBe("Você correu em 8 das últimas 8 semanas.");
    expect(r.detail).toContain("3 corridas por semana");
  });

  it("calls a quarter-run difference stable, not a trend", () => {
    const counts = [1, 2, 3, 2, 2, 3, 2, 0];     // Sérgio's real weeks, 20/07 to 07/09
    const runs = WEEKS.flatMap((w, i) => weekOf(w, counts[i]));
    const r = reading(base({ runs }), "consistency");
    expect(r.signal).toBe("steady");
    expect(r.headline).toBe("Você correu em 7 das últimas 8 semanas.");
  });

  it("does not count the weeks before the athlete started as absences", () => {
    const runs = WEEKS.slice(5).flatMap(w => weekOf(w, 2));
    const r = reading(base({ runs }), "consistency");
    expect(r.headline).toBe("Você correu em 3 das últimas 3 semanas.");
    expect(r.signal).toBe("unknown");
  });
});

describe("rotina × plano", () => {
  const plan = (weekStart: string, runDays: number) => ({
    weekStart,
    days: (["Mon", "Wed", "Fri", "Sat"] as const).slice(0, runDays).map(day =>
      ({ day, dayPt: day, sport: "corrida", type: "easy", label: "Leve", distance_km: 6, description: "" } as WeeklyPlanDay)),
  });

  it("learns that the routine carries fewer runs than the plan asks for", () => {
    const weeks = WEEKS.slice(3);
    const done = [2, 2, 3, 2, 2];
    const input = base({ plans: weeks.map(w => plan(w, 3)), runs: weeks.flatMap((w, i) => weekOf(w, done[i])) });
    const r = reading(input, "routine");
    expect(r.headline).toBe("O plano prevê 3 corridas por semana; sua rotina tem comportado 2 com mais regularidade.");
    expect(r.detail).toContain("nada muda sozinho");
  });

  it("says so when the routine carries the plan", () => {
    const weeks = WEEKS.slice(4);
    const input = base({ plans: weeks.map(w => plan(w, 3)), runs: weeks.flatMap(w => weekOf(w, 3)) });
    expect(reading(input, "routine").headline).toBe("Sua rotina tem comportado as 3 corridas por semana previstas.");
  });

  it("waits for four planned weeks before reading anything", () => {
    const weeks = WEEKS.slice(6);
    const input = base({ plans: weeks.map(w => plan(w, 3)), runs: weeks.flatMap(w => weekOf(w, 1)) });
    expect(reading(input, "routine").signal).toBe("unknown");
  });
});

describe("ritmo em corridas realmente comparáveis", () => {
  const then = ["2026-06-10", "2026-06-17", "2026-06-24", "2026-07-01"];
  const now = ["2026-08-20", "2026-08-27", "2026-09-03", "2026-09-10"];

  it("sees a faster pace at the same distance and heart rate", () => {
    const runs = [
      ...then.map(d => run(d, 6, 380, 158)),
      ...now.map(d => run(d, 6.2, 360, 160)),
    ];
    const r = reading(base({ runs }), "comparable");
    expect(r.signal).toBe("better");
    expect(r.headline).toBe("Mais rápido com o mesmo esforço: 20 s/km em média.");
    expect(r.detail).toContain("4 pares");
  });

  it("does not call a faster run progress when the heart rate was higher", () => {
    const runs = [
      ...then.map(d => run(d, 6, 380, 150)),
      ...now.map(d => run(d, 6, 340, 172)),
    ];
    const r = reading(base({ runs }), "comparable");
    expect(r.signal).toBe("unknown");
    expect(r.headline).toContain("Ainda não há corridas comparáveis suficientes");
  });

  it("never compares an interval session, even when the importer called it easy", () => {
    const runs = [
      ...then.map(d => run(d, 6, 380, 158)),
      ...now.map(d => run(d, 6, 330, 160, { notes: "Aquecimento de 1km, 5 tiros de 400m e desaquecimento" })),
    ];
    expect(reading(base({ runs }), "comparable").signal).toBe("unknown");
  });

  it("keeps hilly runs and hot days apart from flat, cool ones", () => {
    const runs = [
      ...then.map(d => run(d, 6, 380, 158, { elevation_gain_m: 20, temperature_c: 18 })),
      ...now.map(d => run(d, 6, 360, 160, { elevation_gain_m: 150, temperature_c: 18 })),
    ];
    expect(reading(base({ runs }), "comparable").signal).toBe("unknown");
  });

  it("leaves races and adapted days out", () => {
    const adapted: WeeklyPlanDay = {
      day: "Thu", dayPt: "Quinta", sport: "corrida", type: "easy", label: "Leve", distance_km: 6, description: "",
      adaptation: { when: "after", at: "x", reason: null, source: "other_workout", preserves: "", changes: "", original: {} as WeeklyPlanDay },
    };
    const runs = [
      ...then.map(d => run(d, 6, 380, 158)),
      ...now.map(d => run(d, 6, 360, 160)),
    ];
    const plans = [{ weekStart: "2026-08-17", days: [adapted] }, { weekStart: "2026-08-24", days: [adapted] }];
    const r = reading(base({ runs, plans, raceDates: ["2026-09-03"] }), "comparable");
    expect(r.signal).toBe("unknown");       // three of the four recent runs are gone: one pair left
  });

  it("calls a few seconds either way the same pace", () => {
    const runs = [
      ...then.map(d => run(d, 6, 362, 158)),
      ...now.map(d => run(d, 6, 360, 158)),
    ];
    expect(reading(base({ runs }), "comparable").headline).toBe("Mesmo ritmo com o mesmo esforço.");
  });
});

describe("esforço nos mesmos treinos", () => {
  const long = (weekStart: string): { weekStart: string; days: WeeklyPlanDay[] } => ({
    weekStart,
    days: [{ day: "Sat", dayPt: "Sábado", sport: "corrida", type: "long_run", label: "Longão", distance_km: 9.5, description: "" }],
  });

  it("notices the same session getting easier", () => {
    const weeks = WEEKS.slice(4);
    const runs = weeks.map(w => run(addDays(w, 5), 9.5, 380, 155));
    const efforts = [4, 4, 3, 3];
    const input = base({
      runs, plans: weeks.map(long),
      checkins: runs.map((r, i) => ({ run_id: r.id, effort: efforts[i], context: null })),
    });
    const r = reading(input, "effort");
    expect(r.signal).toBe("better");
    expect(r.headline).toBe("O longão passou de difícil para moderado.");
  });

  it("says honestly that two check-ins are not a trend", () => {
    const runs = [run("2026-09-14", 6, 362, 159), run("2026-09-16", 8, 402, 159)];
    const plans = [{ weekStart: "2026-09-14", days: [
      { day: "Mon", dayPt: "Segunda", sport: "corrida", type: "easy", label: "Rodagem leve", distance_km: 6, description: "" } as WeeklyPlanDay,
    ] }];
    const r = reading(base({ runs, plans, checkins: [
      { run_id: runs[0].id, effort: 2, context: "none" },
      { run_id: runs[1].id, effort: 4, context: "fatigue", execution: "adapted" },
    ] }), "effort");
    expect(r.signal).toBe("unknown");
    expect(r.detail).toBe("1 treino avaliado desde 14/09. Com quatro avaliações do mesmo tipo de treino dá para ver se ele ficou mais leve.");
  });
});

describe("adaptações", () => {
  it("counts how the weeks bent, and names the most common reason", () => {
    const hills: WeeklyPlanDay = {
      day: "Wed", dayPt: "Quarta", sport: "corrida", type: "intervals", label: "Subidas 6×45 s", distance_km: 3.5, description: "",
      adaptation: { when: "after", at: "x", reason: null, source: "custom", preserves: "", changes: "", original: {} as WeeklyPlanDay },
    };
    const runs = [run("2026-09-01", 6, 360, 160), run("2026-09-04", 10, 377, 156)];
    const r = reading(base({
      runs,
      plans: [{ weekStart: "2026-09-14", days: [hills] }],
      checkins: [{ run_id: runs[0].id, effort: 3, context: "work" }, { run_id: runs[1].id, effort: 3, context: "schedule" }],
      weekAnswers: [{ week_start: "2026-09-07", reason: "life" }],
    }), "adaptations");
    expect(r.headline).toBe("Nas últimas 8 semanas: 1 treino trocado e registrado depois · rotina ou agenda 3×.");
  });

  it("says when nothing bent", () => {
    expect(reading(base({ runs: [run("2026-09-01", 6, 360, 160)] }), "adaptations").headline)
      .toBe("Nenhuma adaptação ou interrupção registrada nas últimas 8 semanas.");
  });
});

describe("the summary never claims more than the readings", () => {
  it("puts what is unknown under 'ainda sem dados'", () => {
    const counts = [1, 2, 3, 2, 2, 3, 2, 0];
    // No heart rate on these runs, so nothing is comparable — and the summary must say so.
    const runs = WEEKS.flatMap((w, i) => weekOf(w, counts[i])).map(r => ({ ...r, avg_hr: null }));
    const summary = progressReport(base({ runs })).summary;
    expect(summary).toContain("Estável: consistência.");
    expect(summary).toContain("Ainda sem dados para afirmar: ritmo em corridas comparáveis, esforço nos mesmos treinos.");
    expect(summary).not.toContain("Melhorando");
  });
});
