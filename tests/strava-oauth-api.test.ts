import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { STRAVA_OAUTH_COOKIE } from "@/lib/strava-oauth";

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "a" } } }) } }),
  createAdminClient: () => ({ from: () => ({ upsert }) }),
}));

import { GET as connect } from "@/app/api/strava/connect/route";
import { GET as callback } from "@/app/api/strava/callback/route";

describe("Strava OAuth", () => {
  beforeEach(() => {
    upsert.mockReset().mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ athlete: { id: 25 }, access_token: "fixture", refresh_token: "fixture" }),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function begin() {
    const response = await connect(new NextRequest("https://limiar.test/api/strava/connect?from=onboarding"));
    const state = new URL(response.headers.get("location")!).searchParams.get("state");
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toContain(STRAVA_OAUTH_COOKIE);
    return { state, cookie };
  }

  it("rejects a callback that does not match the browser attempt before exchanging the code", async () => {
    const { cookie } = await begin();
    const response = await callback(new NextRequest("https://limiar.test/api/strava/callback?code=fake&state=bad", {
      headers: { cookie },
    }));
    expect(response.headers.get("location")).toBe("https://limiar.test/?strava_error=invalid_state");
    expect(fetch).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("only reports a connection after persistence and returns to onboarding", async () => {
    const { state, cookie } = await begin();
    const url = `https://limiar.test/api/strava/callback?code=fake&state=${state}`;
    upsert.mockResolvedValueOnce({ error: { message: "fixture write failed" } });
    const failed = await callback(new NextRequest(url, { headers: { cookie } }));
    expect(failed.headers.get("location")).toBe("https://limiar.test/?strava_error=connection_failed");
    const ok = await callback(new NextRequest(url, { headers: { cookie } }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "a", athlete_id: 25 }), { onConflict: "user_id" });
    expect(ok.headers.get("location")).toBe("https://limiar.test/?strava_connected=1");
    expect(ok.headers.get("set-cookie")).toContain("Expires=Thu, 01 Jan 1970");
  });
});
