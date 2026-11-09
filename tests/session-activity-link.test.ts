import { describe, expect, it } from "vitest";
import { buildRecoveryToday } from "@/lib/recovery-today";
import { dayStatus } from "@/lib/day-status";
import { dayProgress } from "@/lib/day-progress";
import { weekMovement } from "@/lib/week-movement";
import { computeWeekAdherence } from "@/lib/plan-adherence";
import { linkedReference, type SessionActivityLink } from "@/lib/session-activity-link";
import type { WeeklyPlanDay } from "@/types";

const date = "2026-09-14";
const planned: WeeklyPlanDay = { day: "Mon", dayPt: "Segunda", type: "easy", label: "Rodagem", description: "", sport: "corrida", distance_km: 10 };
const runs = [
  { id: "short", date, distance_km: 4, duration_seconds: 1600 },
  { id: "long", date, distance_km: 10, duration_seconds: 3600 },
];
const chosen: SessionActivityLink = { session_date: date, sport: "corrida", session_type: "easy", run_id: "short", activity_id: null, planned };
const plan = { week_start: date, generated_at: date + "T12:00:00Z", days: [planned] };
const day = { date, planned, runs, activities: [] };

describe("explicit activity attribution", () => {
  it("keeps both actual activities without choosing the first or scoring a miss", () => {
    const status = dayStatus(day);
    expect(status.done.map(item => item.planned)).toEqual([false, false]);
    expect(status.sessions[0].unresolved).toBe(true);
    expect(dayProgress({ ...day, day: planned, today: "2026-09-15" }).state).toBe("unresolved");
    expect(computeWeekAdherence(date, plan, runs, [])?.score).toBeNull();
  });

  it("evaluates only the chosen run but preserves the athlete's actual volume", () => {
    const links = [chosen];
    expect(dayStatus({ ...day, links }).done.map(item => item.planned)).toEqual([true, false]);
    const week = computeWeekAdherence(date, plan, runs, [], links);
    expect(week?.days[0]).toMatchObject({ status: "partial", actualKm: 14, longestRunKm: 10 });
    expect(weekMovement({ weekStart: date, today: date, plan, runs, activities: [], links }).sessions).toBe(2);
    expect(linkedReference(chosen, { kind: "run", id: "short" })).toEqual(planned);
    expect(linkedReference(chosen, { kind: "run", id: "long" })).toBeNull();
  });

  it("keeps recovery neutral until the primary activity is linked", () => {
    const input = { date, rows: [], load: {}, checkin: null, plan, doneKm: 14, strengthDone: false };
    expect(buildRecoveryToday({ ...input, status: dayStatus(day) })).toMatchObject({
      sessionDone: false, sessionUnresolved: true, offer: null, short: "Vínculo a confirmar",
    });
    const resolved = buildRecoveryToday({ ...input, status: dayStatus({ ...day, links: [chosen] }) });
    expect(resolved.sessionDone).toBe(true);
    expect(resolved.advice.detail).toContain("4,0 km");
    expect(resolved.advice.detail).not.toContain("14,0 km");
  });

  it("asks again after the chosen record is deleted, and never reuses a different session type", () => {
    expect(dayStatus({ ...day, runs: runs.slice(1), links: [chosen] }).sessions[0].unresolved).toBe(true);
    const moved = dayStatus({ ...day, planned: { ...planned, type: "tempo" }, links: [chosen] });
    expect(moved.sessions[0].unresolved).toBe(true);
    expect(dayStatus({ ...day, runs: runs.slice(1) }).allDone).toBe(true);
  });
});
