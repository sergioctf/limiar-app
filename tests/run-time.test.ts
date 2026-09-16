import { describe, it, expect } from "vitest";
import {
  movingSeconds, elapsedSeconds, pausedSeconds, hasMeaningfulPause,
  movingPaceSecPerKm, totalMovingSeconds, totalElapsedSeconds, looksLikeForgottenWatch,
} from "@/lib/run-time";
import { computeSplits } from "@/lib/run-streams";
import type { StravaStreams } from "@/lib/strava";

/**
 * The app was measuring execution on the wall clock while measuring intensity
 * on moving time — inside the same row. A real run from 18/08/2026 recorded
 * 6.0 km with duration 7:02/km and avg_pace 5:23/km, disagreeing with itself by
 * 1:39/km. Across 400 of Sérgio's runs, 74% carried more than 5 s of stopped
 * time, averaging just over 7 minutes.
 *
 * These tests pin which clock answers which question.
 */

describe("qual relógio responde o quê", () => {
  const run = { duration_seconds: 2532, moving_time_seconds: 1938, elapsed_time_seconds: 2532 };

  it("movimento é o que o atleta correu", () => {
    expect(movingSeconds(run)).toBe(1938);
  });

  it("total é quanto tempo ele ficou fora", () => {
    expect(elapsedSeconds(run)).toBe(2532);
  });

  it("a diferença é o tempo parado", () => {
    expect(pausedSeconds(run)).toBe(594);
  });

  it("nunca devolve pausa negativa", () => {
    // Fontes manuais às vezes gravam movimento > total; isso é ruído, não -3s.
    expect(pausedSeconds({ duration_seconds: 100, moving_time_seconds: 120, elapsed_time_seconds: 100 })).toBe(0);
  });
});

describe("quando não dá para distinguir", () => {
  it("cai no comportamento antigo em vez de inventar", () => {
    // Entrada manual, Health, planilha: só existe uma duração.
    const manual = { duration_seconds: 1800 };
    expect(movingSeconds(manual)).toBe(1800);
    expect(elapsedSeconds(manual)).toBe(1800);
    expect(pausedSeconds(manual)).toBe(0);
    expect(hasMeaningfulPause(manual)).toBe(false);
  });

  it("ignora zero e null como se não existissem", () => {
    const r = { duration_seconds: 1800, moving_time_seconds: 0, elapsed_time_seconds: null };
    expect(movingSeconds(r)).toBe(1800);
    expect(elapsedSeconds(r)).toBe(1800);
  });
});

describe("o que vale mostrar", () => {
  it("30 s é o piso — abaixo disso é deriva de GPS parado", () => {
    expect(hasMeaningfulPause({ duration_seconds: 1000, moving_time_seconds: 990, elapsed_time_seconds: 1000 })).toBe(false);
    expect(hasMeaningfulPause({ duration_seconds: 1000, moving_time_seconds: 970, elapsed_time_seconds: 1000 })).toBe(true);
  });

  it("reconhece o relógio esquecido ligado", () => {
    // Linha real: 0,24 km, 102 s de movimento, 4107 s de total — o app exibia
    // isso como uma corrida a 285:13/km.
    expect(looksLikeForgottenWatch({ duration_seconds: 4107, moving_time_seconds: 102, elapsed_time_seconds: 4107 })).toBe(true);
  });

  it("não confunde um longão com semáforos com relógio esquecido", () => {
    expect(looksLikeForgottenWatch({ duration_seconds: 4200, moving_time_seconds: 3600, elapsed_time_seconds: 4200 })).toBe(false);
  });
});

describe("pace", () => {
  it("prefere o average_speed do Strava, que já é por movimento", () => {
    const r = { duration_seconds: 2532, moving_time_seconds: 1938, distance_km: 6.0, avg_pace_seconds_per_km: 323 };
    expect(movingPaceSecPerKm(r)).toBe(323);
  });

  it("na falta dele, divide pelo movimento — nunca pelo total", () => {
    const r = { duration_seconds: 2532, moving_time_seconds: 1938, distance_km: 6.0, avg_pace_seconds_per_km: null };
    expect(movingPaceSecPerKm(r)).toBe(323);   // 1938/6 = 323 → 5:23/km
    expect(movingPaceSecPerKm(r)).not.toBe(422); // 2532/6 = 422 → 7:02/km
  });
});

