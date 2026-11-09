/**
 * Which day of the week keeps needing to bend.
 *
 * "Você costuma precisar encurtar o treino de quarta. Quer deixar esse dia mais
 * leve no planejamento?" — the agenda as something the coach learns, not only
 * a reason given after the fact.
 *
 * A weekday is flagged when its hard session (quality or long run) was
 * shortened, adapted for time or tiredness, swapped for recovery, or not run in
 * at least three of its recent occurrences and at least half of them. One bad
 * Wednesday is a bad day; three are a pattern.
 */
import { sessionKindOf } from "@/lib/session-adapt";
import type { WeekAdherence } from "@/lib/plan-adherence";
import type { WeeklyPlanDay } from "@/types";

type DayKey = WeeklyPlanDay["day"];

export interface DayTrouble {
  day: DayKey;
  role: "quality" | "long";
  troubled: number;
  total: number;
  /** What happened, in the athlete's words, for the evidence line. */
  kinds: Array<"encurtado" | "adaptado" | "trocado" | "não feito">;
}

const QUALITY = new Set(["hills", "repetitions", "intervals", "intervals_dense", "threshold", "fartlek", "progression"]);
const MIN_TROUBLED = 3;
const MIN_SHARE = 0.5;

function roleOf(day: WeeklyPlanDay): "quality" | "long" | null {
  const original = day.adaptation?.original ?? day.swap?.original ?? day;
  const kind = sessionKindOf(original);
  if (kind === "long_run" || original.type === "long_run") return "long";
  return kind && QUALITY.has(kind) ? "quality" : null;
}

export function troubledDays(weeks: WeekAdherence[], today: string): DayTrouble[] {
  const byDay = new Map<string, DayTrouble>();
  for (const week of weeks) {
    for (const d of week.days) {
      if (d.date >= today) continue;                       // only days already lived
      const role = roleOf(d.planned);
      if (!role || d.status === "unresolved") continue;
      const key = `${d.day}:${role}`;
      const entry = byDay.get(key) ?? { day: d.day, role, troubled: 0, total: 0, kinds: [] };
      entry.total++;

      const reason = d.planned.adaptation?.when === "before" ? d.planned.adaptation.reason : null;
      const kind: DayTrouble["kinds"][number] | null =
        d.planned.swap ? "trocado"
          : reason === "time" || reason === "fatigue" ? "encurtado"
            : d.status === "adapted" ? "adaptado"
              : d.status === "partial" ? "encurtado"
                : d.status === "missed" ? "não feito"
                  : null;
      if (kind) { entry.troubled++; entry.kinds.push(kind); }
      byDay.set(key, entry);
    }
  }
  return Array.from(byDay.values())
    .filter(t => t.troubled >= MIN_TROUBLED && t.troubled / t.total >= MIN_SHARE)
    .sort((a, b) => b.troubled / b.total - a.troubled / a.total || b.troubled - a.troubled);
}
