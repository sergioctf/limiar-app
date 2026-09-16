import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  athleteDateStr, athleteMondayStr, athleteDaysAgoStr, toAthleteTime,
  localMondayStr,
} from "@/lib/week";
import { formatWorkoutNotification } from "@/lib/plan-notify";
import { applyPlanEdits } from "@/lib/plan-edit";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

/**
 * One week, one timezone, everywhere.
 *
 * Three bugs met on the same evening: the dashboard's server component read the
 * machine's clock (UTC on Vercel), its week ran Sunday to Saturday while the
 * rest of the app ran Monday to Sunday, and a moved lifting session left a day
 * typed as rest. At 22:58 on a Saturday the top of the page reported an empty
 * week to someone who had trained five times.
 */

describe("athlete calendar — the same answer on server and client", () => {
  it("is still Saturday at 22:58 in São Paulo", () => {
    // 2026-08-08 01:58 UTC = 2026-08-07 22:58 in Brazil.
    const instant = new Date("2026-08-08T01:58:00Z");
    expect(athleteDateStr(instant)).toBe("2026-08-07");
  });

  it("rolls over at midnight in São Paulo, not in UTC", () => {
    expect(athleteDateStr(new Date("2026-08-08T02:59:59Z"))).toBe("2026-08-07");
    expect(athleteDateStr(new Date("2026-08-08T03:00:00Z"))).toBe("2026-08-08");
  });

  it("does not depend on where the code runs", () => {
    // Same instant, expressed two ways — the answer must not move.
    const a = new Date("2026-08-08T01:58:00Z");
    const b = new Date(a.getTime());
    expect(athleteDateStr(a)).toBe(athleteDateStr(b));
    expect(athleteMondayStr(a)).toBe(athleteMondayStr(b));
  });

  it("shifts the instant rather than reinterpreting its fields", () => {
    const d = new Date("2026-08-08T01:58:00Z");
    expect(toAthleteTime(d).getTime()).toBe(d.getTime() - 3 * 3600_000);
  });
});

describe("the week runs Monday to Sunday", () => {
  const monday = "2026-08-03";

  it.each([
    ["segunda", "2026-08-03T15:00:00Z"],
    ["quarta",  "2026-08-05T15:00:00Z"],
    ["sábado",  "2026-08-08T15:00:00Z"],
    ["domingo", "2026-08-09T15:00:00Z"],
  ])("%s pertence à semana que começa na segunda", (_dia, instant) => {
    expect(athleteMondayStr(new Date(instant))).toBe(monday);
  });

  it("Sunday closes the week — it does not open a new one", () => {
    // The bug: `- getDay()` puts Sunday at the start, so Sunday evening wiped
    // the week's totals while every other card still counted them.
    const sunday = new Date("2026-08-09T15:00:00Z");
    expect(athleteMondayStr(sunday)).toBe(monday);
    expect(athleteMondayStr(sunday)).not.toBe("2026-08-09");
  });

  it("the next Monday does start a new week", () => {
    expect(athleteMondayStr(new Date("2026-08-10T15:00:00Z"))).toBe("2026-08-10");
  });

  it("Saturday at 22:58 is still the same week", () => {
    expect(athleteMondayStr(new Date("2026-08-08T01:58:00Z"))).toBe(monday);
  });

  it("agrees with the browser helper for someone actually in Brazil", () => {
    // Vitest pins TZ=America/Sao_Paulo, so the two must produce the same Monday.
    const d = new Date("2026-08-08T15:00:00Z");
    expect(athleteMondayStr(d)).toBe(localMondayStr(d));
  });

  it("counts back whole days", () => {
    const d = new Date("2026-08-07T15:00:00Z");
    expect(athleteDaysAgoStr(0, d)).toBe("2026-08-07");
    expect(athleteDaysAgoStr(7, d)).toBe("2026-07-31");
    expect(athleteDaysAgoStr(30, d)).toBe("2026-07-08");
  });
});

