import { describe, it, expect, afterEach, vi } from "vitest";
import {
  localDateStr, localMondayStr, localNextMondayStr, localPreviousMondayStr,
} from "@/lib/week";

/**
 * The bug: the browser computed the week from local calendar fields and then
 * serialised it with `toISOString()`, which converts to UTC.
 *
 * On Sunday 2026-08-02 at 22:31 in Brazil that produced "2026-07-28" — a
 * Tuesday. The server, which computes the week correctly, rejected it as
 * "Semana inválida", and the plan looked as though it had never been generated.
 *
 * It was not a Sunday problem: after 21:00 BRT the UTC date is already
 * tomorrow, so this broke every single night.
 */
afterEach(() => vi.useRealTimers());

/** Pretend "now" is a given instant. TZ is fixed to São Paulo by the config. */
function at(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe("the Sunday night bug", () => {
  it("returns the right Monday at 22:31 on a Sunday", () => {
    at("2026-08-03T01:31:00Z");           // Sunday 2026-08-02, 22:31 BRT
    expect(localMondayStr()).toBe("2026-07-27");
  });

  it("is not fooled by any hour of that Sunday", () => {
    for (const hour of ["09:00", "18:00", "21:00", "22:31", "23:59"]) {
      const [h, m] = hour.split(":").map(Number);
      const utc = new Date(Date.UTC(2026, 7, 2, h + 3, m));   // BRT → UTC
      vi.useFakeTimers();
      vi.setSystemTime(utc);
      expect(localMondayStr(), `domingo ${hour} BRT`).toBe("2026-07-27");
      vi.useRealTimers();
    }
  });

  it("always returns an actual Monday, every hour of every day of a week", () => {
    // 2026-07-27 is a Monday; walk the whole week, hour by hour.
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const utc = new Date(Date.UTC(2026, 6, 27 + day, hour, 30));
        vi.useFakeTimers();
        vi.setSystemTime(utc);
        const monday = localMondayStr();
        const weekday = new Date(`${monday}T12:00:00Z`).getUTCDay();
        expect(weekday, `${utc.toISOString()} → ${monday}`).toBe(1);
        vi.useRealTimers();
      }
    }
  });

  it("keeps the three weeks the server accepts consistent", () => {
    at("2026-08-03T01:31:00Z");           // Sunday 22:31 BRT
    expect(localPreviousMondayStr()).toBe("2026-07-20");
    expect(localMondayStr()).toBe("2026-07-27");
    expect(localNextMondayStr()).toBe("2026-08-03");
  });
});

describe("localDateStr", () => {
  it("gives the athlete's calendar day, not the UTC one", () => {
    at("2026-08-03T01:31:00Z");           // still 2 August in Brazil
    expect(localDateStr()).toBe("2026-08-02");
  });

  it("rolls over at local midnight, not at 21:00", () => {
    at("2026-08-03T02:59:00Z");           // 23:59 BRT on the 2nd
    expect(localDateStr()).toBe("2026-08-02");
    at("2026-08-03T03:00:00Z");           // 00:00 BRT on the 3rd
    expect(localDateStr()).toBe("2026-08-03");
  });

  it("pads months and days", () => {
    at("2026-01-05T15:00:00Z");
    expect(localDateStr()).toBe("2026-01-05");
  });

  it("never returns a date shifted from the one asked for", () => {
    // Every hour of a day must serialise to that same calendar day.
    for (let hour = 0; hour < 24; hour++) {
      const d = new Date(2026, 7, 2, hour, 30);   // local constructor
      expect(localDateStr(d), `${hour}h`).toBe("2026-08-02");
    }
  });
});

describe("week navigation", () => {
  it("moves exactly seven days in each direction", () => {
    at("2026-08-05T15:00:00Z");           // a Wednesday
    const monday = localMondayStr();
    const diff = (a: string, b: string) =>
      (new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86400_000;

    expect(diff(localNextMondayStr(), monday)).toBe(7);
    expect(diff(monday, localPreviousMondayStr())).toBe(7);
  });

  it("treats Monday as the start of its own week", () => {
    at("2026-08-03T15:00:00Z");           // Monday 12:00 BRT
    expect(localMondayStr()).toBe("2026-08-03");
  });

  it("puts Sunday in the week that is ending", () => {
    at("2026-08-09T15:00:00Z");           // Sunday
    expect(localMondayStr()).toBe("2026-08-03");
  });
});
