import { describe, it, expect } from "vitest";
import { computeMetrics, paceToString, timeToString } from "@/lib/performance";

/**
 * The root of the whole app.
 *
 * Every training pace, every heart-rate zone, every race prediction, every
 * verdict the advisor and the execution comparison produce — all of it comes
 * out of `computeMetrics`. A wrong VDOT here is invisible: the app stays
 * internally consistent and confidently prescribes the wrong intensities to
 * everyone at once.
 *
 * So these tests check against published external references — Daniels' VDOT
 * table and the Riegel formula — not against whatever the code happens to
 * return today.
 */

/** Daniels' VDOT table: a 5 km time and the VDOT it corresponds to. */
const DANIELS_5K: Array<{ seconds: number; vdot: number; label: string }> = [
  { label: "24:08", seconds: 24 * 60 + 8,  vdot: 40 },
  { label: "19:57", seconds: 19 * 60 + 57, vdot: 50 },
  { label: "17:03", seconds: 17 * 60 + 3,  vdot: 60 },
];

describe("VDOT against Daniels' table", () => {
  it.each(DANIELS_5K)("5 km in $label is VDOT ≈ $vdot", ({ seconds, vdot }) => {
    const m = computeMetrics(5000, seconds);
    expect(m.vdot).toBeGreaterThan(vdot - 0.5);
    expect(m.vdot).toBeLessThan(vdot + 0.5);
  });

  it("rises when the same distance is run faster", () => {
    const slow = computeMetrics(5000, 1500);
    const fast = computeMetrics(5000, 1200);
    expect(fast.vdot).toBeGreaterThan(slow.vdot);
  });

  it("treats VDOT and VO2max as the same number", () => {
    const m = computeMetrics(3000, 780);
    expect(m.vo2max).toBe(m.vdot);
  });

  it("produces a plausible VDOT for a 3 km test", () => {
    // 3 km in 13:00 — a solid recreational runner.
    const m = computeMetrics(3000, 780);
    expect(m.vdot).toBeGreaterThan(35);
    expect(m.vdot).toBeLessThan(55);
  });

  it("records the test's own pace", () => {
    // 3 km in 13:00 = 4:20/km = 260 s/km.
    expect(computeMetrics(3000, 780).pace_sec_per_km).toBeCloseTo(260, 0);
  });
});

describe("training paces against Daniels' table", () => {
  // Published paces for a VDOT 50 runner, in sec/km.
  const VDOT_50 = computeMetrics(5000, 19 * 60 + 57);
  const mid = (name: string) => {
    const p = VDOT_50.paces.find(x => x.name === name)!;
    return (p.pace_min_sec + p.pace_max_sec) / 2;
  };

  /*
   * Expected values derived from Daniels' own equations for VDOT 50, not
   * transcribed from anywhere:
   *   easy      65–74% of VO2max          → 5:26–4:54, midpoint 5:10
   *   marathon  predicted marathon (3:10) → 4:31
   *   threshold pace held for 60 minutes  → 4:13
   *   interval  5 km to 3 km race pace    → 3:59–3:51, midpoint 3:55
   *
   * The easy figure here used to read 5:58, which is slower than the slow end
   * of Daniels' own E range — it had been fitted to the engine's output back
   * when the engine multiplied vVO2max by %VO2max figures, and it passed by two
   * seconds. A test written around the implementation cannot catch the
   * implementation being wrong; threshold and interval, which the bug barely
   * touched, were right all along.
   */
  it.each([
    ["easy",      5 * 60 + 10],
    ["marathon",  4 * 60 + 31],
    ["threshold", 4 * 60 + 13],
    ["interval",  3 * 60 + 55],
  ])("%s pace lands near Daniels' value", (name, expected) => {
    // ±15 s/km: a coach would not quarrel inside that, and a real error is
    // always much larger than it.
    expect(Math.abs(mid(name) - expected)).toBeLessThanOrEqual(15);
  });

  it("orders the paces from easiest to hardest", () => {
    const order = ["recovery", "easy", "marathon", "threshold", "interval", "repetition"];
    const mids = order.map(mid);
    for (let i = 1; i < mids.length; i++) {
      expect(mids[i], `${order[i]} must be faster than ${order[i - 1]}`).toBeLessThan(mids[i - 1]);
    }
  });

  it("gives every pace a range, faster bound below slower bound", () => {
    for (const p of VDOT_50.paces) {
      expect(p.pace_max_sec, `${p.name}`).toBeLessThan(p.pace_min_sec);
      expect(p.pace_max_sec).toBeGreaterThan(120);   // nobody runs sub-2:00/km
      expect(p.pace_min_sec).toBeLessThan(900);      // nor 15:00/km
    }
  });

  it("gets faster across the board as VDOT rises", () => {
    const slow = computeMetrics(5000, 24 * 60 + 8);
    const fast = computeMetrics(5000, 17 * 60 + 3);
    for (const name of ["easy", "threshold", "interval"]) {
      const s = slow.paces.find(p => p.name === name)!;
      const f = fast.paces.find(p => p.name === name)!;
      expect(f.pace_min_sec, name).toBeLessThan(s.pace_min_sec);
    }
  });

  it("always produces the six paces, with or without heart rate", () => {
    expect(computeMetrics(3000, 780).paces).toHaveLength(6);
    expect(computeMetrics(3000, 780, 178).paces).toHaveLength(6);
  });
});

