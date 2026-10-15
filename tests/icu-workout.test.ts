import { describe, expect, it } from "vitest";
import {
  alvoDeRitmo, icuEventPayload, icuSportType, icuWorkoutText, linhaDoPasso, tempoOuDistancia,
} from "@/lib/icu-workout";
import type { StructuredWorkout, WorkoutStep } from "@/types";

const passo = (over: Partial<WorkoutStep> = {}): WorkoutStep =>
  ({ kind: "run", ...over } as WorkoutStep);

describe("minuto não é metro", () => {
  /*
    A regra que justifica este arquivo existir: no intervals.icu `m` é MINUTO.
    Um tiro de 800 metros escrito "800m" vira 800 minutos — treze horas de
    corrida no relógio do atleta.
  */
  it("escreve metros como mtr, nunca como m", () => {
    expect(tempoOuDistancia({ distance_km: 0.8 })).toBe("800mtr");
    expect(tempoOuDistancia({ distance_km: 0.4 })).toBe("400mtr");
    expect(tempoOuDistancia({ distance_km: 0.2 })).toBe("200mtr");
  });

  it("usa m só para minutos", () => {
    expect(tempoOuDistancia({ duration_min: 10 })).toBe("10m");
    expect(tempoOuDistancia({ duration_min: 2 })).toBe("2m");
  });

  it("de 1 km para cima, usa km", () => {
    expect(tempoOuDistancia({ distance_km: 1 })).toBe("1km");
    expect(tempoOuDistancia({ distance_km: 12 })).toBe("12km");
    expect(tempoOuDistancia({ distance_km: 2.5 })).toBe("2.5km");
  });

  it("quebra minuto fracionado em minutos e segundos", () => {
    expect(tempoOuDistancia({ duration_min: 1.5 })).toBe("1m30s");
    expect(tempoOuDistancia({ duration_min: 0.5 })).toBe("30s");
  });

  it("distância ganha da duração quando o passo tem as duas", () => {
    expect(tempoOuDistancia({ distance_km: 1, duration_min: 5 })).toBe("1km");
  });

  it("passo sem medida nenhuma não vira linha", () => {
    expect(tempoOuDistancia({})).toBeNull();
    expect(tempoOuDistancia({ distance_km: 0, duration_min: 0 })).toBeNull();
    expect(linhaDoPasso(passo())).toBeNull();
  });
});

describe("o alvo de ritmo", () => {
  it("troca o travessão do motor pelo hífen que o intervals.icu entende", () => {
    // O motor escreve com travessão (–), não com hífen.
    expect(alvoDeRitmo("6:12–5:48/km")).toBe("6:12/km-5:48/km Pace");
  });

  it("repete a unidade dos dois lados da faixa", () => {
    expect(alvoDeRitmo("4:10–4:00/km")).toContain("4:10/km-4:00/km");
  });

  it("aceita hífen comum e travessão longo", () => {
    expect(alvoDeRitmo("6:12-5:48/km")).toBe("6:12/km-5:48/km Pace");
    expect(alvoDeRitmo("6:12—5:48/km")).toBe("6:12/km-5:48/km Pace");
  });

  it("aceita ritmo único", () => {
    expect(alvoDeRitmo("5:00/km")).toBe("5:00/km Pace");
  });

  it("aceita milhas", () => {
    expect(alvoDeRitmo("8:00–7:40/mi")).toBe("8:00/mi-7:40/mi Pace");
  });

  it("ignora o que não souber ler, em vez de inventar alvo", () => {
    expect(alvoDeRitmo(undefined)).toBeNull();
    expect(alvoDeRitmo("confortável")).toBeNull();
    expect(alvoDeRitmo("6:12")).toBeNull();
  });
});

describe("a linha do passo", () => {
  it("nomeia o passo em português, para o visor do relógio", () => {
    expect(linhaDoPasso(passo({ kind: "warmup", distance_km: 2, pace: "6:12–5:48/km" })))
      .toBe("- Aquecimento 2km 6:12/km-5:48/km Pace");
    expect(linhaDoPasso(passo({ kind: "recovery", duration_min: 2 })))
      .toBe("- Trote 2m");
    expect(linhaDoPasso(passo({ kind: "cooldown", distance_km: 1 })))
      .toBe("- Volta à calma 1km");
  });

  it("um passo sem ritmo legível continua valendo, só sem alvo", () => {
    expect(linhaDoPasso(passo({ kind: "run", distance_km: 0.8, pace: "forte" })))
      .toBe("- Forte 800mtr");
  });

  it("nunca mistura FC com ritmo — o intervals.icu recusa treino misto", () => {
    const linha = linhaDoPasso(passo({
      kind: "run", distance_km: 0.8, pace: "4:10–4:00/km",
      hr: { min: 170, max: 180, zone: "Z4", label: "Limiar" },
    }));
    expect(linha).toContain("Pace");
    expect(linha).not.toContain("HR");
    expect(linha).not.toContain("170");
  });
});

