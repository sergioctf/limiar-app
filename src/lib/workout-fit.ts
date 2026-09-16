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
import type { PrimarySport, SportKey } from "@/lib/sports";

/** FIT sport (and sub-sport) for each of our sports. */
const FIT_SPORT: Record<PrimarySport, { sport: string; subSport?: string }> = {
  corrida:    { sport: "running" },
  ciclismo:   { sport: "cycling" },
  natacao:    { sport: "swimming", subSport: "lapSwimming" },
  musculacao: { sport: "training", subSport: "strengthTraining" },
};

/**
 * FIT encodes custom heart-rate targets as bpm + 100: values 1–100 mean
 * "percent of max HR", 101–255 mean "absolute bpm". Sending raw bpm here would
 * silently be read as a percentage and produce nonsense zones on the watch.
 */
function toFitHeartRate(bpm: number): number {
  return Math.round(bpm) + 100;
}

/**
 * "4:25–4:35/km" | "1:45/100m" → speed range in m/s (null when unparsable).
 *
 * The reference distance matters: running paces are per kilometre, swimming
 * paces per 100 m. Reading a swim pace as if it were per km yields ~7 m/s,
 * three times the world record, and the watch would guide the set at a pace
 * nobody can hold.
 */
function paceToSpeedRange(pace?: string): { low: number; high: number } | null {
  if (!pace) return null;
  const matches = pace.match(/(\d{1,2}):(\d{2})/g);
  if (!matches || matches.length === 0) return null;

  // Reference distance in metres, taken from the label itself.
  const perMetres = /\/\s*(\d+)\s*m\b/i.exec(pace);
  const reference = perMetres ? Number(perMetres[1]) : 1000;
  if (!Number.isFinite(reference) || reference <= 0) return null;

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
    low:  reference / lowSec,   // slower bound (m/s)
    high: reference / highSec,  // faster bound (m/s)
  };
}

const INTENSITY: Record<WorkoutStep["kind"], string> = {
  warmup:   "warmup",
  run:      "active",
  recovery: "rest",
  cooldown: "cooldown",
};

const STEP_NAME: Record<WorkoutStep["kind"], string> = {
  warmup: "Aquec", run: "Forte", recovery: "Trote", cooldown: "Desaquec",
};

/**
 * A name that says what the step is: "Forte 400m", "Trote 2min".
 *
 * Every interval used to read "Forte", which tells the athlete nothing they did
 * not already know while the watch beeps at them. Garmin renders roughly
 * sixteen characters of a step name, so the size is the prescription and the
 * word is whatever fits around it.
 */
function stepName(step: WorkoutStep): string {
  const base = STEP_NAME[step.kind] ?? "Passo";

  const size = step.distance_km != null && step.distance_km > 0
    ? (step.distance_km < 1
        ? `${Math.round(step.distance_km * 1000)}m`
        : `${Number(step.distance_km.toFixed(2))}km`)
    : step.duration_min != null && step.duration_min > 0
      ? `${Number(step.duration_min.toFixed(1))}min`
      : "";

  return (size ? `${base} ${size}` : base).slice(0, 16);
}

/**
 * The coaching cue, which the exporter used to drop entirely.
 *
 * The cap is generous on purpose. Cutting at fifty characters looked tidy and
 * removed the half that carried the instruction — "Forte e uniforme — o último
 * tiro deve sair no mesmo ritmo do primeiro" became "Forte e uniforme", which
 * is the part the athlete could already guess.
 *
 * How much of it a device renders is the device's business; the file is not the
 * place to decide the athlete has read enough. The cap only exists so a runaway
 * string cannot bloat the file.
 */
const NOTE_MAX = 200;