describe("heart rate", () => {
  const WITH_HR = computeMetrics(3000, 780, 178);

  it("puts LTHR below the test average, not above it", () => {
    // A 12-minute maximal effort is run above threshold, so LTHR sits under
    // the test's average HR. Inverting this ratio would push every zone up by
    // ~30 bpm and nothing on screen would look wrong.
    expect(WITH_HR.lthr).toBeLessThan(178);
    expect(WITH_HR.lthr).toBeGreaterThan(178 * 0.85);
  });

  it("puts estimated HRmax above the test average", () => {
    expect(WITH_HR.hrmax_estimate).toBeGreaterThan(178);
    expect(WITH_HR.hrmax_estimate).toBeLessThan(178 * 1.15);
  });

  it("keeps LTHR below HRmax", () => {
    expect(WITH_HR.lthr).toBeLessThan(WITH_HR.hrmax_estimate);
  });

  /**
   * The athlete recorded a peak of 184 on this test and the card said 187.
   * Estimating a number you were handed is never right — and it is the sort of
   * wrongness nobody reports, because 187 is a perfectly believable HRmax.
   */
  it("prefere a FC máxima medida à estimada", () => {
    const measured = computeMetrics(3000, 851, 178, 184);
    expect(measured.hrmax_estimate).toBe(184);

    const estimated = computeMetrics(3000, 851, 178);
    expect(estimated.hrmax_estimate).not.toBe(184);
  });

  it("nunca deixa o limiar passar de 92% da máxima medida", () => {
    // Um teste curto com FC média muito perto da máxima empurraria o limiar
    // acima do fisiologicamente plausível sem esse teto.
    const nearMax = computeMetrics(3000, 851, 182, 184);
    expect(nearMax.lthr).toBeLessThanOrEqual(Math.round(184 * 0.92));
  });

  /**
   * Bug real: os limites vinham todos de percentuais arredondados de forma
   * independente, então 148, 154 e 164 bpm não caíam em zona nenhuma. O teste
   * anterior tolerava "até 2 bpm" de folga entre zonas — foi escrito em volta
   * do defeito em vez de pegá-lo. Contiguidade agora é exata.
   */
  it("cobre toda faixa de batimento sem buraco entre zonas", () => {
    const z = WITH_HR.zones;
    expect(z).toHaveLength(5);
    for (let i = 1; i < z.length; i++) {
      expect(z[i].min_bpm, `zona ${i + 1} não encosta na zona ${i}`)
        .toBe(z[i - 1].max_bpm! + 1);
    }
    expect(z[4].max_bpm, "a zona de topo é aberta").toBeNull();
  });

  it("classifica qualquer batimento entre 0 e a máxima em exatamente uma zona", () => {
    for (const lthr of [140, 155, 165, 169, 178, 190]) {
      const z = computeMetrics(3000, 851, Math.round(lthr / 0.95)).zones;
      for (let bpm = 0; bpm <= 220; bpm++) {
        const hits = z.filter(x => bpm >= x.min_bpm && (x.max_bpm == null || bpm <= x.max_bpm));
        expect(hits.length, `${bpm} bpm com LTHR ~${lthr} caiu em ${hits.length} zonas`).toBe(1);
      }
    }
  });

  it("puts threshold heart rate on the zone 4 / zone 5 boundary, as Friel does", () => {
    // Friel: zone 4 tops out just under LTHR (99%), zone 5 starts at it.
    const [, , , z4, z5] = WITH_HR.zones;
    expect(z4.max_bpm!).toBeLessThan(WITH_HR.lthr);
    expect(z5.min_bpm).toBe(WITH_HR.lthr);
  });

  it("agrees with the heart-rate bands the workout engine prescribes", () => {
    // performance.ts draws the zone card; workout-builder writes the ranges into
    // the plan. If they drift apart, the same session shows two different
    // windows and neither is obviously wrong.
    // Os tetos são os percentuais do Friel; os pisos encostam no teto anterior,
    // que é o que elimina os buracos sem inventar limites novos.
    const [z1, z2, z3, z4] = WITH_HR.zones;
    expect(z1.max_bpm).toBe(Math.round(WITH_HR.lthr * 0.81) - 1);
    expect(z2.max_bpm).toBe(Math.round(WITH_HR.lthr * 0.89));
    expect(z3.max_bpm).toBe(Math.round(WITH_HR.lthr * 0.93));
    expect(z4.max_bpm).toBe(WITH_HR.lthr - 1);
  });

  it("omits zones entirely when the test had no heart rate", () => {
    const noHr = computeMetrics(3000, 780);
    expect(noHr.zones).toEqual([]);
    expect(noHr.lthr).toBe(0);
    // Paces do not depend on heart rate and must survive.
    expect(noHr.paces).toHaveLength(6);
  });
});

