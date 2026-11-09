import { describe, expect, it } from "vitest";
import { activityComparison, activityDebriefCandidate, activityPlanMatch, validActivityFeedback, type FeedbackActivity } from "@/lib/activity-feedback";
import type { WeeklyPlanDay } from "@/types";

const ride: FeedbackActivity = {
  id: "aa28d515-18c7-4149-9d6a-22a773691b32", name: "Pedal", date: "2026-11-09",
  sport_type: "Ride", duration_seconds: 2400, distance_m: 16000, avg_hr: null,
};
const plan: WeeklyPlanDay = { day: "Mon", dayPt: "Segunda", type: "easy", label: "Pedal leve", description: "Pedal leve.", sport: "ciclismo", distance_km: 10 };

describe("Debrief de atividades", () => {
  it("não atribui o treino quando existem dois registros da mesma modalidade no dia", () => {
    expect(activityPlanMatch(ride, [ride], [plan])).toEqual(plan);
    expect(activityPlanMatch(ride, [ride, { ...ride, id: "extra", sport_type: "VirtualRide" }], [plan])).toBeNull();
  });

  it("pergunta sobre a distância registrada e evita comparação sem referência", () => {
    expect(activityComparison(ride, plan)?.question).toBe("Você quis estender o treino?");
    expect(activityComparison(ride, null)).toBeNull();
  });

  it("aceita PSE zero e rejeita valor fora do intervalo ou motivo inexistente", () => {
    const body = { activityId: ride.id, status: "answered", perception: "light", reason: "time", rpe: 0 };
    expect(validActivityFeedback(body)).toBe(true);
    expect(validActivityFeedback({ ...body, rpe: 11 })).toBe(false);
    expect(validActivityFeedback({ ...body, reason: "fake" })).toBe(false);
  });

  it("retoma um adiamento depois da janela e respeita a dispensa", () => {
    const item = { activity: ride, planned: null, feedback: {
      activity_id: ride.id, status: "deferred" as const, perception: null, reason: null, rpe: null, note: null,
      planned: null, updated_at: "2026-11-09T10:00:00Z",
    } };
    expect(activityDebriefCandidate([item], ride.date, Date.parse("2026-11-09T15:00:00Z"))).toBeNull();
    expect(activityDebriefCandidate([item], ride.date, Date.parse("2026-11-09T18:00:00Z"))).toEqual(item);
    expect(activityDebriefCandidate([{ ...item, feedback: { ...item.feedback, status: "skipped" } }], ride.date, Date.parse("2026-11-09T18:00:00Z"))).toBeNull();
  });
});
