import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { ensure, load, write } = vi.hoisted(() => ({ ensure: vi.fn(), load: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "athlete" } } }) } }),
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { onboarding_completed_at: null } }) }) }),
      update: write,
    }),
  }),
}));
vi.mock("@/lib/weekly-plan", () => ({ ensureWeeklyPlan: ensure, loadWeeklyPlan: load, mondayOf: () => "2026-11-09", nextMondayOf: () => "2026-11-16" }));

import { POST } from "@/app/api/onboarding/complete/route";

function submit(skip = false) {
  return POST(new NextRequest("https://limiar.test/api/onboarding/complete", {
    method: "POST", body: JSON.stringify({ skip }),
  }));
}

describe("first session", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T14:00:00Z"));
    write.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  });

  afterEach(() => vi.useRealTimers());

  it("keeps onboarding open if plan creation did not persist", async () => {
    ensure.mockResolvedValue({ plan: { days: [{ type: "easy" }] }, reportId: null });
    load.mockResolvedValue({ plan: null, reportId: null });
    expect((await submit()).status).toBe(422);
    expect(write).not.toHaveBeenCalled();
  });

  it("accepts a saved strength-only plan", async () => {
    load.mockResolvedValue({ plan: { days: [{ type: "strength", day: "Mon" }] }, reportId: "saved" });
    expect((await submit()).status).toBe(200);
    expect(write).toHaveBeenCalledWith({ onboarding_completed_at: expect.any(String) });
  });

  it("looks to next week if the current plan has no upcoming sessions", async () => {
    vi.setSystemTime(new Date("2026-11-15T16:00:00Z"));
    load.mockResolvedValue({ plan: { days: [{ type: "strength", day: "Mon" }] }, reportId: "saved" });
    const response = await submit();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ firstSession: { week: "2026-11-16", day: "Mon" } });
  });

  it("lets the athlete leave setup without silently generating a default week", async () => {
    expect((await submit(true)).status).toBe(200);
    expect(ensure).not.toHaveBeenCalled();
  });
});
