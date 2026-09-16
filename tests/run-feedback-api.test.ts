import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { db, chain } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["select", "eq", "is", "order", "gte", "lte", "limit", "in", "upsert", "single", "maybeSingle"])
    chain[name] = vi.fn();
  return { chain, db: { auth: { getUser: vi.fn() }, from: vi.fn() } };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: () => db }));
import { GET, PUT } from "@/app/api/run-feedback/route";
const runId = "12345678-1234-1234-1234-123456789012";
const req = (body: unknown) => new NextRequest("http://localhost/api/run-feedback", { method: "PUT", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  for (const f of Object.values(chain)) f.mockReturnValue(chain);
  db.from.mockReturnValue(chain);
  db.auth.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
});
describe("run feedback authorization and persistence", () => {
  it("rejects unauthenticated reads and writes without querying data", async () => {
    db.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(new NextRequest("http://localhost/api/run-feedback"))).status).toBe(401);
    expect((await PUT(req({}))).status).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("rejects invalid inputs before looking up a run", async () => {
    expect((await PUT(req({ runId, status: "answered", effort: null, context: "none" }))).status).toBe(400);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("does not write for a deleted run or another user's run", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await PUT(req({ runId, status: "skipped" }))).status).toBe(404);
    expect(chain.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(chain.is).toHaveBeenCalledWith("deleted_at", null);
    expect(chain.upsert).not.toHaveBeenCalled();
  });
  it("keeps the snapshot and derives ownership from auth, not the payload", async () => {
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: runId, date: "2026-09-14" }, error: null })
      .mockResolvedValueOnce({ data: { planned: null }, error: null });
    chain.single.mockResolvedValue({ data: { run_id: runId, status: "answered" }, error: null });
    const response = await PUT(req({ runId, user_id: "other", status: "answered", effort: 2, context: "weather", note: " Chuva " }));
    expect(response.status).toBe(200);
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "owner", note: "Chuva", planned: null }), { onConflict: "run_id" });
    expect(db.from).not.toHaveBeenCalledWith("coach_reports");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("reports a save failure without returning success", async () => {
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: runId, date: "2026-09-14" }, error: null })
      .mockResolvedValueOnce({ data: { planned: null }, error: null });
    chain.single.mockResolvedValue({ data: null, error: { code: "failed" } });
    expect((await PUT(req({ runId, status: "skipped" }))).status).toBe(500);
  });
});
