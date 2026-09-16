import { describe, it, expect } from "vitest";
import { computeMetrics, danielsRaceTime, type TrainingPace } from "@/lib/performance";

/**
 * Training paces, checked against the only thing that can arbitrate them: the
 * race times Daniels' own equations predict for the same VDOT.
 *
 * Three of the five zones are race paces by definition — threshold is what you
 * could hold for an hour, interval is 3–5 km pace, marathon is marathon pace.
 * So they are not a matter of opinion, and a test that only asserted "faster
 * than easy" would have passed the bug this file exists to prevent.
 */

/** A 3 km test at a given time, which is how the app learns a VDOT. */
function paces(threeKmSeconds: number): Record<string, TrainingPace> {
  const m = computeMetrics(3000, threeKmSeconds, 175, 187);
  return Object.fromEntries(m.paces.map(p => [p.name, p]));
}

const SERGIO = 14 * 60 + 11;   // 14:11 → VDOT ~39.5
const MANOELA = 16 * 60 + 9;   // 16:09 → VDOT ~34.0

const mid = (p: TrainingPace) => (p.pace_min_sec + p.pace_max_sec) / 2;
const vdotOf = (s: number) => computeMetrics(3000, s, 175, 187).vdot;

describe("danielsRaceTime", () => {
  it("reproduces the test it was derived from", () => {
    const vdot = vdotOf(SERGIO);
    // A VDOT computed from a 3 km time must predict that same 3 km time back.
    expect(danielsRaceTime(vdot, 3000)).toBeCloseTo(SERGIO, 0);
  });

  it("gets slower per km as the distance grows", () => {
    const vdot = vdotOf(SERGIO);
    const pace = (m: number) => danielsRaceTime(vdot, m) / (m / 1000);
    expect(pace(5000)).toBeGreaterThan(pace(3000));
    expect(pace(10000)).toBeGreaterThan(pace(5000));
    expect(pace(42195)).toBeGreaterThan(pace(21097));
  });

  it("gets faster at every distance as VDOT rises", () => {
    expect(danielsRaceTime(50, 10000)).toBeLessThan(danielsRaceTime(40, 10000));
  });
});

describe("paces are anchored to real race paces", () => {
  it("threshold is the pace held for a one-hour race", () => {
    for (const test of [SERGIO, MANOELA]) {
      const vdot = vdotOf(test);
      const p = paces(test).threshold;

      // Distance covered in 60 minutes, then its pace.
      let metres = 12000;
      for (let i = 0; i < 60; i++) {
        metres *= Math.sqrt(3600 / danielsRaceTime(vdot, metres));
      }
      const hourPace = 3600 / (metres / 1000);

      expect(mid(p)).toBeGreaterThan(hourPace - 8);
      expect(mid(p)).toBeLessThan(hourPace + 8);
    }
  });

  it("marathon pace brackets the predicted marathon", () => {
    for (const test of [SERGIO, MANOELA]) {
      const marathon = danielsRaceTime(vdotOf(test), 42195) / 42.195;
      const p = paces(test).marathon;
      expect(p.pace_max_sec).toBeLessThanOrEqual(marathon);
      expect(p.pace_min_sec).toBeGreaterThanOrEqual(marathon);
    }
  });

  it("interval pace is 5 km to 3 km race pace", () => {
    const vdot = vdotOf(SERGIO);
    const p = paces(SERGIO).interval;
    const fiveK  = danielsRaceTime(vdot, 5000) / 5;
    const threeK = danielsRaceTime(vdot, 3000) / 3;

    expect(p.pace_min_sec).toBeCloseTo(fiveK, 0);
    expect(p.pace_max_sec).toBeCloseTo(threeK, 0);
  });
});

describe("the %VO2max regression", () => {
  /*
   * Daniels' zone percentages are percentages of VO2MAX, not of the velocity at
   * VO2max. Applying them to velocity is exact at 100% and drifts slow as the
   * intensity falls — which is why the interval pace looked fine while easy
   * running came out half a minute per kilometre too slow, and every long run
   * in the app was a shuffle.
   */
  it("easy pace is not the half-minute too slow it used to be", () => {
    const easy = paces(SERGIO).easy;
    // The old engine produced 6:27–7:29 for this athlete.
    expect(easy.pace_max_sec).toBeLessThan(6 * 60 + 10);
    expect(easy.pace_min_sec).toBeLessThan(6 * 60 + 50);
  });

  it("easy pace stays a usable width, not a 70-second guess", () => {
    for (const test of [SERGIO, MANOELA]) {
      const easy = paces(test).easy;
      expect(easy.pace_min_sec - easy.pace_max_sec).toBeLessThan(50);
    }
  });

  it("easy running is comfortably slower than marathon pace", () => {
    for (const test of [SERGIO, MANOELA]) {
      const p = paces(test);
      expect(p.easy.pace_max_sec).toBeGreaterThan(p.marathon.pace_min_sec);
    }
  });
});

describe("the ladder holds together", () => {
  const ORDER = ["recovery", "easy", "marathon", "threshold", "interval", "repetition"];

  it("every zone is faster than the one below it", () => {
    for (const test of [SERGIO, MANOELA]) {
      const p = paces(test);
      for (let i = 1; i < ORDER.length; i++) {
        expect(mid(p[ORDER[i]])).toBeLessThan(mid(p[ORDER[i - 1]]));
      }
    }
  });

  it("each band runs slow-end to fast-end", () => {
    const p = paces(SERGIO);
    for (const name of ORDER) {
      expect(p[name].pace_min_sec).toBeGreaterThan(p[name].pace_max_sec);
    }
  });

  it("a fitter athlete is faster in every zone", () => {
    const fast = paces(SERGIO);
    const slow = paces(MANOELA);
    for (const name of ORDER) {
      expect(mid(fast[name])).toBeLessThan(mid(slow[name]));
    }
  });

  it("produces sane numbers across the whole range of athletes", () => {
    // 20:00 for 3 km is a beginner; 9:00 is a serious club runner.
    for (const seconds of [1200, 1080, 960, 840, 720, 600, 540]) {
      const p = paces(seconds);
      for (const name of ORDER) {
        expect(Number.isFinite(p[name].pace_min_sec)).toBe(true);
        expect(p[name].pace_max_sec).toBeGreaterThan(120);   // faster than 2:00/km is nonsense
        expect(p[name].pace_min_sec).toBeLessThan(15 * 60);  // slower than 15:00/km too
      }
    }
  });
});
