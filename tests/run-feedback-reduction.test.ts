/**
 * A reduction is recorded only if the plan actually changed.
 *
 * The first version saved `reduce_requested` and then lightened the plan; a
 * failure in between left a record claiming lighter sessions that never
 * happened. Now the plan changes first, the answer is saved second, and a
 * failed save puts the week back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, chain, admin, adminChain, state } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["select", "eq", "is", "order", "gte", "lte", "limit", "in", "upsert", "single", "maybeSingle"]) chain[name] = vi.fn();
  const state = { updateError: null as unknown, updates: [] as unknown[] };
  const adminChain: Record<string, unknown> = {};
  const admin = { from: vi.fn(() => adminChain) };
  return { db: { auth: { getUser: vi.fn() }, from: vi.fn() }, chain, admin, adminChain, state };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: () => db, createAdminClient: () => admin }));

import { PUT } from "@/app/api/run-feedback/route";

const runId = "12345678-1234-1234-1234-123456789012";
const req = (body: unknown) => new NextRequest("http://localhost/api/run-feedback", { method: "PUT", body: JSON.stringify(body) });
const tooHeavyYes = { runId, status: "answered", effort: 5, context: "session_too_hard", reduce: true };

const day = (d: string, type: string, km?: number) => ({ day: d, dayPt: d, type, label: type, distance_km: km, description: "" });
const storedPlan = JSON.stringify({
  week_start: "2026-09-14", generated_at: "2026-09-13T03:00:00Z",
  days: [day("Mon", "intervals", 5), day("Tue", "easy", 6), day("Wed", "rest"), day("Thu", "easy", 6), day("Fri", "rest"), day("Sat", "long_run", 10), day("Sun", "rest")],
});

beforeEach(() => {
  vi.resetAllMocks();
  // Monday 14/09, 09:00 in São Paulo: Tuesday onwards is still ahead.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  for (const f of Object.values(chain)) f.mockReturnValue(chain);
  db.from.mockReturnValue(chain);
  db.auth.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
  chain.maybeSingle
    .mockResolvedValueOnce({ data: { id: runId, date: "2026-09-14" }, error: null })   // the run
    .mockResolvedValueOnce({ data: { planned: null, reduce_requested: null }, error: null }); // previous answer

  state.updateError = null;
  state.updates = [];
  admin.from.mockReturnValue(adminChain);
  adminChain.select = vi.fn(() => adminChain);
  adminChain.eq = vi.fn(() => adminChain);
  adminChain.limit = vi.fn(async () => ({ data: [{ id: "report-1", full_report: storedPlan }], error: null }));
  adminChain.update = vi.fn((payload: unknown) => { state.updates.push(payload); return adminChain; });
  // Awaiting `update(...).eq(...).eq(...)` resolves here.
  adminChain.then = (resolve: (v: unknown) => void) => resolve({ error: state.updateError });
});

afterEach(() => { vi.useRealTimers(); });

describe("asking for lighter sessions", () => {
  it("records nothing when the plan could not be lightened", async () => {
    state.updateError = { message: "write failed" };
    const response = await PUT(req(tooHeavyYes));
    expect(response.status).toBe(503);
    expect(chain.upsert).not.toHaveBeenCalled();
  });

  it("puts the week back when saving the answer fails after the plan changed", async () => {
    chain.single.mockResolvedValue({ data: null, error: { code: "failed" } });
    const response = await PUT(req(tooHeavyYes));
    expect(response.status).toBe(500);
    expect(state.updates).toHaveLength(2);                                  // lighten, then restore
    expect(state.updates[1]).toEqual({ full_report: storedPlan });
  });

  it("lightens and records together when both succeed", async () => {
    chain.single.mockResolvedValue({ data: { run_id: runId, status: "answered", reduce_requested: true }, error: null });
    const response = await PUT(req(tooHeavyYes));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.lightened.length).toBeGreaterThan(0);
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ reduce_requested: true }), { onConflict: "run_id" });
  });
});
