/**
 * The app's semantic colour contract.
 *
 * Twelve semantic colours were in use across the components — green, red,
 * yellow, orange, blue, purple, cyan, pink, teal, amber, indigo, emerald — in
 * 75 distinct Tailwind classes. When everything is coloured, colour stops
 * meaning anything: the athlete cannot tell "this needs your attention" from
 * "this is a heading" because both are tinted.
 *
 * Whoop, which is the reference here, is nearly monochrome. Greys carry the
 * layout, and colour appears only where it *is* the information — recovery
 * green, strain blue, and nothing else. That restraint is why a screen dense
 * with numbers still reads calmly.
 *
 * So the palette is four tones and no more:
 *
 *   · neutral — the default. Greys. Most of the app should be this.
 *   · brand   — the athlete's own action or the app's voice. One accent.
 *   · good    — a target met, a record, a session done.
 *   · warn    — something worth a look, not an emergency.
 *   · alert   — something that costs the athlete if ignored.
 *
 * Anything that wants a sixth colour is asking for emphasis it has not earned;
 * hierarchy should come from size, weight and position instead.
 */

export type Tone = "neutral" | "brand" | "good" | "warn" | "alert";

interface ToneClasses {
  /** Foreground for numbers and icons that carry the meaning. */
  text:   string;
  /** Tinted background for chips and inline callouts. */
  bg:     string;
  /** Border for a bounded region in this tone. */
  border: string;
  /** Solid fill, for bars and progress. */
  solid:  string;
}

export const TONE: Record<Tone, ToneClasses> = {
  neutral: {
    text:   "text-surface-300",
    bg:     "bg-surface-700/40",
    border: "border-surface-700",
    solid:  "bg-surface-500",
  },
  brand: {
    text:   "text-brand-400",
    bg:     "bg-brand-500/10",
    border: "border-brand-500/30",
    solid:  "bg-brand-500",
  },
  good: {
    text:   "text-emerald-400",
    bg:     "bg-emerald-500/10",
    border: "border-emerald-500/25",
    solid:  "bg-emerald-500",
  },
  warn: {
    text:   "text-amber-400",
    bg:     "bg-amber-500/10",
    border: "border-amber-500/25",
    solid:  "bg-amber-500",
  },
  alert: {
    text:   "text-red-400",
    bg:     "bg-red-500/10",
    border: "border-red-500/25",
    solid:  "bg-red-500",
  },
};

/**
 * Tone for a completion ratio — plan adherence, shoe life, goal progress.
 *
 * Deliberately forgiving in the middle: 80% of a training week is a week
 * trained, not a week failed, and colouring it amber teaches the athlete to
 * distrust the colour rather than to trust the number.
 */
export function toneForRatio(ratio: number | null | undefined): Tone {
  if (ratio == null || !Number.isFinite(ratio)) return "neutral";
  if (ratio >= 0.8) return "good";
  if (ratio >= 0.4) return "warn";
  return "alert";
}

/** Tone for training-stress balance: fresh, neutral, or dug in. */
export function toneForTsb(tsb: number | null | undefined): Tone {
  if (tsb == null || !Number.isFinite(tsb)) return "neutral";
  if (tsb > 5)   return "good";
  if (tsb > -20) return "neutral";
  return "alert";
}
