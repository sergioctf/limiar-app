import { describe, it, expect } from "vitest";
import { buildRecords, buildCandidates, bestAt, type RunForRecords, type StoredEffort } from "@/lib/records";

/**
 * One definition of "record", shared by the dashboard, the coach card and the
 * friend profile. Before this there were three, and the same athlete had three
 * different 5 km records depending on which screen they opened.
 */

const r = (o: Partial<RunForRecords> & { id: string; date: string; distance_km: number; duration_seconds: number }): RunForRecords =>
  ({ name: "Corrida", ...o });

describe("de onde vem uma marca", () => {
  it("prefere a janela medida à atividade inteira, na mesma corrida", () => {
    // Mesmo esforço, cronometrado com precisão — deixar as duas entrar
    // duplicaria o candidato.
    const recs = buildRecords(
      [r({ id: "a", date: "2026-05-01", distance_km: 5.02, duration_seconds: 1800 })],
      [{ run_id: "a", distance_m: 5000, seconds: 1780, run_date: "2026-05-01" }],
    );
    expect(bestAt(recs, 5000)).toBe(1780);
  });

  it("usa a atividade inteira quando não há janela medida", () => {
    const recs = buildRecords(
      [r({ id: "a", date: "2026-05-01", distance_km: 10.1, duration_seconds: 3300 })],
      [],
    );
    expect(bestAt(recs, 10000)).toBe(3300);
  });

  it("acha a marca escondida dentro de um treino maior", () => {
    const recs = buildRecords(
      [r({ id: "longo", date: "2026-06-06", distance_km: 21.4, duration_seconds: 7071 })],
      [{ run_id: "longo", distance_m: 10000, seconds: 3236, run_date: "2026-06-06" }],
    );
    const rec = recs.find(x => x.distanceM === 10000)!;
    expect(rec.best!.seconds).toBe(3236);
    expect(rec.best!.fromInsideRun).toBe(true);
    expect(rec.best!.activityKm).toBeCloseTo(21.4, 1);
  });

  it("uma corrida curta demais nunca substitui a distância maior", () => {
    const recs = buildRecords(
      [r({ id: "a", date: "2026-05-01", distance_km: 9.2, duration_seconds: 2760 })],
      [],
    );
    expect(bestAt(recs, 10000)).toBeNull();
  });
});

describe("o histórico inteiro conta", () => {
  const runs = Array.from({ length: 40 }, (_, i) =>
    r({ id: `r${i}`, date: `2026-0${(i % 9) + 1}-0${(i % 9) + 1}`,
        distance_km: 10.2, duration_seconds: 3600 - i * 5 }));

  it("varre todas as corridas, não só as que têm janela medida", () => {
    // O defeito relatado: recordes tirados de 14 corridas de 61.
    const recs = buildRecords(runs, [
      { run_id: "r0", distance_m: 10000, seconds: 3599, run_date: "2026-01-01" },
    ]);
    // A melhor é a r39, por atividade inteira — não a única medida.
    expect(bestAt(recs, 10000)).toBe(3600 - 39 * 5);
  });

  it("conta quantas corridas contribuíram", () => {
    const recs = buildRecords(runs, []);
    expect(recs.find(x => x.distanceM === 10000)!.attempts).toBe(40);
  });
});

describe("candidatos", () => {
  it("expõe a lista crua para quem precisa filtrar por período", () => {
    const c = buildCandidates(
      [r({ id: "a", date: "2026-05-01", distance_km: 10.1, duration_seconds: 3300 })],
      [],
    );
    expect(c.some(x => x.distanceM === 10000 && x.seconds === 3300)).toBe(true);
  });

  it("não inventa candidato para distância que ninguém alcançou", () => {
    const c = buildCandidates(
      [r({ id: "a", date: "2026-05-01", distance_km: 3.0, duration_seconds: 900 })],
      [],
    );
    expect(c.some(x => x.distanceM === 42195)).toBe(false);
  });

  it("marca como 'de dentro' só quando a atividade é bem maior", () => {
    const c = buildCandidates(
      [r({ id: "a", date: "2026-05-01", distance_km: 5.02, duration_seconds: 1800 })],
      [{ run_id: "a", distance_m: 5000, seconds: 1780, run_date: "2026-05-01" }],
    );
    expect(c.find(x => x.distanceM === 5000)!.fromInsideRun).toBe(false);
  });
});

describe("comparação entre atletas", () => {
  const meus = buildRecords(
    [r({ id: "m", date: "2026-05-01", distance_km: 10.1, duration_seconds: 3300 })], []);
  const dele = buildRecords(
    [r({ id: "d", date: "2026-05-01", distance_km: 10.1, duration_seconds: 3180 })], []);

  it("dá para ler a diferença nos dois sentidos", () => {
    const meu = bestAt(meus, 10000)!, dele10 = bestAt(dele, 10000)!;
    expect(meu - dele10).toBe(120);
  });

  it("uma distância que só um dos dois tem não vira empate", () => {
    const so = buildRecords(
      [r({ id: "x", date: "2026-05-01", distance_km: 21.2, duration_seconds: 7000 })], []);
    expect(bestAt(so, 21097)).toBe(7000);
    expect(bestAt(meus, 21097)).toBeNull();
  });
});

