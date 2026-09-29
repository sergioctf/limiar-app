/**
 * O que o Strava manda, e o que o Limiar entende.
 *
 * O caso que originou o arquivo: o Sérgio mergulhou, o Strava gravou como
 * `Workout` — o balde dele para o que não modela — e o app mostrou
 * "Musculação · 15 min" (26/09/2026). O rótulo errado é o menor problema: o
 * dia de musculação do plano passa a contar como feito, porque `day-status`
 * casa plano e registro pelo esporte.
 */
import { describe, expect, it } from "vitest";
import { toSportKey } from "@/lib/sports";

describe("um treino genérico do Strava não é musculação", () => {
  it("Workout vira 'outro', não musculação", () => {
    expect(toSportKey("Workout")).toBe("outro");
  });

  it("mas musculação de verdade continua sendo musculação", () => {
    for (const t of ["WeightTraining", "Crossfit", "Gym", "StrengthTraining", "Musculação"]) {
      expect(toSportKey(t), t).toBe("musculacao");
    }
  });

  it("HIIT continua no balde de força", () => {
    for (const t of ["HighIntensityIntervalTraining", "HIIT", "hitt"]) {
      expect(toSportKey(t), t).toBe("musculacao");
    }
  });

  it("mergulho não é natação nem musculação", () => {
    for (const t of ["Scuba", "Snorkel", "Dive", "Mergulho"]) {
      expect(toSportKey(t), t).toBe("outro");
    }
  });

  it("e o que já funcionava continua funcionando", () => {
    expect(toSportKey("Run")).toBe("corrida");
    expect(toSportKey("Swim")).toBe("natacao");
    expect(toSportKey("Ride")).toBe("ciclismo");
    expect(toSportKey("Yoga")).toBe("yoga");
    expect(toSportKey("Walk")).toBe("caminhada");
    expect(toSportKey("")).toBeNull();
  });
});