function stepNotes(step: WorkoutStep): string | null {
  const note = step.note?.trim();
  if (!note) return null;
  if (note.length <= NOTE_MAX) return note;

  // Cut on a word boundary so the truncation reads as an abbreviation rather
  // than a bug.
  const cut = note.slice(0, NOTE_MAX);
  const space = cut.lastIndexOf(" ");
  return space > NOTE_MAX * 0.6 ? cut.slice(0, space) : cut;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stepMesg(step: WorkoutStep, index: number, sport: SportKey): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mesg: Record<string, any> = {
    messageIndex: index,
    wktStepName: stepName(step),
    intensity: INTENSITY[step.kind] ?? "active",
  };

  const notes = stepNotes(step);
  if (notes) mesg.notes = notes;

  // FIT stores these in the generic `durationValue` field; the named aliases
  // (durationDistance / durationTime) are decode-side sub-fields only, and
  // writing to them produces steps with no duration at all.
  //   duration_distance → scale 100  (raw = metres × 100)
  //   duration_time     → scale 1000 (raw = seconds × 1000)
  if (step.distance_km != null && step.distance_km > 0) {
    mesg.durationType  = "distance";
    mesg.durationValue = Math.round(step.distance_km * 1000 * 100);
  } else if (step.duration_min != null && step.duration_min > 0) {
    mesg.durationType  = "time";
    mesg.durationValue = Math.round(step.duration_min * 60 * 1000);
  } else {
    mesg.durationType = "open";
  }

  // Target choice is sport-specific:
  //  • running — pace is the honest metric, so speed target wins
  //  • cycling — outdoor speed depends on wind/gradient, so heart rate guides
  //  • swimming — heart rate is unreliable in water; use pace when we have it
  const speed = paceToSpeedRange(step.pace);
  const hr = step.hr;

  // Same story for targets: values go in customTargetValueLow/High.
  //   custom_target_speed_*      → scale 1000 (raw = m/s × 1000)
  //   custom_target_heart_rate_* → no scale, bpm + 100 (see toFitHeartRate)
  const useHeartRate = (sport === "ciclismo" && hr) || (!speed && hr);

  const hrTarget = () => ({
    type: "heartRate",
    low:  toFitHeartRate(hr!.min),
    high: toFitHeartRate(hr!.max),
  });
  const speedTarget = () => ({
    type: "speed",
    low:  Math.round(speed!.low  * 1000),
    high: Math.round(speed!.high * 1000),
  });

  if (useHeartRate && hr) {
    apply(mesg, hrTarget());
    // On the bike heart rate leads and speed follows: the athlete still wants
    // to see what they are doing, they just should not chase it into a headwind.
    if (speed) applySecondary(mesg, speedTarget());
  } else if (speed) {
    apply(mesg, speedTarget());
    /*
     * Pace leads, heart rate rides along.
     *
     * The engine computes both windows for every quality step and the exporter
     * used to pick one and discard the other — so a tiro prescribed at
     * "4:17–4:30/km, FC 165–175" reached the watch as pace only. Devices that
     * do not understand a secondary target ignore the fields; the ones that do
     * show both.
     */
    if (hr) applySecondary(mesg, hrTarget());
  } else {
    mesg.targetType = "open";
  }

  return mesg;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function apply(mesg: Record<string, any>, t: { type: string; low: number; high: number }): void {
  mesg.targetType  = t.type;
  mesg.targetValue = 0;               // 0 = custom range, not a numbered zone
  mesg.customTargetValueLow  = t.low;
  mesg.customTargetValueHigh = t.high;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySecondary(mesg: Record<string, any>, t: { type: string; low: number; high: number }): void {
  mesg.secondaryTargetType  = t.type;
  mesg.secondaryTargetValue = 0;
  mesg.secondaryCustomTargetValueLow  = t.low;
  mesg.secondaryCustomTargetValueHigh = t.high;
}

/**
 * Encode the workout. Returns the .fit file bytes.
 * Throws on malformed structure.
 */
export function buildWorkoutFit(
  label: string,
  structure: StructuredWorkout,
  sport: SportKey = "corrida",
): Uint8Array {
  // Flatten blocks into FIT steps; repeats become repeatUntilStepsCmplt steps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stepMesgs: Array<Record<string, any>> = [];

  for (const block of structure.blocks) {
    if (isRepeatBlock(block)) {
      if (!Array.isArray(block.steps) || block.steps.length === 0) continue;
      const firstIdx = stepMesgs.length;
      for (const s of block.steps) stepMesgs.push(stepMesg(s, stepMesgs.length, sport));

      /*
       * A repeat of one is not a repeat.
       *
       * The floor used to be `Math.max(2, …)`, which turned a block prescribed
       * once into two passes — the athlete running a session nobody wrote. The
       * steps are already emitted above; a single pass just needs no controller.
       */
      const times = Math.round(block.repeat);
      if (times > 1) {
        // Repeat controller: jump back to firstIdx, `times` passes in total.
        stepMesgs.push({
          messageIndex: stepMesgs.length,
          durationType: "repeatUntilStepsCmplt",
          durationValue: firstIdx,
          targetType: "open",
          targetValue: times,
        });
      }
    } else {
      stepMesgs.push(stepMesg(block, stepMesgs.length, sport));
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

  const fitSport = FIT_SPORT[sport as PrimarySport] ?? FIT_SPORT.corrida ?? FIT_SPORT.corrida;
  emit(Profile.MesgNum.WORKOUT, {
    wktName: label.slice(0, 30),
    sport: fitSport.sport,
    ...(fitSport.subSport ? { subSport: fitSport.subSport } : {}),
    numValidSteps: stepMesgs.length,
  });

  for (const mesg of stepMesgs) {
    emit(Profile.MesgNum.WORKOUT_STEP, mesg);
  }

  return encoder.close();
}