describe("todas as telas usam este motor", () => {
  /*
   * Havia quatro definições de recorde: o dashboard, o card do treinador, o
   * perfil do amigo e — a que mais doía — o ranking de amigos, que é a
   * comparação competitiva. O 5 km do Sérgio lia 29:44 no ranking e 24:25 no
   * perfil; o da Manoela divergia em 12:41.
   *
   * Estes testes fixam o contrato que o ranking, as conquistas e os dois cards
   * consomem, para que nenhum volte a inventar o seu.
   */
  const runs = [
    r({ id: "curta", date: "2026-07-15", distance_km: 5.01, duration_seconds: 1784 }),
    r({ id: "longa", date: "2026-06-06", distance_km: 21.4, duration_seconds: 7071 }),
  ];
  const efforts: StoredEffort[] = [
    { run_id: "longa", distance_m: 5000,  seconds: 1555, run_date: "2026-06-06" },
    { run_id: "longa", distance_m: 10000, seconds: 3166, run_date: "2026-06-06" },
  ];

  it("o 5 km é o mesmo número para quem pergunta pelo ranking", () => {
    // bestAt é o que o leaderboard chama.
    expect(bestAt(buildRecords(runs, efforts), 5000)).toBe(1555);
  });

  it("e o trecho de dentro do longão ganha da corrida de 5 km", () => {
    expect(bestAt(buildRecords(runs, efforts), 5000)).toBeLessThan(1784);
  });

  it("uma conquista de tempo julga o mesmo número que o card mostra", () => {
    // "10K abaixo de 45 min" precisa ser verdade sobre o 10 km que o atleta vê.
    const dez = bestAt(buildRecords(runs, efforts), 10000)!;
    expect(dez).toBe(3166);
    expect(dez < 45 * 60).toBe(false);   // 52:46 — não desbloqueia
    expect(dez < 60 * 60).toBe(true);
  });

  it("sem esforços medidos, o ranking ainda responde algo", () => {
    // Um amigo que nunca teve o histórico varrido não pode sumir da comparação.
    expect(bestAt(buildRecords(runs, []), 5000)).toBe(1784);
  });

  it("a sentinela de corrida sem esforço não vira marca", () => {
    // O backfill grava distance_m: 0 para não reler a corrida; filtrar isso é
    // responsabilidade de quem lê, e todos os chamadores fazem.
    const comSentinela = efforts.filter(e => e.distance_m > 0);
    expect(bestAt(buildRecords(runs, comSentinela), 5000)).toBe(1555);
  });
});

describe("o relógio esquecido ligado", () => {
  /**
   * Sete das 36 corridas que o Matheus importou do Strava vinham assim: 10,01
   * km com 95 h de duração, 5,1 km com 719 h. O atleta esqueceu de encerrar a
   * atividade, e a tabela de recordes tratava esse número como o tempo dele.
   */
  const esquecida = r({
    id: "esquecida", date: "2025-07-31", distance_km: 10.01,
    duration_seconds: 345_404,          // 95 h 56 min
    moving_time_seconds: 3303,          // 55:03 — o que o Strava mostra
    elapsed_time_seconds: 345_404,
  });

  it("não entra na tabela com o tempo absurdo", () => {
    const recs = buildRecords([esquecida], []);
    expect(bestAt(recs, 10000)).toBe(3303);
  });

  it("e ainda pode ser recorde, que era o que se perdia", () => {
    // Antes, a corrida boa ficava atrás de um número de 95 horas e sumia da
    // comparação; a marca real nunca aparecia em lugar nenhum.
    const recs = buildRecords(
      [esquecida, r({ id: "outra", date: "2026-01-10", distance_km: 10.02, duration_seconds: 3400 })],
      [],
    );
    const dez = recs.find(x => x.distanceM === 10000)!;
    expect(dez.best!.runId).toBe("esquecida");
    expect(dez.second!.seconds).toBe(3400);
  });

  it("uma corrida normal continua sendo medida pelo relógio da prova", () => {
    // Parou num semáforo: o tempo parado conta, porque um recorde é um esforço
    // contínuo. Só o relógio claramente quebrado é descartado.
    const recs = buildRecords(
      [r({ id: "semaforo", date: "2026-02-02", distance_km: 10.05,
           duration_seconds: 3600, moving_time_seconds: 3400, elapsed_time_seconds: 3600 })],
      [],
    );
    expect(bestAt(recs, 10000)).toBe(3600);
  });
});
