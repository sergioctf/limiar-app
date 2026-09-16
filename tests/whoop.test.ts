import { describe, it, expect } from "vitest";
import {
  tokenNeedsRefresh, expiryFrom, nightOf, toWellnessRow, isEmptyRow,
  whoopAuthorizeUrl, whoopRedirectUri, WHOOP_SCOPES,
  type WhoopRecovery, type WhoopSleep,
} from "@/lib/whoop";

const scored = (over: Partial<WhoopRecovery["score"]> = {}): WhoopRecovery => ({
  score_state: "SCORED",
  score: { recovery_score: 67, hrv_rmssd_milli: 48.2, resting_heart_rate: 52, ...over },
});

const night = (over: Partial<WhoopSleep> = {}): WhoopSleep => ({
  start: "2026-08-09T02:40:00.000Z",
  end:   "2026-08-09T10:10:00.000Z",
  nap: false,
  score_state: "SCORED",
  score: {
    sleep_performance_percentage: 84,
    stage_summary: { total_in_bed_time_milli: 27_000_000, total_awake_time_milli: 1_800_000 },
  },
  ...over,
});

describe("token expiry", () => {
  const now = new Date("2026-08-10T12:00:00Z");

  it("refreshes a token that already expired", () => {
    expect(tokenNeedsRefresh("2026-08-10T11:00:00Z", now)).toBe(true);
  });

  it("refreshes one that is about to expire", () => {
    // A token with 20 seconds left passes a naive check and then dies
    // mid-request, which is the failure nobody can reproduce.
    expect(tokenNeedsRefresh("2026-08-10T12:00:20Z", now)).toBe(true);
  });

  it("keeps a token with real life left", () => {
    expect(tokenNeedsRefresh("2026-08-10T12:30:00Z", now)).toBe(false);
  });

  it("treats an unreadable expiry as expired", () => {
    expect(tokenNeedsRefresh("nunca", now)).toBe(true);
  });

  it("converts Whoop's relative expiry to an absolute one", () => {
    expect(expiryFrom(3600, now)).toBe("2026-08-10T13:00:00.000Z");
  });

  it("falls back to an hour when the value is nonsense", () => {
    expect(expiryFrom(0, now)).toBe("2026-08-10T13:00:00.000Z");
    expect(expiryFrom(NaN, now)).toBe("2026-08-10T13:00:00.000Z");
  });
});

describe("authorize URL", () => {
  it("asks for offline, or the connection dies in an hour", () => {
    // Without `offline` Whoop returns no refresh token at all.
    expect(WHOOP_SCOPES).toContain("offline");
    expect(whoopAuthorizeUrl("abcdefgh")).toContain("offline");
  });

  it("carries the state Whoop requires", () => {
    const url = new URL(whoopAuthorizeUrl("abcdefgh"));
    expect(url.searchParams.get("state")).toBe("abcdefgh");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("uses the same redirect URI the token exchange will send", () => {
    const url = new URL(whoopAuthorizeUrl("abcdefgh"));
    expect(url.searchParams.get("redirect_uri")).toBe(whoopRedirectUri());
    expect(whoopRedirectUri()).toMatch(/\/api\/whoop\/callback$/);
  });

  it("never doubles the slash before the callback path", () => {
    expect(whoopRedirectUri()).not.toContain("//api/");
  });
});

describe("nightOf", () => {
  it("files a night under the day the athlete wakes up", () => {
    // Asleep 23:40 Saturday São Paulo, awake 07:10 Sunday. That is Sunday's
    // sleep: it is what Sunday's session is run on.
    expect(nightOf(night())).toBe("2026-08-09");
  });

  it("survives a record with no end time", () => {
    expect(nightOf({ start: "2026-08-09T10:00:00.000Z" })).toBe("2026-08-09");
    expect(nightOf({})).toBeNull();
    expect(nightOf({ end: "não é data" })).toBeNull();
  });
});

describe("toWellnessRow", () => {
  it("maps a scored night and recovery", () => {
    const row = toWellnessRow("2026-08-09", scored(), [night()]);

    expect(row.date).toBe("2026-08-09");
    // 27,000,000 ms in bed − 1,800,000 ms awake = 25,200,000 ms = 7 h.
    expect(row.sleep_seconds).toBe(25_200);
    expect(row.sleep_score).toBe(84);
    expect(row.hrv_ms).toBe(48.2);
    expect(row.resting_hr).toBe(52);
    expect(row.recovery_score).toBe(67);
  });

  it("reports time asleep, not time in bed", () => {
    const restless = night({
      score: {
        sleep_performance_percentage: 60,
        stage_summary: { total_in_bed_time_milli: 28_800_000, total_awake_time_milli: 7_200_000 },
      },
    });
    // Eight hours in bed, two of them awake — six hours of sleep.
    expect(toWellnessRow("2026-08-09", null, [restless]).sleep_seconds).toBe(21_600);
  });

  it("ignores naps", () => {
    const nap = night({ nap: true, score: { stage_summary: { total_in_bed_time_milli: 1_500_000 } } });
    // A 25-minute nap must not overwrite the night — that would make the sleep
    // score worse the better the athlete rested.
    const row = toWellnessRow("2026-08-09", null, [nap, night()]);
    expect(row.sleep_seconds).toBe(25_200);
  });

  it("returns nothing for a nap-only day rather than a fake short night", () => {
    const nap = night({ nap: true });
    expect(toWellnessRow("2026-08-09", null, [nap]).sleep_seconds).toBeNull();
  });

  it("takes the longest night when Whoop split the sleep", () => {
    const short = night({ score: { stage_summary: { total_in_bed_time_milli: 3_600_000, total_awake_time_milli: 0 } } });
    expect(toWellnessRow("2026-08-09", null, [short, night()]).sleep_seconds).toBe(25_200);
  });

  it("ignores records Whoop has not scored yet", () => {
    // Whoop publishes a record before scoring it; the fields are present and
    // meaningless.
    const pending = { ...scored(), score_state: "PENDING_SCORE" };
    const row = toWellnessRow("2026-08-09", pending, [night({ score_state: "PENDING_SCORE" })]);

    expect(row.recovery_score).toBeNull();
    expect(row.hrv_ms).toBeNull();
    expect(row.sleep_seconds).toBeNull();
  });

  it("rejects values outside human range", () => {
    const absurd = toWellnessRow("2026-08-09", scored({
      recovery_score: 140, hrv_rmssd_milli: 900, resting_heart_rate: 5,
    }), []);
    expect(absurd.recovery_score).toBeNull();
    expect(absurd.hrv_ms).toBeNull();
    expect(absurd.resting_hr).toBeNull();
  });

  it("copes with a day that has recovery but no sleep, and vice versa", () => {
    const soRecovery = toWellnessRow("2026-08-09", scored(), []);
    expect(soRecovery.recovery_score).toBe(67);
    expect(soRecovery.sleep_seconds).toBeNull();

    const soSleep = toWellnessRow("2026-08-09", null, [night()]);
    expect(soSleep.sleep_seconds).toBe(25_200);
    expect(soSleep.recovery_score).toBeNull();
  });

  it("never invents a row out of nothing", () => {
    const vazio = toWellnessRow("2026-08-09", null, []);
    expect(isEmptyRow(vazio)).toBe(true);
    expect(isEmptyRow(toWellnessRow("2026-08-09", scored(), []))).toBe(false);
  });
});
