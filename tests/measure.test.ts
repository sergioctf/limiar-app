import { describe, expect, it } from "vitest";
import {
  minutesForDistance, paceMidSeconds, sessionAsStructure, sessionTarget, stepMinutes, withDurations,
} from "@/lib/measure";
import type { WeeklyPlanDay } from "@/types";

const dia = (over: Partial<WeeklyPlanDay> = {}): WeeklyPlanDay => ({
  day: "Mon", dayPt: "Segunda", type: "easy", sport: "corrida",
  label: "Rodagem", description: "", ...over,
} as WeeklyPlanDay);

describe("o ritmo vira número", () => {
  it("usa o meio da faixa, não a ponta rápida", () => {
    // 6:12 = 372 s, 5:48 = 348 s → meio 360.
    expect(paceMidSeconds("6:12–5:48/km")).toBe(360);
  });

  it("aceita travessão, hífen e espaços", () => {
    expect(paceMidSeconds("6:12 – 5:48/km")).toBe(360);
    expect(paceMidSeconds("6:12-5:48/km")).toBe(360);
  });

  it("aceita ritmo único", () => {
    expect(paceMidSeconds("5:00/km")).toBe(300);
  });

  it("devolve nulo para o que não é ritmo", () => {
    expect(paceMidSeconds(undefined)).toBeNull();
    expect(paceMidSeconds("confortável")).toBeNull();
    // 0:30/km não é ritmo de ninguém; 40:00/km também não.
    expect(paceMidSeconds("0:30/km")).toBeNull();
    expect(paceMidSeconds("40:00/km")).toBeNull();
  });
});

describe("distância vira minutos", () => {
  it("converte pelo ritmo prescrito, arredondando a cinco", () => {
    // 8 km a 6:00/km = 48 min → 50.
    expect(minutesForDistance(8, "6:12–5:48/km")).toBe(50);
    // 10 km a 6:00/km = 60 min.
    expect(minutesForDistance(10, "6:12–5:48/km")).toBe(60);
  });

  it("nunca prescreve menos de 10 minutos", () => {
    expect(minutesForDistance(0.5, "6:00/km")).toBe(10);
  });

  it("sem ritmo, não inventa — quem não fez o teste não tem ritmo", () => {
    expect(minutesForDistance(8, undefined)).toBeNull();
    expect(minutesForDistance(8, "leve")).toBeNull();
  });

  it("sem distância, não há o que converter", () => {
    expect(minutesForDistance(undefined, "6:00/km")).toBeNull();
    expect(minutesForDistance(0, "6:00/km")).toBeNull();
  });
});

describe("o tamanho da sessão na tela", () => {
  it("por padrão, quilômetros", () => {
    expect(sessionTarget(dia({ distance_km: 8, pace: "6:12–5:48/km" }))).toBe("8 km");
  });

  it("escolhendo tempo, minutos", () => {
    expect(sessionTarget(dia({ distance_km: 8, pace: "6:12–5:48/km" }), "time")).toBe("50 min");
  });

  it("prefere a duração já gravada a recalcular", () => {
    expect(sessionTarget(dia({ distance_km: 8, duration_min: 45, pace: "6:12–5:48/km" }), "time")).toBe("45 min");
  });

  it("cai para km quando o tempo não dá para calcular — melhor que inventar", () => {
    expect(sessionTarget(dia({ distance_km: 8 }), "time")).toBe("8 km");
  });

  it("escreve a distância com vírgula, que é como se lê em português", () => {
    expect(sessionTarget(dia({ distance_km: 7.5 }))).toBe("7,5 km");
  });

  it("sessão sem alvo nenhum não ganha rótulo", () => {
    expect(sessionTarget(dia())).toBeNull();
  });
});

describe("a sessão como estrutura para o relógio", () => {
  it("usa a estrutura do motor quando ela existe", () => {
    const estrutura = { blocks: [{ kind: "run" as const, distance_km: 1 }] };
    expect(sessionAsStructure(dia({ structure: estrutura, distance_km: 10 }))).toBe(estrutura);
  });

  it("inventa um passo só para a rodagem simples — é a maioria da semana", () => {
    const s = sessionAsStructure(dia({ distance_km: 8, pace: "6:12–5:48/km" }));
    expect(s).toEqual({ blocks: [{ kind: "run", distance_km: 8, pace: "6:12–5:48/km" }] });
  });

  it("com a preferência em tempo, o passo único é de duração", () => {
    const s = sessionAsStructure(dia({ distance_km: 8, pace: "6:12–5:48/km" }), "time");
    expect(s).toEqual({ blocks: [{ kind: "run", duration_min: 50, pace: "6:12–5:48/km" }] });
  });

  it("dia de descanso não vira treino", () => {
    expect(sessionAsStructure(dia({ type: "rest", distance_km: 0 }))).toBeNull();
  });

  it("sessão sem distância nem duração não vira treino", () => {
    expect(sessionAsStructure(dia())).toBeNull();
  });
});

describe("o plano relido na outra unidade", () => {
  it("preenche a duração sem apagar a distância — trocar de unidade não regenera nada", () => {
    const plano = { days: [dia({ distance_km: 8, pace: "6:12–5:48/km" })] };
    const out = withDurations(plano);
    expect(out.days[0].duration_min).toBe(50);
    expect(out.days[0].distance_km).toBe(8);
  });

  it("não mexe no que já tinha duração", () => {
    const plano = { days: [dia({ distance_km: 8, duration_min: 42, pace: "6:12–5:48/km" })] };
    expect(withDurations(plano).days[0].duration_min).toBe(42);
  });

  it("não dá duração a dia de descanso", () => {
    const plano = { days: [dia({ type: "rest" })] };
    expect(withDurations(plano).days[0].duration_min).toBeUndefined();
  });

  it("plano sem dias atravessa inteiro", () => {
    expect(withDurations({})).toEqual({});
  });
});

describe("minutos de um passo", () => {
  it("respeita a duração quando o passo já é por tempo", () => {
    expect(stepMinutes({ duration_min: 2 })).toBe(2);
  });

  it("converte a distância pelo ritmo do passo, sem arredondar a cinco", () => {
    // 800 m a 4:05/km ≈ 3,3 min — um tiro não vira "5 min".
    expect(stepMinutes({ distance_km: 0.8, pace: "4:10–4:00/km" })).toBe(3.3);
  });

  it("sem ritmo nem duração, não há minuto", () => {
    expect(stepMinutes({ distance_km: 0.8 })).toBeNull();
  });
});
