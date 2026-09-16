import { describe, it, expect } from "vitest";
import {
  normalizeNotificationPrefs, wantsNotification,
  NOTIFICATION_KINDS, NOTIFICATION_LABELS, DEFAULT_NOTIFICATION_PREFS,
} from "@/lib/notification-prefs";

describe("normalizeNotificationPrefs", () => {
  it("turns everything on when nothing is stored", () => {
    // Push is already opt-in at the browser level: someone who granted
    // permission asked to hear from the app.
    expect(normalizeNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(normalizeNotificationPrefs(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(normalizeNotificationPrefs({})).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("respects an explicit off", () => {
    const p = normalizeNotificationPrefs({ friendWorkouts: false });
    expect(p.friendWorkouts).toBe(false);
    expect(p.dailyWorkout).toBe(true);
  });

  it("only an explicit false turns something off", () => {
    // A missing or malformed value must never be read as "no".
    for (const value of [undefined, null, 0, "", "false", NaN]) {
      expect(normalizeNotificationPrefs({ dailyWorkout: value }).dailyWorkout).toBe(true);
    }
  });

  it("ignores keys it does not know", () => {
    const p = normalizeNotificationPrefs({ inventado: false, friendWorkouts: false });
    expect(p).toEqual({ ...DEFAULT_NOTIFICATION_PREFS, friendWorkouts: false });
    expect("inventado" in p).toBe(false);
  });

  it("survives junk", () => {
    expect(normalizeNotificationPrefs("sim")).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(normalizeNotificationPrefs([1, 2])).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(normalizeNotificationPrefs(42)).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("always answers for every kind", () => {
    const p = normalizeNotificationPrefs({ dailyWorkout: false });
    for (const kind of NOTIFICATION_KINDS) {
      expect(typeof p[kind]).toBe("boolean");
    }
  });
});

describe("wantsNotification", () => {
  it("answers per kind", () => {
    const stored = { friendWorkouts: false };
    expect(wantsNotification(stored, "friendWorkouts")).toBe(false);
    expect(wantsNotification(stored, "friendRequests")).toBe(true);
    expect(wantsNotification(stored, "dailyWorkout")).toBe(true);
  });

  it("says yes for a profile that predates the setting", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(wantsNotification(null, kind)).toBe(true);
    }
  });
});

describe("labels", () => {
  it("names and explains every kind", () => {
    for (const kind of NOTIFICATION_KINDS) {
      const l = NOTIFICATION_LABELS[kind];
      expect(l.label.length).toBeGreaterThan(3);
      expect(l.detail.length).toBeGreaterThan(20);
      expect(l.detail).toMatch(/\.$/);
    }
  });

  it("tells the athlete where the per-friend control lives", () => {
    // Two switches for friend workouts is confusing unless the card says so.
    expect(NOTIFICATION_LABELS.friendWorkouts.detail).toMatch(/perfil/i);
  });
});
