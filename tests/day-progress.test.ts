/**
 * O dia do plano depois que o dia aconteceu.
 *
 * A regra que não é óbvia — e que é a razão desta função existir — está no
 * tempo: um dia sem registro que ainda não terminou é **previsto**, não
 * **perdido**. Dizer "sem registro" no sábado de manhã é acusar alguém de
 * faltar a um treino que ainda vai acontecer.
 */
import { describe, expect, it } from "vitest";
import { dayProgress } from "@/lib/day-progress";
import type { WeeklyPlanDay } from "@/types";

const TODAY = "2026-09-24";

const day = (over: Partial<WeeklyPlanDay> = {}): WeeklyPlanDay => ({
  day: "Thu", dayPt: "Quinta", type: "easy", sport: "corrida",
  label: "Rodagem leve", description: "", distance_km: 6, ...over,
} as WeeklyPlanDay);

const run = (date: string, km = 6) => ({ id: "r1", date, distance_km: km, duration_seconds: 2100 });
const lifting = (date: string) => ({ id: "a1", date, sport_type: "WeightTraining", duration_seconds: 3000 });

const at = (date: string, over: Partial<Parameters<typeof dayProgress>[0]> = {}) =>
  dayProgress({ day: day(), date, today: TODAY, runs: [], activities: [], ...over });

describe("o que aconteceu no dia", () => {
  it("o treino de amanhã é previsto, não perdido", () => {
    const p = at("2026-09-26");
    expect(p.state).toBe("planned");
    expect(p.label).toBeNull();
  });

  it("hoje sem registro ainda é previsto — o dia não acabou", () => {
    const p = at(TODAY);
    expect(p.state).toBe("planned");
  });

  it("ontem sem registro é sem registro", () => {
    const p = at("2026-09-23");
    expect(p.state).toBe("missed");
    expect(p.label).toBe("Sem registro");
  });

  it("a corrida registrada fecha o dia", () => {
    const p = at("2026-09-23", { runs: [run("2026-09-23")] });
    expect(p.state).toBe("done");
    expect(p.label).toBe("Registrado");
    expect(p.done).toBe(1);
  });

  it("duas sessões e uma feita: diz quantas faltam", () => {
    const p = dayProgress({
      day: day({ strength: { exercises: [{}, {}], estimatedMinutes: 45 } } as Partial<WeeklyPlanDay>),
      date: "2026-09-23", today: TODAY,
      runs: [run("2026-09-23")], activities: [],
    });
    expect(p.state).toBe("partial");
    expect(p.label).toBe("1 de 2 registradas");
  });

  it("a musculação sozinha também fecha o dia dela", () => {
    const p = dayProgress({
      day: day({ type: "strength", sport: "musculacao", label: "Musculação", distance_km: undefined,
        strength: { exercises: [{}], estimatedMinutes: 50 } } as Partial<WeeklyPlanDay>),
      date: "2026-09-22", today: TODAY,
      runs: [], activities: [lifting("2026-09-22")],
    });
    expect(p.state).toBe("done");
  });

  it("descanso sem nada é descanso, e cala", () => {
    const p = dayProgress({
      day: day({ type: "rest", sport: undefined, label: "Descanso", distance_km: undefined } as Partial<WeeklyPlanDay>),
      date: "2026-09-22", today: TODAY, runs: [], activities: [],
    });
    expect(p.state).toBe("rest");
    expect(p.label).toBeNull();
  });

  it("um treino num dia de descanso é registrado como extra", () => {
    const p = dayProgress({
      day: day({ type: "rest", sport: undefined, label: "Descanso", distance_km: undefined } as Partial<WeeklyPlanDay>),
      date: "2026-09-22", today: TODAY, runs: [run("2026-09-22", 5)], activities: [],
    });
    expect(p.state).toBe("extra");
    expect(p.label).toBe("1 atividade registrada");
    expect(p.extras).toBe(1);
  });

  it("o que sobra do plano conta como extra sem descaracterizar o feito", () => {
    // Correu a rodagem prevista e ainda pedalou: uma sessão fechada, um extra.
    const p = dayProgress({
      day: day(), date: "2026-09-23", today: TODAY,
      runs: [run("2026-09-23")],
      activities: [{ id: "a2", date: "2026-09-23", sport_type: "Ride", duration_seconds: 1800 }],
    });
    expect(p.state).toBe("done");
    expect(p.extras).toBe(1);
  });

  it("adaptado é característica, não estado", () => {
    const p = dayProgress({
      day: day({ adaptation: { when: "before", original: day() } } as Partial<WeeklyPlanDay>),
      date: "2026-09-26", today: TODAY, runs: [], activities: [],
    });
    expect(p.adapted).toBe(true);
    expect(p.state).toBe("planned");
  });
});