describe("somas", () => {
  const semana = [
    { duration_seconds: 2532, moving_time_seconds: 1938, elapsed_time_seconds: 2532 },
    { duration_seconds: 1800, moving_time_seconds: 1750, elapsed_time_seconds: 1800 },
    { duration_seconds: 900 },
  ];
  it("separa as duas contas", () => {
    expect(totalMovingSeconds(semana)).toBe(1938 + 1750 + 900);
    expect(totalElapsedSeconds(semana)).toBe(2532 + 1800 + 900);
  });
});

// ─── Splits ─────────────────────────────────────────────────────────────────

/**
 * Um quilômetro a 5:00 (300 s), com uma parada opcional no meio.
 * O stream `time` conta desde a largada, então a pausa aparece como um salto
 * entre amostras consecutivas — que é exatamente o que enganava o cálculo.
 */
function kmStream(pausaSeg: number, metrosNaPausa = 0): StravaStreams {
  const time: number[] = [], distance: number[] = [], moving: boolean[] = [];
  let t = 0, extra = 0;
  for (let i = 0; i <= 300; i++) {
    const d = i * (1000 / 300) + extra;
    if (i === 150 && pausaSeg > 0) {
      // O relógio de parede salta E a posição pode mudar: quem pausa no sinal
      // e volta a andar alguns metros à frente deixa exatamente esta assinatura.
      t += pausaSeg;
      extra += metrosNaPausa;
      time.push(t); distance.push(d + metrosNaPausa); moving.push(false);
      continue;
    }
    time.push(t); distance.push(d); moving.push(true);
    t += 1;
  }
  return { time, distance, moving };
}

describe("splits por quilômetro", () => {
  it("um km sem pausa continua 5:00", () => {
    const [sp] = computeSplits(kmStream(0));
    expect(sp.paceSecPerKm).toBeGreaterThanOrEqual(298);
    expect(sp.paceSecPerKm).toBeLessThanOrEqual(302);
    expect(sp.pausedSec).toBe(0);
  });

  it("90 s de semáforo não transformam 5:00 em 6:30", () => {
    // Este é o caso do Sérgio: parar no sinal e o app acusar treino fora do plano.
    const [sp] = computeSplits(kmStream(90));
    expect(sp.paceSecPerKm).toBeLessThanOrEqual(302);
    expect(sp.pausedSec).toBeGreaterThanOrEqual(85);
  });

  it("guarda o tempo total também, sem escondê-lo", () => {
    const [sp] = computeSplits(kmStream(90));
    expect(sp.elapsedSec).toBeGreaterThan(sp.durationSec);
    expect(sp.elapsedSec - sp.durationSec).toBe(sp.pausedSec);
  });

  it("metros ganhos durante a pausa não são de graça", () => {
    /*
     * A regressão que quase foi para produção. Filtrar só o relógio e deixar a
     * distância correr fazia o km ganhar metros a custo zero de tempo — nos
     * dados reais do Sérgio, 526 m numa pausa de 571 s, que viraram "1 km em
     * 2:58". O km precisa continuar valendo 5:00.
     */
    const [sp] = computeSplits(kmStream(90, 200));
    expect(sp.paceSecPerKm).toBeGreaterThanOrEqual(295);
    expect(sp.paceSecPerKm).toBeLessThanOrEqual(305);
  });

  it("stream antigo sem `moving` volta ao comportamento anterior", () => {
    // Nada regride para atividades já em cache.
    const s = kmStream(90);
    delete s.moving;
    const [sp] = computeSplits(s);
    expect(sp.durationSec).toBe(sp.elapsedSec);
    expect(sp.pausedSec).toBe(0);
  });
});
