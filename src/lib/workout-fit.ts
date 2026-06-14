/**
 * Structured workout → Garmin .FIT workout file.
 * Uses the official @garmin/fitsdk Encoder. Server-side only.
 *
 * FIT workout files are understood by Garmin Connect, Coros, Wahoo and Zepp:
 * the watch then guides the athlete step by step with pace alerts.
 */
import { Encoder, Profile } from "@garmin/fitsdk";
import { isRepeatBlock } from "@/types";
import type { StructuredWorkout, WorkoutStep } from "@/types";

/** "4:25–4:35/km" | "4:30/km" → average m/s (null when unparsable) */
function paceToSpeedRange(pace?: string): { low: number; high: number } | null {
  if (!pace) return null;
  const matches = pace.match(/(\d{1,2}):(\d{2})/g);
  if (!matches || matches.length === 0) return null;

  const secs = matches.slice(0, 2).map(m => {
    const [min, s] = m.split(":").map(Number);
    return min * 60 + s;
  });
  // One value → symmetric ±5s band
  const fast = Math.min(...secs);
  const slow = Math.max(...secs);
  const lowSec  = secs.length > 1 ? slow : slow + 5;
  const highSec = secs.length > 1 ? fast : fast - 5;
  if (highSec <= 0) return null;

  return {
    low:  1000 / lowSec,   // slower bound (m/s)
    high: 1000 / highSec,  // faster bound (m/s)
  };
}

const INTENSITY: Record<WorkoutStep["kind"], string> = {
  warmup:   "warmup",
  run:      "active",
  recovery: "rest",
  cooldown: "cooldown",
};

const STEP_NAME: Record<WorkoutStep["kind"], string> = {
  warmup: "Aquecimento", run: "Forte", recovery: "Recuperacao", cooldown: "Desaquecimento",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stepMesg(step: WorkoutStep, index: number): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mesg: Record<string, any> = {
    messageIndex: index,
    wktStepName: STEP_NAME[step.kind] ?? "Passo",
    intensity: INTENSITY[step.kind] ?? "active",
  };

  if (step.distance_km != null && step.distance_km > 0) {
    mesg.durationType = "distance";
    mesg.durationDistance = Math.round(step.distance_km * 1000); // meters
  } else if (step.duration_min != null && step.duration_min > 0) {
    mesg.durationType = "time";
    mesg.durationTime = Math.round(step.duration_min * 60); // seconds
  } else {
    mesg.durationType = "open";
  }

  const speed = paceToSpeedRange(step.pace);
  if (speed) {
    mesg.targetType = "speed";
    mesg.targetValue = 0;
    mesg.customTargetSpeedLow = speed.low;
    mesg.customTargetSpeedHigh = speed.high;
  } else {
    mesg.targetType = "open";
  }

  return mesg;
}

/**
 * Encode the workout. Returns the .fit file bytes.
 * Throws on malformed structure.
 */
export function buildWorkoutFit(label: string, structure: StructuredWorkout): Uint8Array {
  // Flatten blocks into FIT steps; repeats become repeatUntilStepsCmplt steps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stepMesgs: Array<Record<string, any>> = [];

  for (const block of structure.blocks) {
    if (isRepeatBlock(block)) {
      if (!Array.isArray(block.steps) || block.steps.length === 0) continue;
      const firstIdx = stepMesgs.length;
      for (const s of block.steps) stepMesgs.push(stepMesg(s, stepMesgs.length));
      // Repeat controller step: jump back to firstIdx, (repeat) times total
      stepMesgs.push({
        messageIndex: stepMesgs.length,
        durationType: "repeatUntilStepsCmplt",
        durationValue: firstIdx,
        targetType: "open",
        targetValue: Math.max(2, Math.round(block.repeat)),
      });
    } else {
      stepMesgs.push(stepMesg(block, stepMesgs.length));
    }
  }

  if (stepMesgs.length === 0) throw new Error("Treino sem passos");

  const encoder = new Encoder();
  // The SDK's Mesg type is a strict union; our message objects use dynamic
  // keys, so funnel them through one loosely-typed emit helper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emit = (num: number, mesg: Record<string, any>) => encoder.onMesg(num as never, mesg as never);

  emit(Profile.MesgNum.FILE_ID, {
    type: "workout",
    manufacturer: "development",
    product: 0,
    timeCreated: new Date(),
    serialNumber: 1,
  });

  emit(Profile.MesgNum.WORKOUT, {
    wktName: label.slice(0, 30),
    sport: "running",
    numValidSteps: stepMesgs.length,
  });

  for (const mesg of stepMesgs) {
    emit(Profile.MesgNum.WORKOUT_STEP, mesg);
  }

  return encoder.close();
}
