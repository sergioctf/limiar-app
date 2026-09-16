import { describe, it, expect } from "vitest";
import { Decoder, Stream } from "@garmin/fitsdk";
import { buildWorkoutFit } from "@/lib/workout-fit";
import type { StructuredWorkout } from "@/types";

/**
 * What the athlete actually sees on the watch mid-session.
 *
 * The file already guided pace and distance correctly. What it threw away was
 * everything that makes a step legible while running: the coach's cue, a name
 * that says what the step is, and — on a device that supports it — the
 * heart-rate window alongside the pace instead of instead of it.
 *
 * Every assertion here decodes the bytes back. A field written to the wrong
 * name encodes without complaint and guides nothing, which is how this file
 * shipped broken once before.
 */
interface DecodedStep {
  wktStepName?: string;
  notes?: string;
  durationType?: string;
  durationValue?: number;
  targetType?: string;
  targetValue?: number;
  customTargetValueLow?: number;
  customTargetValueHigh?: number;
  secondaryTargetType?: string;
  secondaryCustomTargetValueLow?: number;
  secondaryCustomTargetValueHigh?: number;
  intensity?: string;
}

function decode(bytes: Uint8Array): DecodedStep[] {
  const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
  expect(decoder.isFIT()).toBe(true);
  expect(decoder.checkIntegrity()).toBe(true);
  const { messages, errors } = decoder.read();
  expect(errors).toEqual([]);
  return (messages.workoutStepMesgs ?? []) as DecodedStep[];
}

const HR = { min: 165, max: 175, zone: "Z5", label: "VO₂max" };

const SESSION: StructuredWorkout = {
  blocks: [
    {
      kind: "warmup", distance_km: 2, pace: "6:00–6:30/km", intensity: "E",
      note: "Aquecimento progressivo antes dos tiros.",
    },
    {
      repeat: 4,
      steps: [
        {
          kind: "run", distance_km: 0.4, pace: "4:17–4:30/km", hr: HR, intensity: "I",
          note: "Forte e uniforme — o último tiro deve sair no mesmo ritmo do primeiro.",
        },
        { kind: "recovery", duration_min: 2, pace: "7:00–7:30/km", intensity: "E", note: "Trote, não pare." },
      ],
    },
    { kind: "cooldown", distance_km: 1.5, pace: "6:00–6:30/km", intensity: "E" },
  ],
};

describe("the coach's cue reaches the watch", () => {
  const steps = decode(buildWorkoutFit("Tiro 4×400 m", SESSION, "corrida"));

  it("carries the note of each step", () => {
    expect(steps[0].notes).toContain("Aquecimento progressivo");
    expect(steps[1].notes).toContain("mesmo ritmo do primeiro");
    expect(steps[2].notes).toContain("Trote");
  });

  it("leaves a step with no note alone rather than inventing one", () => {
    const cooldown = steps.find(s => s.intensity === "cooldown")!;
    expect(cooldown.notes ?? "").toBe("");
  });

  it("keeps the whole cue, not just the part the athlete could guess", () => {
    // The engine's cues run past sixty characters and the instruction lives at
    // the end. A tidy-looking 50-char cut removed exactly the useful half.
    const cue = SESSION.blocks[1] as { steps: Array<{ note?: string }> };
    expect(cue.steps[0].note!.length).toBeGreaterThan(50);
    expect(steps[1].notes).toBe(cue.steps[0].note);
  });

  it("still caps a runaway string so it cannot bloat the file", () => {
    const wordy: StructuredWorkout = {
      blocks: [{ kind: "run", distance_km: 5, pace: "5:00/km", note: "x".repeat(4000) }],
    };
    const [step] = decode(buildWorkoutFit("Longo", wordy, "corrida"));
    expect(step.notes!.length).toBeLessThanOrEqual(200);
  });
});

