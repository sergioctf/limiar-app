import { describe, it, expect } from "vitest";
import { buildMacroWeeks, raceDemand } from "@/lib/macro-builder";
import { buildWeekPlan, normalizePrefs } from "@/lib/workout-builder";
import type { WeeklyPlanDay } from "@/types";

/**
 * The macro plan's key workout and the week the generator actually builds must
 * describe the same long run.
 *
 * They did not: `keyWorkoutFor` sized it purely as a share of the week's target
 * volume, while the weekly generator had been taught (task #32) to floor it on
 * the distance the athlete has already covered. For a 13 km week that meant the
 * macro promised "longão 3 km" to someone the weekly plan was sending out for
 * 6.5 — and the card an athlete reads for the long view was the wrong one.
 */

const weekStarts = ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"];
const RACE = { raceDate: "2026-10-25", raceKm: 21.1 };

const longKmOf = (text: string): number => {
  const m = text.match(/longão ([\d,]+) km/);
  return m ? Number(m[1].replace(",", ".")) : NaN;
};

describe("macro key workout — long run", () => {
  it("no longer proposes a token long run to a proven half-marathoner", () => {
    const [week] = buildMacroWeeks({
      weekStarts, ...RACE, currentWeeklyKm: 13, provenLongRunKm: 21.4,
    });
    expect(longKmOf(week.key_workout)).toBeGreaterThanOrEqual(6);
  });

  it("agrees with the week the generator actually builds", () => {
    const currentWeeklyKm = 13;
    const provenLongRunKm = 21.4;

    const [macroWeek] = buildMacroWeeks({
      weekStarts, ...RACE, currentWeeklyKm, provenLongRunKm,
    });

    const days: WeeklyPlanDay[] = buildWeekPlan(
      { weeklyKm: currentWeeklyKm, paces: null, lthr: null, provenLongRunKm },
      ["corrida"],
      normalizePrefs({
        runDays: ["Mon", "Wed", "Sat"], strengthDays: [],
        longRunDay: "Sat", qualityPerWeek: 1,
      }),
    );
    const built = days.find(d => d.label.includes("Longão"))?.distance_km ?? 0;

    // Within a kilometre: the macro is a projection, not a prescription, but it
    // must not disagree by a factor of two.
    expect(Math.abs(longKmOf(macroWeek.key_workout) - built)).toBeLessThanOrEqual(1);
  });

  it("still grows with the week when there is no history to lean on", () => {
    const small = buildMacroWeeks({ weekStarts, ...RACE, currentWeeklyKm: 12, provenLongRunKm: 0 });
    const big   = buildMacroWeeks({ weekStarts, ...RACE, currentWeeklyKm: 40, provenLongRunKm: 0 });
    expect(longKmOf(big[0].key_workout)).toBeGreaterThan(longKmOf(small[0].key_workout));
  });

  it("never lets the long run swallow the week", () => {
    for (const proven of [0, 21.4, 42]) {
      const [week] = buildMacroWeeks({ weekStarts, ...RACE, currentWeeklyKm: 13, provenLongRunKm: proven });
      expect(longKmOf(week.key_workout)).toBeLessThanOrEqual(13 * 0.5);
    }
  });

  it("never exceeds what the race asks for", () => {
    // A marathoner's proven 38 km must not become the long run of a 10 km plan.
    const [week] = buildMacroWeeks({
      weekStarts, raceDate: "2026-10-25", raceKm: 10,
      currentWeeklyKm: 60, provenLongRunKm: 38,
    });
    expect(longKmOf(week.key_workout)).toBeLessThanOrEqual(raceDemand(10).longRunKm);
  });

  it("writes distances the Portuguese way", () => {
    const [week] = buildMacroWeeks({
      weekStarts, ...RACE, currentWeeklyKm: 13, provenLongRunKm: 21.4,
    });
    expect(week.key_workout).not.toMatch(/\d\.\d/);   // never "6.5 km"
  });

  it("is unchanged for athletes with no proven distance", () => {
    const withField = buildMacroWeeks({ weekStarts, ...RACE, currentWeeklyKm: 30, provenLongRunKm: 0 });
    const without   = buildMacroWeeks({ weekStarts, ...RACE, currentWeeklyKm: 30 });
    expect(withField.map(w => w.key_workout)).toEqual(without.map(w => w.key_workout));
  });
});
