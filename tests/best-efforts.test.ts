import { describe, it, expect } from "vitest";
import {
  fastestWindow, effortsInActivity, rankEfforts, streamMatchesActivity,
  EFFORT_DISTANCES, type EffortStreams, type RankedEffort,
} from "@/lib/best-efforts";

/**
 * The premise: your best 10 km does not have to come from an activity labelled
 * "10 km". These tests build runs whose fast stretch is deliberately buried in
 * the middle, and check the engine digs it out.
 */

/**
 * A run described as segments of [metres, seconds-per-km], sampled once a
 * second, optionally with a pause of N seconds inserted at a given metre mark.
 */
function run(
  segments: Array<[number, number]>,
  pause?: { atM: number; sec: number; movedM?: number },
): EffortStreams {
  const distance: number[] = [0], time: number[] = [0], moving: boolean[] = [true];
  let d = 0, t = 0, paused = false;
  for (const [metres, paceSec] of segments) {
    const mps = 1000 / paceSec;
    // ceil, not round: real GPS overshoots the round number slightly, and the
    // engine is deliberately strict — 4999 m is not a 5 km. Rounding down left
    // the fixture a fraction of a metre short and no window was found at all.
    const steps = Math.ceil(metres / mps);
    for (let i = 0; i < steps; i++) {
      if (pause && !paused && d >= pause.atM) {
        paused = true;
        t += pause.sec;                       // wall clock jumps
        d += pause.movedM ?? 0;               // …and so can the position
        distance.push(d); time.push(t); moving.push(false);
      }
      d += mps; t += 1;
      distance.push(d); time.push(t); moving.push(true);
    }
  }
  return { distance, time, moving };
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

describe("achar o trecho rápido escondido", () => {
  // 15 km: 2 km de aquecimento a 6:00, 10 km a 4:30, 3 km de solto a 6:00.
  const quinzeKm = run([[2000, 360], [10000, 270], [3000, 360]]);

  it("o melhor 10 km vem do miolo, não da corrida inteira", () => {
    const w = fastestWindow(quinzeKm, 10000, "10 km")!;
    expect(w).not.toBeNull();
    // 10 km a 4:30 = 2700 s. Tolerância de amostragem.
    expect(w.seconds).toBeGreaterThan(2650);
    expect(w.seconds).toBeLessThan(2760);
    expect(w.paceSecPerKm).toBeGreaterThan(265);
    expect(w.paceSecPerKm).toBeLessThan(276);
  });

  it("aponta onde no percurso o esforço aconteceu", () => {
    const w = fastestWindow(quinzeKm, 10000, "10 km")!;
    expect(w.startM).toBeGreaterThan(1500);
    expect(w.startM).toBeLessThan(2500);
    expect(w.endM - w.startM).toBeCloseTo(10000, -2);
  });

  it("é bem mais rápido do que a média da atividade diria", () => {
    // A corrida toda: 15 km em ~1h20 → ~5:18/km. O trecho é 4:30/km.
    const w = fastestWindow(quinzeKm, 10000, "10 km")!;
    expect(w.paceSecPerKm).toBeLessThan(300);
  });
});

describe("distâncias que não cabem", () => {
  const dezKm = run([[10000, 300]]);

  it("não inventa uma maratona dentro de 10 km", () => {
    expect(fastestWindow(dezKm, 42195)).toBeNull();
  });

  it("devolve só o que coube", () => {
    const efforts = effortsInActivity(dezKm);
    const dists = efforts.map(e => e.distanceM);
    expect(dists).toContain(10000);
    expect(dists).not.toContain(15000);
    expect(Math.max(...dists)).toBe(10000);
  });

  it("aceita a distância exata da atividade", () => {
    expect(fastestWindow(dezKm, 10000)).not.toBeNull();
  });

  it("não promove 4.990 m a 5 km só para dar um recorde", () => {
    // A tolerância do motor existe para ruído de ponto flutuante (meio metro),
    // não para ser generosa. Dez metros faltando são dez metros faltando.
    const quase = run([[4990, 300]]);
    expect(fastestWindow(quase, 5000)).toBeNull();
  });

  it("mas não deixa 0,0001 m de erro de float custar um recorde", () => {
    // 5000 m acumulado em floats pode fechar em 4999,9999999. Se o recorde
    // dependesse da direção do arredondamento, ele não seria um recorde.
    const exato = run([[5000, 300]]);
    expect(fastestWindow(exato, 5000)).not.toBeNull();
  });
});

describe("o relógio de um recorde é o da prova", () => {
  /*
   * Aqui a semântica é o oposto do resto do app, e de propósito.
   *
   * A primeira versão descontava as pausas, como o resto do app faz para julgar
   * execução. O resultado nos dados reais foi um "1 km em 3:57" para um atleta
   * de VDOT 39.5 — porque 87 s de semáforo tinham sido removidos de dentro do
   * quilômetro. O Strava, para a mesma corrida, diz 5:24.
   *
   * A checagem: 74 esforços comparados contra os best_efforts do próprio
   * Strava. 68 bateram ao segundo; os 6 que não bateram eram exatamente as três
   * corridas onde o filtro de pausa agia. Um recorde é contínuo — descontar o
   * descanso do meio é como se fabrica um recorde que não existiu.
   */

  it("a pausa conta contra o esforço", () => {
    const limpo  = run([[5000, 300]]);
    const parado = run([[5000, 300]], { atM: 2500, sec: 120 });
    const a = fastestWindow(limpo, 5000)!;
    const b = fastestWindow(parado, 5000)!;
    expect(b.seconds).toBeGreaterThan(a.seconds + 100);
  });

  it("mas reporta quanto foi de pausa, em vez de esconder", () => {
    const parado = fastestWindow(run([[5000, 300]], { atM: 2500, sec: 120 }), 5000)!;
    expect(parado.pausedSec).toBeGreaterThanOrEqual(115);
  });

  it("uma janela limpa não reporta pausa nenhuma", () => {
    expect(fastestWindow(run([[5000, 300]]), 5000)!.pausedSec).toBe(0);
  });

  it("metros andados durante a pausa não compram recorde", () => {
    /*
     * Relógio pausado num lugar e retomado noutro: a distância salta. Como o
     * tempo de parede cobra a pausa inteira, esses metros vêm caros, não de
     * graça — que era o furo da versão anterior.
     */
    const honesto  = run([[5000, 300]]);
    const comSalto = run([[5000, 300]], { atM: 2500, sec: 570, movedM: 526 });
    const a = fastestWindow(honesto, 5000)!;
    const b = fastestWindow(comSalto, 5000)!;
    expect(b.seconds).toBeGreaterThan(a.seconds);
    expect(b.paceSecPerKm).toBeGreaterThan(300);
  });

  it("sem o stream `moving`, o tempo é o mesmo — só não sabemos da pausa", () => {
    const parado = run([[5000, 300]], { atM: 2500, sec: 120 });
    const semFlag = run([[5000, 300]], { atM: 2500, sec: 120 });
    delete semFlag.moving;
    expect(fastestWindow(semFlag, 5000)!.seconds).toBe(fastestWindow(parado, 5000)!.seconds);
    expect(fastestWindow(semFlag, 5000)!.pausedSec).toBe(0);
  });
});

describe("teleporte de GPS não vira recorde", () => {
  /*
   * Dado real de 04/04/2026: quatro amostras consecutivas avançando 106 m cada
   * em um segundo — 383 km/h — porque o relógio perdeu sinal e recuperou de uma
   * vez. O Strava marcou todas como `moving: true`, então filtrar por movimento
   * não protegia. O resultado na tabela era "400 m em 0:02" e "1 km em 0:32".
   */
  function comTeleporte(): EffortStreams {
    const distance: number[] = [0], time: number[] = [0];
    let d = 0, t = 0;
    const mps = 1000 / 300;                    // 5:00/km
    for (let i = 0; i < 1500; i++) {
      if (i === 700) { d += 424; }             // o salto: 424 m num segundo
      else d += mps;
      t += 1;
      distance.push(d); time.push(t);
    }
    return { distance, time };
  }

  it("não credita 400 m em dois segundos", () => {
    const w = fastestWindow(comTeleporte(), 400)!;
    expect(w).not.toBeNull();
    // 400 m a 5:00/km leva 120 s. Aceita folga, mas nada perto de 2 s.
    expect(w.seconds).toBeGreaterThan(60);
  });

  it("o quilômetro continua plausível", () => {
    const w = fastestWindow(comTeleporte(), 1000)!;
    expect(w.paceSecPerKm).toBeGreaterThan(150);   // > 2:30/km
  });

  it("uma corrida limpa não é afetada pelo limite", () => {
    // O teto é 12,5 m/s = 45 km/h; correr de verdade nunca encosta nele.
    const limpo = run([[5000, 300]]);
    const w = fastestWindow(limpo, 5000)!;
    expect(w.paceSecPerKm).toBeGreaterThanOrEqual(298);
    expect(w.paceSecPerKm).toBeLessThanOrEqual(302);
  });

  it("nem um tiro rápido de verdade", () => {
    // 400 m a 3:00/km = 5,6 m/s, bem abaixo do teto.
    const tiro = run([[400, 180]]);
    const w = fastestWindow(tiro, 400)!;
    expect(w.seconds).toBeLessThan(80);
  });
});

describe("o ranking", () => {
  const base = { distanceM: 10000, label: "10 km", paceSecPerKm: 270, startM: 0, endM: 10000, pausedSec: 0 };
  const e = (runId: string, date: string, seconds: number): RankedEffort =>
    ({ ...base, runId, runName: `Corrida ${runId}`, date, seconds, rank: 0 });

  it("guarda o melhor e o segundo melhor", () => {
    const [rec] = rankEfforts([e("a", "2026-03-01", 2800), e("b", "2026-05-01", 2700), e("c", "2026-06-01", 2900)]);
    expect(rec.best!.runId).toBe("b");
    expect(rec.best!.rank).toBe(1);
    expect(rec.second!.runId).toBe("a");
    expect(rec.second!.rank).toBe(2);
  });

  it("empate fica com o mais antigo — igualar não é superar", () => {
    const [rec] = rankEfforts([e("novo", "2026-06-01", 2700), e("velho", "2026-03-01", 2700)]);
    expect(rec.best!.runId).toBe("velho");
    expect(rec.second!.runId).toBe("novo");
  });

  it("conta quantas atividades tinham a distância", () => {
    const [rec] = rankEfforts([e("a", "2026-03-01", 2800), e("b", "2026-05-01", 2700)]);
    expect(rec.attempts).toBe(2);
  });

  it("com um esforço só, não inventa um segundo lugar", () => {
    const [rec] = rankEfforts([e("a", "2026-03-01", 2800)]);
    expect(rec.best).not.toBeNull();
    expect(rec.second).toBeNull();
  });

  it("omite distâncias que ninguém nunca correu", () => {
    const recs = rankEfforts([e("a", "2026-03-01", 2800)]);
    expect(recs).toHaveLength(1);
    expect(recs[0].distanceM).toBe(10000);
  });

  it("mantém a ordem das distâncias, da mais curta para a mais longa", () => {
    const cinco = { ...base, distanceM: 5000, label: "5 km" };
    const recs = rankEfforts([
      e("a", "2026-03-01", 2800),
      { ...cinco, runId: "b", runName: "b", date: "2026-03-01", seconds: 1300, rank: 0 },
    ]);
    expect(recs.map(r => r.distanceM)).toEqual([5000, 10000]);
  });
});

describe("sanidade do motor", () => {
  it("o esforço mais curto nunca é mais lento que o mais longo, na mesma corrida", () => {
    // Se o 5 km sai mais lento que o 10 km, a janela está errada.
    const r = run([[3000, 330], [7000, 280], [5000, 350]]);
    const efforts = effortsInActivity(r);
    const cinco = efforts.find(e => e.distanceM === 5000)!;
    const dez   = efforts.find(e => e.distanceM === 10000)!;
    expect(cinco.paceSecPerKm).toBeLessThanOrEqual(dez.paceSecPerKm);
  });

  it("as distâncias estão em ordem crescente na tabela", () => {
    const ms = EFFORT_DISTANCES.map(d => d.m);
    expect([...ms].sort((a, b) => a - b)).toEqual(ms);
  });

  it("não trava numa corrida longa", () => {
    const t0 = Date.now();
    effortsInActivity(run([[42195, 300]]));
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});


describe("um stream que não descreve a corrida não vale recorde", () => {
  /*
   * Caso real: uma atividade gravada como 5,0 km cujo stream ia a 8756 m, com
   * apenas 11 s de pausa. O motor achou "1 km em 2:52" e um "5 km em 16:42"
   * para uma atleta que faz 10 km em 55:08 — e nada checava o stream contra a
   * distância que a própria atividade declara.
   *
   * A tolerância veio de 27 atividades reais: com o flag `moving`, a distância
   * em movimento fica a 1,8% da gravada; sem ele, o total cru chega a 13,3%
   * acima em corridas muito paradas, e não há como corrigir.
   */
  const cincoKm = () => run([[5000, 300]]);

  it("aceita quando stream e atividade concordam", () => {
    expect(streamMatchesActivity(cincoKm(), 5.0)).toBe(true);
  });

  it("aceita a folga normal de GPS", () => {
    expect(streamMatchesActivity(cincoKm(), 5.05)).toBe(true);
    expect(streamMatchesActivity(cincoKm(), 4.95)).toBe(true);
  });

  it("recusa o stream de 8756 m numa corrida de 5 km", () => {
    const inflado = run([[8756, 269]]);
    expect(streamMatchesActivity(inflado, 5.0)).toBe(false);
  });

  it("e então nenhum esforço sai dele", () => {
    const inflado = run([[8756, 269]]);
    expect(effortsInActivity(inflado, 5.0)).toEqual([]);
  });

  it("sem a distância gravada, não recusa nada", () => {
    // Um stream não verificável é o status quo; recusar todos esvaziaria a
    // tabela de recordes.
    expect(effortsInActivity(cincoKm()).length).toBeGreaterThan(0);
    expect(streamMatchesActivity(cincoKm(), null)).toBe(true);
  });

  it("é mais tolerante quando não dá para reconciliar pela pausa", () => {
    // Sem `moving`, o total cru inclui os metros ganhos parado — até 13,3% nos
    // dados reais. 20% ainda passa; 75% não.
    const semFlag = run([[5000, 300]]);
    delete semFlag.moving;
    expect(streamMatchesActivity(semFlag, 4.2)).toBe(true);   // stream 19% acima
    expect(streamMatchesActivity(semFlag, 2.9)).toBe(false);  // stream 72% acima
  });

  it("com o flag, é estrito — a distância em movimento tem que bater", () => {
    const comPausa = run([[5000, 300]], { atM: 2500, sec: 570, movedM: 526 });
    // A atividade gravaria ~5,0 km (o Strava não conta os metros parados).
    expect(streamMatchesActivity(comPausa, 5.0)).toBe(true);
  });
});