describe("no file computes a Sunday-based week", () => {
  /** Every .ts/.tsx under src. */
  function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) sources(full, out);
      else if (/\.tsx?$/.test(name)) out.push(full);
    }
    return out;
  }

  it("nobody subtracts a bare getDay() to find the start of the week", () => {
    // `- getDay()` lands on Sunday; `- ((getDay() + 6) % 7)` lands on Monday.
    // This is the exact line that shipped in two files at once.
    const offenders = sources("src").filter(f => {
      const text = readFileSync(f, "utf8");
      return /setDate\(\s*\w+\.getDate\(\)\s*-\s*\w+\.getDay\(\)\s*\)/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});

// ─── Notifications ───────────────────────────────────────────────────────────

const restDay: WeeklyPlanDay = {
  day: "Sat", dayPt: "Sábado", type: "rest", label: "Descanso",
  description: "Descanso completo.",
};

const session = (n: number) => ({
  exercises: Array.from({ length: n }, (_, i) => ({ exerciseId: `e${i}`, name: `Ex ${i}` })),
  estimatedMinutes: 45,
} as WeeklyPlanDay["strength"]);

describe("notifications describe what is actually scheduled", () => {
  it("does not call a day with a lifting session a rest day", () => {
    const n = formatWorkoutNotification({ ...restDay, strength: session(4) }, "Amanhã");
    expect(n.title).not.toContain("Descanso");
    expect(n.title).toContain("Musculação");
    expect(n.body).toContain("4 exercícios");
  });

  it("still calls an empty day a rest day", () => {
    const n = formatWorkoutNotification(restDay, "Amanhã");
    expect(n.title).toBe("Amanhã: Descanso");
  });

  it("mentions the lifting that shares a running day", () => {
    const run: WeeklyPlanDay = {
      day: "Mon", dayPt: "Segunda", type: "easy", sport: "corrida",
      label: "Rodagem leve", distance_km: 8, description: "Ritmo fácil.",
    };
    const n = formatWorkoutNotification({ ...run, strength: session(5) }, "Hoje");
    expect(n.title).toContain("Rodagem leve");
    expect(n.title).toContain("Musculação");
    expect(n.body).toContain("5 exercícios");
  });

  it("does not say 'Musculação + Musculação' on a lifting-only day", () => {
    const lift: WeeklyPlanDay = {
      day: "Tue", dayPt: "Terça", type: "strength", sport: "musculacao",
      label: "Musculação", duration_min: 45, description: "Pernas.",
    };
    const n = formatWorkoutNotification({ ...lift, strength: session(4) }, "Hoje");
    expect(n.title.match(/Musculação/g)?.length).toBe(1);
  });

  it("keeps the lifting note even when the description is long", () => {
    const wordy: WeeklyPlanDay = {
      day: "Wed", dayPt: "Quarta", type: "intervals", sport: "corrida",
      label: "Tiro", distance_km: 8, description: "x".repeat(400),
    };
    const n = formatWorkoutNotification({ ...wordy, strength: session(3) }, "Hoje");
    expect(n.body).toContain("3 exercícios");
    expect(n.body.length).toBeLessThanOrEqual(120);
  });
});

// ─── Moving a lifting session ────────────────────────────────────────────────

function planWith(days: WeeklyPlanDay[]): WeeklyPlanData {
  return { week_start: "2026-08-03", days, generated_at: new Date().toISOString() };
}

const DAYS: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PT = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

describe("moving musculação leaves both days coherent", () => {
  const base = () => planWith(DAYS.map((d, i) => (
    d === "Mon"
      ? { day: d, dayPt: PT[i], type: "strength", sport: "musculacao", label: "Musculação",
          duration_min: 45, description: "Pernas.", strength: session(4) }
      : { day: d, dayPt: PT[i], type: "rest", label: "Descanso", description: "Descanso completo." }
  )));

  it("makes the destination a real lifting day, not a rest day carrying one", () => {
    const { plan } = applyPlanEdits(base(), [
      { kind: "move_session", session: "musculacao", from: "Mon", to: "Sat" },
    ]);
    const sat = plan.days.find(d => d.day === "Sat")!;

    // The exact shape that told the athlete Saturday was off.
    expect(sat.strength?.exercises.length).toBe(4);
    expect(sat.type).toBe("strength");
    expect(sat.label).toBe("Musculação");
    expect(formatWorkoutNotification(sat, "Amanhã").title).not.toContain("Descanso");
  });

  it("leaves the origin a genuine rest day", () => {
    const { plan } = applyPlanEdits(base(), [
      { kind: "move_session", session: "musculacao", from: "Mon", to: "Sat" },
    ]);
    const mon = plan.days.find(d => d.day === "Mon")!;
    expect(mon.strength).toBeUndefined();
    expect(mon.type).toBe("rest");
  });

  it("keeps a run's identity when the lifting joins it", () => {
    const withRun = planWith(base().days.map(d =>
      d.day === "Sat"
        ? { ...d, type: "long_run", sport: "corrida", label: "Longão", distance_km: 14,
            description: "Ritmo fácil." }
        : d,
    ));
    const { plan } = applyPlanEdits(withRun, [
      { kind: "move_session", session: "musculacao", from: "Mon", to: "Sat" },
    ]);
    const sat = plan.days.find(d => d.day === "Sat")!;

    expect(sat.type).toBe("long_run");
    expect(sat.label).toBe("Longão");
    expect(sat.distance_km).toBe(14);
    expect(sat.strength?.exercises.length).toBe(4);
  });

  it("never produces a day whose type and content disagree", () => {
    for (const to of DAYS.filter(d => d !== "Mon")) {
      const { plan } = applyPlanEdits(base(), [
        { kind: "move_session", session: "musculacao", from: "Mon", to },
      ]);
      for (const d of plan.days) {
        if (d.type === "rest") expect(d.strength ?? null).toBeNull();
      }
    }
  });
});
