import { describe, expect, it } from "vitest";
import { readWeek, weekQuestion } from "@/lib/week-reading";

describe("how last week enters the next plan", () => {
  it("leaves a completed week alone", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 18 });
    expect(r.status).toBe("met");
    expect(r.creditedKm).toBe(18);
    expect(r.ask).toBeNull();
  });

  it("holds the volume when work, rain or the calendar got in the way", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 12, contexts: ["work"] });
    expect(r.reason).toBe("life");
    expect(r.creditedKm).toBe(19);
    expect(r.holding).toBe(true);
    expect(r.ask).toBeNull();
    expect(r.detail).toContain("não é perda de condicionamento");
  });

  it("never asks the athlete to make up the missing kilometres", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 12, contexts: ["weather"] });
    expect(r.detail).toContain("sem tentar compensar");
  });

  it("lets the plan come down when the body asked, without a question", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 11, contexts: ["fatigue"] });
    expect(r.reason).toBe("body");
    expect(r.creditedKm).toBe(11);
    expect(r.ask).toBeNull();
  });

  it("reads pain over a busy week when both were reported", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 11, contexts: ["work", "pain"] });
    expect(r.reason).toBe("body");
    expect(r.holding).toBe(false);
  });

  it("holds an unexplained week once, and asks what happened", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 9 });
    expect(r.reason).toBe("unknown");
    expect(r.creditedKm).toBe(19);
    expect(r.ask).toBe("what_happened");
  });

  it("stops holding a second unexplained week in a row", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 9, heldLastWeek: true });
    expect(r.creditedKm).toBe(9);
    expect(r.holding).toBe(false);
    expect(r.ask).toBe("what_happened");
  });

  it("asks whether the plan still fits after two weeks held for life", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 12, contexts: ["schedule"], heldLastWeek: true });
    expect(r.holding).toBe(true);
    expect(r.ask).toBe("does_it_fit");
  });

  it("takes the athlete's own answer over the check-in contexts", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 12, contexts: ["work"], answer: "too_much" });
    expect(r.reason).toBe("too_much");
    expect(r.creditedKm).toBe(12);
    expect(r.ask).toBeNull();
  });

  it("compares nothing when there was no plan to compare against", () => {
    const r = readWeek({ plannedKm: 0, actualKm: 14 });
    expect(r.status).toBe("met");
    expect(r.creditedKm).toBe(14);
    expect(r.ask).toBeNull();
  });

  it("offers one tap per question, and never blames the athlete", () => {
    for (const kind of ["what_happened", "does_it_fit"] as const) {
      const q = weekQuestion(kind);
      expect(q.options).toHaveLength(3);
      expect(q.title).not.toMatch(/falhou|desistiu|preguiça/i);
    }
  });
});

describe("an athlete who stopped is not asked every week", () => {
  it("says nothing when nobody has trained for weeks", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 0, inactive: true });
    expect(r.ask).toBeNull();
    expect(r.creditedKm).toBe(0);
    expect(r.headline).toBe("Sem treinos registrados");
  });
  it("still asks when the week was attempted", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 6, inactive: true });
    expect(r.ask).toBe("what_happened");
  });
});

describe("the athlete's own reasons and requests", () => {
  it.each(["sleep", "stress", "personal"] as const)("treats %s as life, not a smaller athlete", context => {
    const r = readWeek({ plannedKm: 19, actualKm: 12, contexts: [context] });
    expect(r.reason).toBe("life");
    expect(r.holding).toBe(true);
  });
  it("does not ramp after a completed week the athlete found too heavy", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 19, reductionRequested: true });
    expect(r.status).toBe("met");
    expect(r.reason).toBe("too_much");
    expect(r.headline).toBe("Semana cumprida, sem aumento");
  });
  it("reads a short week with a reduction request as too much, not as life", () => {
    const r = readWeek({ plannedKm: 19, actualKm: 12, contexts: ["work"], reductionRequested: true });
    expect(r.reason).toBe("too_much");
    expect(r.creditedKm).toBe(12);
  });
});
