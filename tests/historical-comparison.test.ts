import { describe, it, expect } from "vitest";
import { analyzeHistoricalComparison, type EffortLite } from "@/lib/historical-comparison";
import type { Run } from "@/types";

/**
 * The dashboard's records and the coach's records card must be the same number.
 * They were not: the dashboard bucketed whole activities within ±8% of the
 * target and reported the best average pace, which both overstated (a 9.2 km run
 * counted as a 10K) and understated (a 5 km covered inside a long run was
 * invisible — 5:57/km shown against 5:19/km actually run).
 */

const run = (o: Partial<Run> & { id: string; date: string; distance_km: number; duration_seconds: number }): Run => ({
  user_id: "u", strava_activity_id: null, source: "manual", name: "Corrida",
  type: "easy", moving_time_seconds: null, elapsed_time_seconds: null,
  avg_pace_seconds_per_km: Math.round(o.duration_seconds / o.distance_km),
  avg_speed_mps: null, max_speed_mps: null, avg_hr: null, max_hr: null,
  elevation_gain_m: null, avg_cadence: null, calories: null, suffer_score: null,
  map_polyline: null, ...o,
} as Run);

const find = (recs: ReturnType<typeof analyzeHistoricalComparison>, label: string) =>
  recs.find(r => r.label === label)!;

describe("um recorde nunca é mais fácil que a distância que ele afirma", () => {
  it("uma corrida de 9,2 km não vira recorde de 10K", () => {
    // O defeito antigo: ±8% aceitava 9,2 km como "10K" e reportava o ritmo
    // sustentado por 800 m a menos como se fosse de 10 km.
    const recs = analyzeHistoricalComparison([
      run({ id: "a", date: "2026-05-01", distance_km: 9.2, duration_seconds: 2760 }),
    ]);
    expect(find(recs, "10K").personalBest).toBeUndefined();
  });

  it("mas aceita 9,98 km, que é ruído de GPS num percurso certo", () => {
    const recs = analyzeHistoricalComparison([
      run({ id: "a", date: "2026-05-01", distance_km: 9.98, duration_seconds: 3000 }),
    ]);
    expect(find(recs, "10K").personalBest).toBeDefined();
  });

  it("uma corrida um pouco maior serve, e o tempo dela é limite superior", () => {
    // Correu 10,4 km em 54:00 → seus 10 km levaram no máximo isso. Reportar
    // 54:00 erra a favor do conservador, nunca a favor do atleta.
    const recs = analyzeHistoricalComparison([
      run({ id: "a", date: "2026-05-01", distance_km: 10.4, duration_seconds: 3240 }),
    ]);
    expect(find(recs, "10K").personalBest!.seconds).toBe(3240);
  });

  it("uma corrida muito maior não serve como marca da menor", () => {
    // 21 km não dizem qual seria seu 10 km — para isso existe o esforço.
    const recs = analyzeHistoricalComparison([
      run({ id: "a", date: "2026-05-01", distance_km: 21.4, duration_seconds: 7000 }),
    ]);
    expect(find(recs, "10K").personalBest).toBeUndefined();
  });
});