describe("o treino inteiro", () => {
  const tiros: StructuredWorkout = {
    blocks: [
      { kind: "warmup", distance_km: 2, pace: "6:12–5:48/km" },
      {
        repeat: 6,
        steps: [
          { kind: "run", distance_km: 0.8, pace: "4:10–4:00/km" },
          { kind: "recovery", duration_min: 2, pace: "7:00–6:30/km" },
        ],
      },
      { kind: "cooldown", distance_km: 1, pace: "6:12–5:48/km" },
    ],
  };

  it("escreve a repetição como linha própria, cercada de linhas em branco", () => {
    expect(icuWorkoutText(tiros)).toBe(
      [
        "- Aquecimento 2km 6:12/km-5:48/km Pace",
        "",
        "6x",
        "- Forte 800mtr 4:10/km-4:00/km Pace",
        "- Trote 2m 7:00/km-6:30/km Pace",
        "",
        "- Volta à calma 1km 6:12/km-5:48/km Pace",
      ].join("\n"),
    );
  });

  it("não deixa linha em branco sobrando no fim", () => {
    const soRepeticao: StructuredWorkout = { blocks: [{ repeat: 4, steps: [{ kind: "run", distance_km: 1 }] }] };
    expect(icuWorkoutText(soRepeticao)).toBe("4x\n- Forte 1km");
  });

  it("uma rodagem simples é uma linha só", () => {
    expect(icuWorkoutText({ blocks: [{ kind: "run", distance_km: 8, pace: "6:12–5:48/km" }] }))
      .toBe("- Forte 8km 6:12/km-5:48/km Pace");
  });

  it("pula repetição que ficou sem passo utilizável", () => {
    const vazia: StructuredWorkout = {
      blocks: [{ kind: "warmup", distance_km: 2 }, { repeat: 3, steps: [{ kind: "run" }] }],
    };
    expect(icuWorkoutText(vazia)).toBe("- Aquecimento 2km");
  });

  it("estrutura sem nada aproveitável devolve texto vazio", () => {
    expect(icuWorkoutText({ blocks: [] })).toBe("");
    expect(icuWorkoutText({ blocks: [{ kind: "run" }] })).toBe("");
  });

  it("um treino de 6×800 m jamais vira 800 minutos", () => {
    const texto = icuWorkoutText(tiros);
    expect(texto).toContain("800mtr");
    expect(texto).not.toMatch(/\b800m\b/);
  });
});

describe("o evento do calendário", () => {
  const base = {
    date: "2026-10-15",
    label: "Tiro 6×800 m",
    structure: { blocks: [{ kind: "run" as const, distance_km: 0.8, pace: "4:10–4:00/km" }] },
    sport: "corrida" as const,
    weekStart: "2026-10-12",
    day: "Wed",
  };

  it("monta um treino de corrida com alvo de ritmo", () => {
    const ev = icuEventPayload(base)!;
    expect(ev.category).toBe("WORKOUT");
    expect(ev.type).toBe("Run");
    expect(ev.target).toBe("PACE");
    expect(ev.name).toBe("Tiro 6×800 m");
    expect(ev.start_date_local).toBe("2026-10-15T00:00:00");
    expect(ev.description).toBe("- Forte 800mtr 4:10/km-4:00/km Pace");
  });

  it("carrega um id nosso, para reenviar sem duplicar no calendário", () => {
    expect(icuEventPayload(base)!.external_id).toBe("limiar-2026-10-12-Wed");
  });

  it("manda distância em metros e tempo em segundos, que é a unidade de lá", () => {
    const ev = icuEventPayload({ ...base, distanceKm: 10, durationMin: 55 })!;
    expect(ev.distance).toBe(10000);
    expect(ev.moving_time).toBe(3300);
  });

  it("omite distância e tempo quando não há — zero não é um alvo", () => {
    const ev = icuEventPayload(base)!;
    expect(ev.distance).toBeUndefined();
    expect(ev.moving_time).toBeUndefined();
  });

  it("sem estrutura utilizável, não cria evento nenhum", () => {
    expect(icuEventPayload({ ...base, structure: { blocks: [] } })).toBeNull();
  });

  it("traduz o esporte para o vocabulário do intervals.icu", () => {
    expect(icuSportType("corrida")).toBe("Run");
    expect(icuSportType("ciclismo")).toBe("Ride");
    expect(icuSportType("natacao")).toBe("Swim");
    expect(icuSportType("musculacao")).toBe("WeightTraining");
  });
});
