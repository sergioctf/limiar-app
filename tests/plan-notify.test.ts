import { describe, it, expect } from "vitest";
import { toBrt, brtDateIn, brtDateStr, getMondayStr, formatWorkoutNotification } from "@/lib/plan-notify";
import { weeklyVolumesBefore } from "@/lib/weekly-plan";
import type { WeeklyPlanDay } from "@/types";

/**
 * The evening notification once announced the wrong day for every athlete: the
 * cron fires at 01:00 UTC, which is 22:00 the previous day in São Paulo, and
 * "tomorrow" was computed from the UTC clock. Everyone was told about the day
 * after the one they were actually going to train.
 *
 * These tests pin the timezone contract in place. Brazil has had no DST since
 * 2019, so BRT is a fixed UTC−3 all year and the arithmetic is exact.
 */
describe("BRT date helpers", () => {
  it("reads the São Paulo wall clock through getUTC accessors", () => {
    // 2026-08-04T01:30Z is still 2026-08-03, 22:30 in São Paulo.
    const brt = toBrt(new Date("2026-08-04T01:30:00Z"));
    expect(brt.getUTCFullYear()).toBe(2026);
    expect(brt.getUTCMonth() + 1).toBe(8);
    expect(brt.getUTCDate()).toBe(3);
    expect(brt.getUTCHours()).toBe(22);
  });

  it("gives the athlete's calendar date, not the server's", () => {
    expect(brtDateStr(new Date("2026-08-04T01:30:00Z"))).toBe("2026-08-03");
    expect(brtDateStr(new Date("2026-08-04T03:30:00Z"))).toBe("2026-08-04");
  });

  it("crosses midnight BRT at 03:00 UTC exactly", () => {
    expect(brtDateStr(new Date("2026-08-04T02:59:59Z"))).toBe("2026-08-03");
    expect(brtDateStr(new Date("2026-08-04T03:00:00Z"))).toBe("2026-08-04");
  });

  it("advances exactly one day for the evening 'tomorrow' notification", () => {
    // The cron runs at 01:00 UTC — 22:00 the previous evening in Brazil.
    for (let day = 1; day <= 7; day++) {
      const cronFire = new Date(`2026-06-0${day}T01:00:00Z`);
      const today    = brtDateStr(cronFire);
      const tomorrow = brtDateStr(brtDateIn(1, cronFire));
      const diff = (new Date(`${tomorrow}T12:00:00Z`).getTime()
                  - new Date(`${today}T12:00:00Z`).getTime()) / 86400_000;
      expect(diff, `cron at ${cronFire.toISOString()}`).toBe(1);
    }
  });

  it("names the correct weekday for the evening push, all seven days", () => {
    // 2026-06-01 is a Monday. At 01:00 UTC on the 2nd it is Monday 22:00 in
    // Brazil, so "tomorrow" must be Tuesday the 2nd.
    const expected = [
      ["2026-06-02T01:00:00Z", "2026-06-01", "2026-06-02"],
      ["2026-06-03T01:00:00Z", "2026-06-02", "2026-06-03"],
      ["2026-06-04T01:00:00Z", "2026-06-03", "2026-06-04"],
      ["2026-06-05T01:00:00Z", "2026-06-04", "2026-06-05"],
      ["2026-06-06T01:00:00Z", "2026-06-05", "2026-06-06"],
      ["2026-06-07T01:00:00Z", "2026-06-06", "2026-06-07"],
      ["2026-06-08T01:00:00Z", "2026-06-07", "2026-06-08"],
    ] as const;

    for (const [fire, today, tomorrow] of expected) {
      const at = new Date(fire);
      expect(brtDateStr(at), `today at ${fire}`).toBe(today);
      expect(brtDateStr(brtDateIn(1, at)), `tomorrow at ${fire}`).toBe(tomorrow);
    }
  });

  it("puts Sunday in the week that just ended, not the one starting", () => {
    // 2026-08-09 is a Sunday; its Monday is the 3rd.
    expect(getMondayStr(toBrt(new Date("2026-08-09T15:00:00Z")))).toBe("2026-08-03");
    // 2026-08-10 is a Monday; it is its own Monday.
    expect(getMondayStr(toBrt(new Date("2026-08-10T15:00:00Z")))).toBe("2026-08-10");
  });

  it("returns a Monday for every day of the week", () => {
    for (let d = 3; d <= 9; d++) {
      const monday = getMondayStr(toBrt(new Date(`2026-08-0${d}T15:00:00Z`)));
      expect(monday).toBe("2026-08-03");
    }
  });

  it("moves to the previous Monday late on a Sunday night in Brazil", () => {
    // 2026-08-10T01:00Z = Sunday 09 Aug, 22:00 BRT — still the old week.
    expect(getMondayStr(toBrt(new Date("2026-08-10T01:00:00Z")))).toBe("2026-08-03");
  });
});

