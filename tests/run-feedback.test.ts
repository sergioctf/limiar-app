import { describe, expect, it } from "vitest";
import { evaluateRunFeedback, matchFeedbackPlan, pickFeedbackItem, validFeedbackInput, type FeedbackItem } from "@/lib/run-feedback";
import type { WeeklyPlanDay } from "@/types";
const planned: WeeklyPlanDay = { day: "Mon", dayPt: "Segunda", type: "easy", sport: "corrida", label: "Leve", distance_km: 6, pace: "6:00–6:30/km", description: "" };
const item: FeedbackItem = {
  run: { id: "a", name: "Corrida", date: "2026-09-14", distance_km: 4, avg_pace_seconds_per_km: 370, avg_hr: 150 },
  planned, feedback: null,
};
describe("post-run feedback", () => {
  it("does not interpret missing perception as lost fitness", () => {
    expect(evaluateRunFeedback(item).next).toContain("não concluímos");
  });
  it.each(["schedule", "work", "weather"] as const)("respects life context: %s", context => {
    const feedback = { run_id: "a", status: "answered" as const, effort: 2, context, note: null, planned };
    const result = evaluateRunFeedback({ ...item, feedback });
    expect(result.next).toContain("não indica perda");
    expect(result.next).toContain("não foram alterados");
  });
  it("does not reward a too-fast easy run", () => {
    const result = evaluateRunFeedback({ ...item, run: { ...item.run, distance_km: 6, avg_pace_seconds_per_km: 300 } });
    expect(result.evidence.join(" ")).toContain("não significa melhor");
  });
  it("does not compare average pace to interval targets", () => {
    const result = evaluateRunFeedback({ ...item, planned: { ...planned, type: "intervals" } });
    expect(result.evidence.join(" ")).not.toContain("Ritmo médio");
  });
  it("prioritizes pain even when the distance was completed", () => {
    const result = evaluateRunFeedback({ ...item, feedback: { run_id: "a", status: "answered", effort: 2, context: "pain", note: "joelho", planned } });
    expect(result.title).toContain("incômodo");
    expect(result.next).not.toContain("progressões");
  });
  it("does not attach two runs to the same day prescription", () => {
    expect(matchFeedbackPlan(item.run.date, [planned], 2)).toBeNull();
    expect(matchFeedbackPlan(item.run.date, [planned], 1)).toEqual(planned);
    expect(matchFeedbackPlan(item.run.date, [{ ...planned, sport: "ciclismo" }], 1)).toBeNull();
  });
  it("preserves an explicitly unmatched snapshot after a new plan exists", () => {
    const result = evaluateRunFeedback({ ...item, feedback: { run_id: "a", status: "answered", effort: 2, context: "none", note: null, planned: null } });
    expect(result.title).toBe("Treino registrado");
  });
  it("rejects coerced, missing and out-of-range answers", () => {
    const payload = { runId: "12345678-1234-1234-1234-123456789012", status: "answered", effort: 2, context: "none" };
    expect(validFeedbackInput(payload)).toBe(true);
    for (const effort of [null, "2", 0, 6, 1.5]) expect(validFeedbackInput({ ...payload, effort })).toBe(false);
    expect(validFeedbackInput({ ...payload, context: "__proto__" })).toBe(false);
    expect(validFeedbackInput({ ...payload, note: "x".repeat(301) })).toBe(false);
    expect(validFeedbackInput({ runId: payload.runId, status: "skipped" })).toBe(true);
  });
});

describe("which check-in the athlete sees", () => {
  const mk = (id: string, date: string, feedback: FeedbackItem["feedback"]): FeedbackItem => ({
    run: { id, name: "Corrida", date, distance_km: 6, avg_pace_seconds_per_km: 370, avg_hr: 150 },
    planned, feedback,
  });
  const answered = (id: string) => ({ run_id: id, status: "answered" as const, effort: 3, context: "none" as const, note: null, planned });
  const skipped = (id: string) => ({ run_id: id, status: "skipped" as const, effort: null, context: null, note: null, planned });

  it("shows the run itself on its own page, answered or not", () => {
    const item = mk("a", "2026-09-01", answered("a"));
    expect(pickFeedbackItem([item], { runId: "a", since: "2026-09-15" })).toBe(item);
  });
  it("asks about the pending run before repeating an assessment", () => {
    const pending = mk("b", "2026-09-15", null);
    const done = mk("a", "2026-09-16", answered("a"));
    expect(pickFeedbackItem([done, pending], { since: "2026-09-15" })).toBe(pending);
  });
  it("keeps the assessment visible right after the athlete answers", () => {
    const old = mk("a", "2026-09-10", answered("a"));
    expect(pickFeedbackItem([old], { selectedId: "a", since: "2026-09-15" })).toBe(old);
  });
  it("stops occupying the home once the assessment is no longer news", () => {
    const old = mk("a", "2026-09-10", answered("a"));
    expect(pickFeedbackItem([old], { since: "2026-09-15" })).toBeNull();
    const yesterday = mk("a", "2026-09-15", answered("a"));
    expect(pickFeedbackItem([yesterday], { since: "2026-09-15" })).toBe(yesterday);
  });
  it("does not ask again about a check-in the athlete skipped", () => {
    expect(pickFeedbackItem([mk("a", "2026-09-16", skipped("a"))], { since: "2026-09-15" })).toBeNull();
  });
});
