import { describe, it, expect } from "vitest";
import { Decoder, Stream } from "@garmin/fitsdk";
import { buildWorkoutFit } from "@/lib/workout-fit";
import { buildWeekPlan } from "@/lib/workout-builder";
import { weekContext, PREFS_3_DAYS } from "./fixtures";
import type { StructuredWorkout } from "@/types";

/**
 * The .FIT export was silently broken once: every step encoded with no duration
 * and no targets, because the code wrote to `durationDistance` and
 * `targetSpeedLow`, which are decode-side sub-field aliases. The file opened
 * fine, imported fine, and guided nothing.
 *
 * Nothing short of decoding the bytes back catches that — so these tests do.
 */
interface DecodedStep {
  durationType?: string;
  durationValue?: number;
  durationDistance?: number;
  durationTime?: number;
  targetType?: string;
  customTargetValueLow?: number;
  customTargetValueHigh?: number;
  customTargetSpeedLow?: number;
  customTargetSpeedHigh?: number;
  customTargetHeartRateLow?: number;
  customTargetHeartRateHigh?: number;
  wktStepName?: string;
  intensity?: string;
}

function decode(bytes: Uint8Array): { steps: DecodedStep[]; workout: Record<string, unknown> } {
  const stream = Stream.fromByteArray(Array.from(bytes));
  const decoder = new Decoder(stream);
  expect(decoder.isFIT(), "produced bytes are not a FIT file").toBe(true);
  expect(decoder.checkIntegrity(), "FIT integrity check failed").toBe(true);

  const { messages, errors } = decoder.read();
  expect(errors).toEqual([]);
  return {
    steps: (messages.workoutStepMesgs ?? []) as DecodedStep[],
    // The SDK's message types are strict unions; we only read a couple of
    // fields back, so widen once here rather than modelling the whole profile.
    workout: ((messages.workoutMesgs ?? [])[0] ?? {}) as unknown as Record<string, unknown>,
  };
}

const RUN_SESSION: StructuredWorkout = {
  blocks: [
    { kind: "warmup", distance_km: 2, pace: "6:00–6:30/km", intensity: "E" },
    {
      repeat: 4,
      steps: [
        { kind: "run", distance_km: 1, pace: "4:17–4:30/km", hr: { min: 165, max: 175, zone: "Z5", label: "VO₂max" }, intensity: "I" },
        { kind: "recovery", duration_min: 2, pace: "7:00–7:30/km", intensity: "E" },
      ],
    },
    { kind: "cooldown", distance_km: 1.5, pace: "6:00–6:30/km", intensity: "E" },
  ],
};

describe("buildWorkoutFit — every step must actually guide", () => {
  const { steps } = decode(buildWorkoutFit("Tiro 4×1000 m", RUN_SESSION, "corrida"));

  it("emits one step per prescribed segment plus the repeat controller", () => {
    // warmup + (run + recovery) + repeat controller + cooldown
    expect(steps).toHaveLength(5);
  });

  it("gives every real step a duration — the bug that shipped", () => {
    for (const s of steps) {
      if (s.durationType === "repeatUntilStepsCmplt") continue;
      expect(s.durationType, `step "${s.wktStepName}" has no duration type`).toBeDefined();
      expect(s.durationType).not.toBe("open");
      expect(s.durationValue, `step "${s.wktStepName}" has no duration value`).toBeGreaterThan(0);
    }
  });

  it("decodes distances back to the kilometres prescribed", () => {
    // Scale 100: the SDK exposes the decoded sub-field in metres.
    const warmup = steps[0];
    expect(warmup.durationType).toBe("distance");
    expect(warmup.durationDistance).toBeCloseTo(2000, 0);

    const rep = steps[1];
    expect(rep.durationDistance).toBeCloseTo(1000, 0);
  });

  it("decodes the time-based recovery back to two minutes", () => {
    const recovery = steps[2];
    expect(recovery.durationType).toBe("time");
    expect(recovery.durationTime).toBeCloseTo(120, 0);
  });

  it("gives every real step a target", () => {
    for (const s of steps) {
      if (s.durationType === "repeatUntilStepsCmplt") continue;
      expect(s.targetType, `step "${s.wktStepName}" has no target`).not.toBe("open");
      expect(s.customTargetValueLow).toBeGreaterThan(0);
      expect(s.customTargetValueHigh).toBeGreaterThan(0);
    }
  });

  it("decodes running targets to a plausible speed, not a fantasy one", () => {
    const rep = steps[1];
    expect(rep.targetType).toBe("speed");
    // 4:17–4:30/km is 3.70–3.89 m/s.
    const low = rep.customTargetSpeedLow ?? (rep.customTargetValueLow! / 1000);
    const high = rep.customTargetSpeedHigh ?? (rep.customTargetValueHigh! / 1000);
    expect(low).toBeGreaterThan(3.0);
    expect(high).toBeLessThan(4.5);
    expect(low).toBeLessThan(high);
  });

  it("repeats the interval block the prescribed number of times", () => {
    const controller = steps.find(s => s.durationType === "repeatUntilStepsCmplt");
    expect(controller).toBeDefined();
    expect(controller!.durationValue).toBe(1);      // jump back to step index 1
  });
});

