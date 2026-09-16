/**
 * Only runs belong in the `runs` table.
 *
 * The daily catch-up job imported every activity Strava returned — rides,
 * walks, yoga, gym sessions — and filed them as zero-kilometre "easy runs".
 * Ten of them landed in production before anyone noticed, because nothing
 * errors: they simply inflate the training-day count and, worse, enter the
 * weekly-volume history that every prescribed distance is derived from.
 *
 * The webhook always filtered. The catch-up path did not, and the two must
 * agree — a safety net that corrupts what it catches up is worse than none.
 */
import { describe, it, expect } from "vitest";

/** The predicate both import paths use. */
const isRun = (a: { type?: string; sport_type?: string }) =>
  a.type === "Run" || a.sport_type === "Run";

describe("o que pode virar uma corrida", () => {
  it("aceita corrida em qualquer um dos dois campos", () => {
    expect(isRun({ type: "Run" })).toBe(true);
    expect(isRun({ sport_type: "Run" })).toBe(true);
    expect(isRun({ type: "Run", sport_type: "Run" })).toBe(true);
  });

  it("recusa tudo que o Strava mandou e virou corrida de 0 km", () => {
    // Exatamente os tipos encontrados em produção.
    for (const t of ["WeightTraining", "Ride", "Walk", "Yoga", "Pilates",
                     "StairStepper", "Elliptical", "Tennis", "Pickleball",
                     "HighIntensityIntervalTraining", "Workout"]) {
      expect(isRun({ type: t, sport_type: t }), t).toBe(false);
    }
  });

  it("recusa atividade sem tipo em vez de assumir corrida", () => {
    expect(isRun({})).toBe(false);
    expect(isRun({ type: undefined, sport_type: undefined })).toBe(false);
  });

  it("não confunde TrailRun com Run", () => {
    // Trail é corrida de verdade, mas o Strava manda `type: "Run"` junto —
    // aceitar pelo prefixo abriria a porta para "VirtualRide".
    expect(isRun({ type: "Run", sport_type: "TrailRun" })).toBe(true);
    expect(isRun({ type: "VirtualRide", sport_type: "VirtualRide" })).toBe(false);
  });
});
