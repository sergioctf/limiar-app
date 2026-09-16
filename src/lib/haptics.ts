/**
 * A short buzz when something actually happened.
 *
 * Cards scale on press, so a tap *looks* acknowledged — but the acknowledgement
 * is of the touch, not of the outcome. Applying an advisor suggestion rewrites
 * the week; marking a session done changes the plan. Those deserve a signal the
 * thumb can feel, because the eye is often somewhere else by the time the
 * request returns.
 *
 * Deliberately restrained. Vibration on every tap is the phone equivalent of a
 * beeping microwave: after ten minutes the athlete stops noticing it, and it
 * was never carrying information in the first place. So this fires only on
 * completion, and never on navigation.
 *
 * `navigator.vibrate` is unsupported on iOS Safari and silently absent in some
 * embedded browsers, so every path here is best-effort by design: a device that
 * cannot buzz simply does not, and nothing else changes.
 */

type Pattern = "tap" | "success" | "warn";

/*
 * Durations in milliseconds. `success` is two short pulses rather than one long
 * one — a single long buzz reads as an error on most phones, which is the
 * opposite of what applying a suggestion should feel like.
 */
const PATTERNS: Record<Pattern, number | number[]> = {
  tap:     10,
  success: [12, 40, 12],
  warn:    [20, 60, 20],
};

export function haptic(pattern: Pattern = "tap"): void {
  if (typeof navigator === "undefined") return;
  // Some browsers expose the method and throw when the page is not visible.
  try {
    navigator.vibrate?.(PATTERNS[pattern]);
  } catch {
    /* A phone that will not buzz is not a problem worth reporting. */
  }
}