describe("buildWorkoutFit — sport-specific targets", () => {
  it("guides cycling by heart rate, since outdoor speed says nothing", () => {
    const bike: StructuredWorkout = {
      blocks: [{
        kind: "run", duration_min: 20, pace: "4:00–4:30/km",
        hr: { min: 140, max: 155, zone: "Z3", label: "Tempo" }, intensity: "T",
      }],
    };
    const { steps } = decode(buildWorkoutFit("Bike tempo", bike, "ciclismo"));
    expect(steps[0].targetType).toBe("heartRate");
    // Encoded as bpm + 100; reading raw bpm back would mean "percent of max".
    const low = steps[0].customTargetHeartRateLow ?? steps[0].customTargetValueLow!;
    expect(low === 140 || low === 240).toBe(true);
    expect(steps[0].customTargetValueLow).toBeGreaterThan(100);
  });

  it("reads a swim pace per 100 m, not per kilometre", () => {
    const swim: StructuredWorkout = {
      blocks: [{ kind: "run", distance_km: 0.4, pace: "1:45–1:55/100m", intensity: "T" }],
    };
    const { steps } = decode(buildWorkoutFit("Série 8×50", swim, "natacao"));
    expect(steps[0].targetType).toBe("speed");
    // 1:45–1:55 per 100 m is 0.87–0.95 m/s. Reading it as per-km gives ~7 m/s,
    // roughly three times the world record.
    const speed = steps[0].customTargetSpeedLow ?? (steps[0].customTargetValueLow! / 1000);
    expect(speed).toBeGreaterThan(0.5);
    expect(speed).toBeLessThan(2.5);
  });

  it("records the sport on the workout itself", () => {
    const { workout } = decode(buildWorkoutFit("Bike", {
      blocks: [{ kind: "run", duration_min: 30, hr: { min: 130, max: 145, zone: "Z2", label: "Aeróbico" } }],
    }, "ciclismo"));
    expect(workout.sport).toBe("cycling");
  });
});

describe("buildWorkoutFit — robustness", () => {
  it("refuses a workout with no steps rather than writing a broken file", () => {
    expect(() => buildWorkoutFit("Vazio", { blocks: [] })).toThrow();
  });

  it("falls back to an open target when there is no pace or heart rate", () => {
    const { steps } = decode(buildWorkoutFit("Sem alvo", {
      blocks: [{ kind: "run", distance_km: 5 }],
    }));
    expect(steps[0].targetType).toBe("open");
    expect(steps[0].durationValue).toBeGreaterThan(0);
  });

  it("exports every session the engine produces this week", () => {
    const plan = buildWeekPlan(weekContext(), ["corrida"], PREFS_3_DAYS);
    for (const day of plan.filter(d => d.structure)) {
      const bytes = buildWorkoutFit(day.label, day.structure!, "corrida");
      const { steps } = decode(bytes);
      expect(steps.length, `${day.label} produced no steps`).toBeGreaterThan(0);
      for (const s of steps) {
        if (s.durationType === "repeatUntilStepsCmplt") continue;
        expect(s.durationValue, `${day.label}: step without duration`).toBeGreaterThan(0);
      }
    }
  });
});
