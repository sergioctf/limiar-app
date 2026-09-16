import { describe, expect, it } from "vitest";
import {
  contextQuestion, evaluateRunFeedback, matchFeedbackPlan, promptCandidate, validFeedbackInput,
  type FeedbackItem, type RunFeedback,
} from "@/lib/run-feedback";
import type { WeeklyPlanDay } from "@/types";

const planned: WeeklyPlanDay = { day: "Mon", dayPt: "Segunda", type: "easy", sport: "corrida", label: "Leve", distance_km: 6, pace: "6:00–6:30/km", description: "" };
const item: FeedbackItem = {
  run: { id: "a", name: "Corrida", date: "2026-09-14", distance_km: 4, avg_pace_seconds_per_km: 370, avg_hr: 150 },
  planned, feedback: null,
};
const answer = (effort: number, context: RunFeedback["context"], extra: Partial<RunFeedback> = {}): RunFeedback =>
  ({ run_id: "a", status: "answered", effort, context, note: null, planned, ...extra });

describe("post-run feedback", () => {
  it("does not interpret missing perception as lost fitness", () => {
    expect(evaluateRunFeedback(item).next).toContain("não concluímos");
  });
  it.each(["schedule", "work", "weather"] as const)("respects life context: %s", context => {
    const result = evaluateRunFeedback({ ...item, feedback: answer(2, context) });
    expect(result.next).toContain("não indica perda");
    expect(result.next).toContain("seguem como planejados");
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
    const result = evaluateRunFeedback({ ...item, feedback: answer(2, "pain", { note: "joelho" }) });
    expect(result.title).toContain("incômodo");
  });
  it("does not attach two runs to the same day prescription", () => {
    expect(matchFeedbackPlan(item.run.date, [planned], 2)).toBeNull();
    expect(matchFeedbackPlan(item.run.date, [planned], 1)).toEqual(planned);
    expect(matchFeedbackPlan(item.run.date, [{ ...planned, sport: "ciclismo" }], 1)).toBeNull();
  });
  it("preserves an explicitly unmatched snapshot after a new plan exists", () => {
    const result = evaluateRunFeedback({ ...item, feedback: answer(2, "none", { planned: null }) });
    expect(result.title).toBe("Treino registrado");
  });
});

describe("hard is not a warning; very hard asks why first", () => {
  it("raises nothing when a session felt hard", () => {
    const result = evaluateRunFeedback({ ...item, feedback: answer(4, "none") });
    expect(result.next).toBe("Os próximos treinos seguem como planejados.");
    expect(result.next).not.toMatch(/cansaço|esforço alto|atenção/i);
  });
  it("says hard is expected on a hard session", () => {
    const hard = { ...planned, type: "intervals" as const };
    const result = evaluateRunFeedback({ ...item, planned: hard, feedback: answer(4, "none", { planned: hard }) });
    expect(result.next).toContain("esperado");
  });
  it("only very hard swaps the second question for 'what made it so'", () => {
    expect(contextQuestion(4).title).toBe("Teve algo que precisamos considerar?");
    expect(contextQuestion(5).title).toBe("O que deixou o treino muito difícil?");
    expect(contextQuestion(5).options.map(([key]) => key)).toContain("session_too_hard");
    expect(contextQuestion(4).options.map(([key]) => key)).not.toContain("session_too_hard");
  });
  it.each(["sleep", "stress", "fatigue", "personal"] as const)("records an outside reason without touching the plan: %s", context => {
    const result = evaluateRunFeedback({ ...item, feedback: answer(5, context) });
    expect(result.title).toBe("Treino muito difícil, motivo registrado");
    expect(result.next).toContain("não muda o plano");
  });
  it("lightens only when the athlete said yes", () => {
    const yes = evaluateRunFeedback({ ...item, feedback: answer(5, "session_too_hard", { reduce_requested: true }) });
    expect(yes.title).toBe("Próximos treinos mais leves");
    const no = evaluateRunFeedback({ ...item, feedback: answer(5, "session_too_hard", { reduce_requested: false }) });
    expect(no.title).toBe("Treino pesado, plano mantido");
    expect(no.next).toContain("seguem como planejados");
  });
});

describe("what the API accepts", () => {
  const base = { runId: "12345678-1234-1234-1234-123456789012", status: "answered" };
  it("rejects coerced, missing and out-of-range answers", () => {
    const payload = { ...base, effort: 2, context: "none" };
    expect(validFeedbackInput(payload)).toBe(true);
    for (const effort of [null, "2", 0, 6, 1.5]) expect(validFeedbackInput({ ...payload, effort })).toBe(false);
    expect(validFeedbackInput({ ...payload, context: "__proto__" })).toBe(false);
    expect(validFeedbackInput({ ...payload, note: "x".repeat(301) })).toBe(false);
    expect(validFeedbackInput({ runId: base.runId, status: "skipped" })).toBe(true);
  });
  it("accepts a reason only from the question that was asked", () => {
    expect(validFeedbackInput({ ...base, effort: 3, context: "sleep" })).toBe(false);
    expect(validFeedbackInput({ ...base, effort: 5, context: "sleep" })).toBe(true);
    expect(validFeedbackInput({ ...base, effort: 5, context: "schedule" })).toBe(false);
  });
  it("requires the reduce answer after 'too heavy', and refuses it anywhere else", () => {
    expect(validFeedbackInput({ ...base, effort: 5, context: "session_too_hard" })).toBe(false);
    expect(validFeedbackInput({ ...base, effort: 5, context: "session_too_hard", reduce: true })).toBe(true);
    expect(validFeedbackInput({ ...base, effort: 5, context: "session_too_hard", reduce: false })).toBe(true);
    expect(validFeedbackInput({ ...base, effort: 5, context: "sleep", reduce: true })).toBe(false);
  });
});

describe("which run the entry pop-up asks about", () => {
  const mk = (id: string, date: string, feedback: FeedbackItem["feedback"]): FeedbackItem => ({
    run: { id, name: "Corrida", date, distance_km: 6, avg_pace_seconds_per_km: 370, avg_hr: 150 },
    planned, feedback,
  });
  it("asks about the most recent unanswered run", () => {
    const older = mk("a", "2026-09-15", null);
    const newer = mk("b", "2026-09-16", null);
    expect(promptCandidate([older, newer], "2026-09-14")).toBe(newer);
  });
  it("never pops up again for a run left for later", () => {
    const later = mk("a", "2026-09-16", { run_id: "a", status: "skipped", effort: null, context: null, note: null, planned });
    expect(promptCandidate([later], "2026-09-14")).toBeNull();
  });
  it("does not ask about a run that is no longer fresh", () => {
    expect(promptCandidate([mk("a", "2026-09-10", null)], "2026-09-14")).toBeNull();
  });
  it("does not ask again once answered", () => {
    expect(promptCandidate([mk("a", "2026-09-16", answer(3, "none"))], "2026-09-14")).toBeNull();
  });
});
