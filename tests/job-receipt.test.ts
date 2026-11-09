import { describe, expect, it } from "vitest";
import { jobHealth, resumoDaSaude } from "@/lib/job-health";
import { receiptStatus } from "@/lib/job-run";

describe("job outcome", () => {
  it("surfaces delivery failures even when the handler returned HTTP 200", () => {
    const status = receiptStatus(200, { ok: true, athletes: 7, failures: 2 });
    expect(status).toBe("partial");
    const health = jobHealth([{
      job: "strava-sync", status, summary: "2 falhas", started_at: "2026-11-09T14:00:00Z",
      finished_at: "2026-11-09T14:01:00Z",
    }], new Date("2026-11-09T14:30:00Z"));
    expect(health.find(job => job.job === "strava-sync")).toMatchObject({ estado: "falhou", detalhe: "2 falhas" });
  });

  it("distinguishes the first observation window from successful jobs", () => {
    expect(resumoDaSaude(jobHealth([]))).toContain("aguardando primeira execução");
  });
});