describe("formatWorkoutNotification", () => {
  const easy: WeeklyPlanDay = {
    day: "Mon", dayPt: "Segunda", type: "easy", label: "Rodagem leve",
    distance_km: 8, pace: "5:57–6:54/km", description: "Rodagem tranquila de 8 km.",
  };

  it("puts the session in the title, where a notification is readable", () => {
    const n = formatWorkoutNotification(easy, "Amanhã");
    expect(n.title).toContain("Amanhã");
    expect(n.title).toContain("Rodagem leve");
    expect(n.title).toContain("8km");
  });

  it("says it plainly on a rest day", () => {
    const rest: WeeklyPlanDay = { ...easy, type: "rest", label: "Descanso", distance_km: undefined };
    const n = formatWorkoutNotification(rest, "Hoje");
    expect(n.title).toBe("Hoje: Descanso");
  });

  it("keeps the body short enough for a lock screen", () => {
    const wordy: WeeklyPlanDay = { ...easy, description: "x".repeat(500) };
    expect(formatWorkoutNotification(wordy, "Hoje").body.length).toBeLessThanOrEqual(120);
  });

  it("tags per weekday so a new push replaces the old one", () => {
    expect(formatWorkoutNotification(easy, "Hoje").tag)
      .toBe(formatWorkoutNotification(easy, "Amanhã").tag);
    expect(formatWorkoutNotification({ ...easy, day: "Tue" }, "Hoje").tag)
      .not.toBe(formatWorkoutNotification(easy, "Hoje").tag);
  });
});

/**
 * A week still running is not evidence about the athlete.
 *
 * Generating next week's plan on a Tuesday counted the current week — two days
 * old — as if it had finished. Four kilometres on Tuesday sat in the average
 * next to three complete weeks and pulled every prescribed distance down. It
 * hit every user, every time they planned before Sunday, and got worse the
 * earlier in the week they did it.
 */
describe("weeklyVolumesBefore — semanas incompletas", () => {
  const runs = [
    { date: "2026-08-04", distance_km: 4 },   // terça da semana corrente
    { date: "2026-07-30", distance_km: 5 },
    { date: "2026-07-28", distance_km: 6 },
    { date: "2026-07-24", distance_km: 6 },
    { date: "2026-07-15", distance_km: 7 },
  ] as never[];

  it("ignora a semana em andamento", () => {
    const v = weeklyVolumesBefore(runs, "2026-08-10", "2026-08-04");
    expect(v).not.toContain(4);
    expect(v[0]).toBe(11);        // 27/07: 5 + 6, a última semana completa
  });

  it("passa a contá-la quando ela fecha", () => {
    const v = weeklyVolumesBefore(runs, "2026-08-10", "2026-08-10");
    expect(v[0]).toBe(4);
  });

  it("não deixa o dia da geração mudar o histórico completo", () => {
    const tue = weeklyVolumesBefore(runs, "2026-08-10", "2026-08-04");
    const sun = weeklyVolumesBefore(runs, "2026-08-10", "2026-08-09");
    expect(tue).toEqual(sun);
  });
});