describe("step names say what the step is", () => {
  const steps = decode(buildWorkoutFit("Tiro 4×400 m", SESSION, "corrida"));

  it("names a distance step by its distance", () => {
    // "Forte" on every interval tells the athlete nothing they did not know.
    expect(steps[1].wktStepName).toContain("400");
    expect(steps[0].wktStepName).toContain("2");
  });

  it("names a time step by its duration", () => {
    expect(steps[2].wktStepName).toMatch(/2\s*min/i);
  });

  it("stays inside what a watch will render", () => {
    for (const s of steps) {
      expect((s.wktStepName ?? "").length).toBeLessThanOrEqual(16);
    }
  });

  it("still names a step that has no distance or duration", () => {
    const open: StructuredWorkout = { blocks: [{ kind: "run", pace: "5:00/km" }] };
    const [step] = decode(buildWorkoutFit("Livre", open, "corrida"));
    expect((step.wktStepName ?? "").length).toBeGreaterThan(0);
  });
});

describe("pace and heart rate together", () => {
  const steps = decode(buildWorkoutFit("Tiro 4×400 m", SESSION, "corrida"));
  const tiro = steps[1];

  it("guides a run by pace", () => {
    expect(tiro.targetType).toBe("speed");
  });

  it("and still shows the heart-rate window as a secondary target", () => {
    // The engine computes both; sending only one threw away half the
    // prescription for no reason.
    expect(tiro.secondaryTargetType).toBe("heartRate");
    // FIT encodes absolute bpm as bpm + 100.
    expect(tiro.secondaryCustomTargetValueLow).toBe(265);
    expect(tiro.secondaryCustomTargetValueHigh).toBe(275);
  });

  it("does not invent a secondary target when there is no heart rate", () => {
    const semFc: StructuredWorkout = { blocks: [{ kind: "run", distance_km: 5, pace: "5:00/km" }] };
    const [step] = decode(buildWorkoutFit("Rodagem", semFc, "corrida"));
    expect(step.targetType).toBe("speed");
    expect(step.secondaryTargetType ?? "invalid").not.toBe("heartRate");
  });

  it("inverts the pair on the bike, where speed says nothing outdoors", () => {
    const bike: StructuredWorkout = {
      blocks: [{ kind: "run", duration_min: 20, pace: "3:00/km", hr: HR, intensity: "T" }],
    };
    const [step] = decode(buildWorkoutFit("Bike", bike, "ciclismo"));
    expect(step.targetType).toBe("heartRate");
    expect(step.secondaryTargetType).toBe("speed");
  });
});

describe("repeats", () => {
  it("repeats a block the prescribed number of times", () => {
    const steps = decode(buildWorkoutFit("Tiro 4×400 m", SESSION, "corrida"));
    const controller = steps.find(s => s.durationType === "repeatUntilStepsCmplt")!;
    expect(controller.targetValue).toBe(4);
    expect(controller.durationValue).toBe(1);   // jump back to the first interval step
  });

  it("does not turn a single pass into two", () => {
    /*
     * `Math.max(2, repeat)` silently doubled a block prescribed once. A repeat
     * of one is not a repeat — emit the steps and move on, or the athlete runs
     * a session nobody wrote.
     */
    const once: StructuredWorkout = {
      blocks: [{ repeat: 1, steps: [{ kind: "run", distance_km: 3, pace: "4:30/km" }] }],
    };
    const steps = decode(buildWorkoutFit("Uma vez", once, "corrida"));

    expect(steps.some(s => s.durationType === "repeatUntilStepsCmplt")).toBe(false);
    expect(steps).toHaveLength(1);
  });

  it("still repeats when asked for two", () => {
    const twice: StructuredWorkout = {
      blocks: [{ repeat: 2, steps: [{ kind: "run", distance_km: 3, pace: "4:30/km" }] }],
    };
    const steps = decode(buildWorkoutFit("Duas vezes", twice, "corrida"));
    expect(steps.find(s => s.durationType === "repeatUntilStepsCmplt")?.targetValue).toBe(2);
  });
});