describe("race predictions (Riegel)", () => {
  const m = computeMetrics(3000, 780);
  const at = (label: string) => m.predictions.find(p => p.distance_label === label)!;

  it("predicts the four standard distances", () => {
    expect(m.predictions.map(p => p.distance_label)).toEqual(["5 km", "10 km", "Meia", "Maratona"]);
  });

  it("matches the Riegel formula T2 = T1 × (D2/D1)^1.06", () => {
    for (const p of m.predictions) {
      const expected = 780 * Math.pow((p.distance_km * 1000) / 3000, 1.06);
      expect(p.predicted_seconds).toBeCloseTo(expected, 0);
    }
  });

  it("gets slower per kilometre as the distance grows", () => {
    const pacePerKm = (label: string) => at(label).predicted_seconds / at(label).distance_km;
    expect(pacePerKm("10 km")).toBeGreaterThan(pacePerKm("5 km"));
    expect(pacePerKm("Meia")).toBeGreaterThan(pacePerKm("10 km"));
    expect(pacePerKm("Maratona")).toBeGreaterThan(pacePerKm("Meia"));
  });

  it("puts a 13:00 3 km inside a believable half marathon window", () => {
    const half = at("Meia").predicted_seconds;
    expect(half).toBeGreaterThan(90 * 60);
    expect(half).toBeLessThan(115 * 60);
  });
});

describe("formatting", () => {
  it("pads pace seconds", () => {
    expect(paceToString(305)).toBe("5:05");
    expect(paceToString(300)).toBe("5:00");
    expect(paceToString(260)).toBe("4:20");
  });

  it("adds hours only when there are hours", () => {
    expect(timeToString(1340)).toBe("22:20");
    expect(timeToString(6166)).toBe("1:42:46");
    expect(timeToString(59)).toBe("0:59");
  });
});

describe("degenerate input", () => {
  /**
   * Infinity renders as a real-looking number, gets stored, and poisons every
   * pace, zone and verdict downstream. The root function refuses it rather
   * than trusting every caller to validate first.
   */
  it.each([
    ["zero time", 3000, 0],
    ["zero distance", 0, 780],
    ["negative time", 3000, -60],
    ["NaN distance", NaN, 780],
    ["infinite time", 3000, Infinity],
  ])("returns a safe empty result for %s", (_label, distanceM, timeSeconds) => {
    const m = computeMetrics(distanceM, timeSeconds);
    expect(Number.isFinite(m.vdot)).toBe(true);
    expect(m.paces.every(p => Number.isFinite(p.pace_min_sec) && Number.isFinite(p.pace_max_sec))).toBe(true);
    expect(m.predictions.every(p => Number.isFinite(p.predicted_seconds))).toBe(true);
  });

  it("never emits an infinite pace for any plausible test", () => {
    for (const secs of [400, 600, 780, 1200, 1800]) {
      for (const dist of [1000, 3000, 5000, 10000]) {
        const m = computeMetrics(dist, secs, 175);
        for (const p of m.paces) {
          expect(Number.isFinite(p.pace_min_sec), `${dist}m/${secs}s ${p.name}`).toBe(true);
          expect(p.pace_min_sec).toBeGreaterThan(0);
        }
      }
    }
  });

  it("handles a very short test without throwing", () => {
    expect(() => computeMetrics(400, 70)).not.toThrow();
  });

  it("handles a marathon-length input without throwing", () => {
    expect(() => computeMetrics(42195, 3 * 3600)).not.toThrow();
  });
});