describe("o trecho dentro de um longão ganha da corrida inteira", () => {
  const runs = [
    run({ id: "curta", date: "2026-07-15", distance_km: 5.01, duration_seconds: 1789 }), // 5:57/km
    run({ id: "longa", date: "2026-06-06", distance_km: 21.4, duration_seconds: 7071 }),
  ];
  const efforts: EffortLite[] = [
    { run_id: "longa", distance_m: 5000, seconds: 1594, run_date: "2026-06-06" },       // 5:19/km
  ];

  it("usa o esforço, não a média da corrida de 5 km", () => {
    const rec = find(analyzeHistoricalComparison(runs, efforts), "5K").personalBest!;
    expect(rec.seconds).toBe(1594);
    expect(rec.pace).toBe("5:19");
  });

  it("diz que veio de dentro de outro treino", () => {
    const rec = find(analyzeHistoricalComparison(runs, efforts), "5K").personalBest!;
    expect(rec.fromInsideRun).toBe(true);
    expect(rec.activityKm).toBeCloseTo(21.4, 1);
  });

  it("não marca como 'de dentro' um esforço que é a corrida toda", () => {
    const rec = find(analyzeHistoricalComparison(
      [runs[0]],
      [{ run_id: "curta", distance_m: 5000, seconds: 1780, run_date: "2026-07-15" }],
    ), "5K").personalBest!;
    expect(rec.fromInsideRun).toBe(false);
  });

  it("o esforço substitui a corrida inteira, não concorre com ela", () => {
    // Se ambos entrassem, uma corrida cujo esforço já foi medido apareceria
    // duas vezes na lista de candidatos.
    const recs = analyzeHistoricalComparison(
      [run({ id: "x", date: "2026-07-15", distance_km: 5.01, duration_seconds: 1789 })],
      [{ run_id: "x", distance_m: 5000, seconds: 1780, run_date: "2026-07-15" }],
    );
    expect(find(recs, "5K").personalBest!.seconds).toBe(1780);
  });
});

describe("tempo e ritmo contam a mesma história", () => {
  const recs = analyzeHistoricalComparison(
    [run({ id: "a", date: "2026-06-06", distance_km: 21.4, duration_seconds: 7071 })],
    [{ run_id: "a", distance_m: 10000, seconds: 3236, run_date: "2026-06-06" }],
  );
  const rec = find(recs, "10K").personalBest!;

  it("o ritmo é o tempo dividido pela distância nominal", () => {
    expect(rec.paceSeconds).toBe(Math.round(3236 / 10));
  });

  it("formata o tempo de forma legível", () => {
    expect(rec.time).toBe("53:56");
  });

  it("passa de uma hora sem virar 5:56", () => {
    const longo = analyzeHistoricalComparison(
      [run({ id: "b", date: "2026-06-06", distance_km: 21.4, duration_seconds: 8000 })],
      [{ run_id: "b", distance_m: 21097, seconds: 6941, run_date: "2026-06-06" }],
    );
    expect(find(longo, "Meia-maratona").personalBest!.time).toBe("1:55:41");
  });
});

describe("a comparação mensal sai da mesma lista", () => {
  const hoje = new Date();
  const esteMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-10`;
  const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 10)
    .toISOString().slice(0, 10);

  const runs = [
    run({ id: "a", date: mesPassado, distance_km: 10.1, duration_seconds: 3300 }),
    run({ id: "b", date: esteMes,    distance_km: 10.1, duration_seconds: 3180 }),
  ];

  it("reconhece a melhora", () => {
    const rec = find(analyzeHistoricalComparison(runs), "10K");
    expect(rec.trend).toBe("up");
    expect(rec.improvement).toMatch(/^-/);
  });

  it("o recorde nunca é mais lento que o melhor do mês", () => {
    // A contradição que separar as duas fontes permitia.
    const rec = find(analyzeHistoricalComparison(runs), "10K");
    expect(rec.personalBest!.seconds).toBeLessThanOrEqual(rec.thisMonth!.seconds);
    expect(rec.personalBest!.seconds).toBeLessThanOrEqual(rec.lastMonth!.seconds);
  });
});

describe("degradação", () => {
  it("sem esforços, ainda mostra o que dá para mostrar", () => {
    const recs = analyzeHistoricalComparison([
      run({ id: "a", date: "2026-05-01", distance_km: 10.2, duration_seconds: 3300 }),
    ]);
    expect(find(recs, "10K").personalBest).toBeDefined();
  });

  it("sem corridas, devolve lista vazia em vez de quatro nulos", () => {
    expect(analyzeHistoricalComparison([])).toEqual([]);
  });

  it("empate fica com a marca mais antiga", () => {
    const recs = analyzeHistoricalComparison([
      run({ id: "novo",  date: "2026-06-01", distance_km: 10.1, duration_seconds: 3300 }),
      run({ id: "velho", date: "2026-03-01", distance_km: 10.1, duration_seconds: 3300 }),
    ]);
    expect(find(recs, "10K").personalBest!.date).toBe("2026-03-01");
  });
});
