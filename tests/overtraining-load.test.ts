/**
 * O alerta de sobrecarga precisa enxergar a academia.
 *
 * Saúde e a recuperação do dia já somam musculação, pedal e natação na carga
 * (`activityTSS`, desde 16/09). O alerta de sobrecarga não somava — então o
 * mesmo app mostrava dois TSB diferentes para o mesmo dia, e o aviso que
 * existe justamente para quem está fazendo demais era cego para metade do que
 * essa pessoa faz.
 */
import { describe, expect, it } from "vitest";
import { detectOvertraining } from "@/lib/overtraining";
import type { Run } from "@/types";

/**
 * Data local, nunca UTC: `toISOString()` às 21h no Brasil já devolve amanhã, e
 * o motor conta os dias pelo calendário do atleta.
 */
const iso = (d: Date) =>
  [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");

/** Corridas de 8 km, três vezes por semana, nos últimos `weeks` — seg, qua, sáb. */
function runs(weeks: number, until = new Date()): Run[] {
  const out: Run[] = [];
  for (let w = 0; w < weeks; w++) {
    for (const back of [0, 2, 5]) {
      const d = new Date(until);
      d.setDate(d.getDate() - (w * 7 + back));
      out.push({
        date: iso(d),
        distance_km: 8, duration_seconds: 2880, avg_hr: 150,
      } as Run);
    }
  }
  return out;
}

/** Musculação de uma hora, três vezes por semana, nas últimas `weeks`. */
function gym(weeks: number, until = new Date()) {
  const out: Array<{ date: string; sport_type: string; duration_seconds: number; avg_hr: number | null }> = [];
  for (let w = 0; w < weeks; w++) {
    for (const back of [1, 3, 6]) {
      const d = new Date(until);
      d.setDate(d.getDate() - (w * 7 + back));
      out.push({ date: iso(d), sport_type: "WeightTraining", duration_seconds: 3600, avg_hr: null });
    }
  }
  return out;
}

describe("a carga do alerta conta todos os esportes", () => {
  const soCorrida = detectOvertraining(runs(12), 165, 300, []);

  it("quem começou a puxar ferro agora aparece mais carregado", () => {
    // Academia só nas duas últimas semanas: a fadiga (ATL, 7 dias) sobe rápido,
    // o condicionamento (CTL, 42 dias) ainda não acompanhou.
    const comeceiAgora = detectOvertraining(runs(12), 165, 300, [], gym(2));

    expect(comeceiAgora.tsb).toBeLessThan(soCorrida.tsb);
    expect(comeceiAgora.acwr).toBeGreaterThan(soCorrida.acwr);
  });

  it("mas academia de sempre é condicionamento, não fadiga", () => {
    /*
     * Este era o teste que eu esperava ver falhar do outro jeito, e o motor
     * estava certo: doze semanas da mesma carga extra sobem CTL e ATL juntos,
     * e no equilíbrio o TSB não piora. Sobrecarga é mudança, não volume — é
     * exatamente o que CTL/ATL existem para separar.
     */
    const sempreFiz = detectOvertraining(runs(12), 165, 300, [], gym(12));

    expect(sempreFiz.acwr).toBeGreaterThan(0);
    expect(sempreFiz.acwr).toBeLessThan(1.3);
    expect(sempreFiz.level).toBe("ok");
  });

  it("sem atividades informadas, nada muda para quem só corre", () => {
    const listaVazia = detectOvertraining(runs(12), 165, 300, [], []);
    expect(listaVazia.tsb).toBe(soCorrida.tsb);
  });
});

describe("dias sem descanso contam qualquer treino", () => {
  it("correr em um dia e puxar ferro no outro não é descansar", () => {
    const hoje = new Date();
    const dias = (n: number) => {
      const d = new Date(hoje);
      d.setDate(d.getDate() - n);
      return iso(d);
    };

    // 12 dias seguidos treinando: corrida nos pares, academia nos ímpares.
    const alternado = [] as Run[];
    const academia = [] as Array<{ date: string; sport_type: string; duration_seconds: number; avg_hr: number | null }>;
    for (let i = 0; i < 12; i++) {
      if (i % 2 === 0) alternado.push({ date: dias(i), distance_km: 8, duration_seconds: 2880, avg_hr: 150 } as Run);
      else academia.push({ date: dias(i), sport_type: "WeightTraining", duration_seconds: 3600, avg_hr: null });
    }
    // Histórico anterior, para o detector ter o que medir.
    const comHistorico = [...alternado, ...runs(10, new Date(hoje.getTime() - 13 * 86_400_000))];

    const assessment = detectOvertraining(comHistorico, 165, 300, [], academia);
    const streak = assessment.signals.find(s => s.id === "streak");

    expect(streak).toBeDefined();
    expect(streak!.detail).toContain("12 dias");
  });
});
