/**
 * What the athlete should do today — the one answer the home screen owes them.
 *
 * The dashboard opened with twenty six blocks of equal weight, so the question
 * a training app exists to answer was somewhere in the middle of a scroll,
 * competing with shoe mileage and a chart of aerobic efficiency.
 *
 * The answer has to adapt, because the athletes are not in the same state. Five
 * of the app's seven have never done the 3 km test, which means their plans
 * carry structure and volume but no paces at all; some have no plan for the
 * week. Showing "Rodagem leve" with no pace to somebody who never calibrated is
 * half an answer, and pretending otherwise is worse than saying so.
 */
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";
import { sessionWhy, type WhyContext } from "@/lib/session-why";

export type TodayState = "planned" | "done" | "rest" | "no_plan";

export interface TodayPrompt {
  kind: "test" | "generate";
  text: string;
  href: string;
}

export interface Today {
  state: TodayState;
  session: WeeklyPlanDay | null;
  /** The line the screen leads with. */
  headline: string;
  /** Pace, heart rate, or why today is a rest day. */
  detail: string;
  /** Kilometres already run today. */
  doneKm: number;
  /** The one thing worth asking of this athlete, if anything. */
  prompt?: TodayPrompt;
  /**
   * Why this session, today.
   *
   * The engine argued its way to this prescription and never told anybody.
   * Null when there is nothing worth saying.
   */
  why?: string | null;
}

const DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface Input {
  plan: WeeklyPlanData | null | undefined;
  runs: Array<{ date: string; distance_km: number }>;
  /** YYYY-MM-DD in the athlete's calendar. */
  today: string;
  weekStart: string;
  hasTest: boolean;
  /** Position in the block, so the reason can name it. */
  why?: WhyContext;
}

/** Which weekday `today` is, relative to the week the plan describes. */
function dayKeyFor(today: string, weekStart: string): string | null {
  const a = new Date(`${weekStart}T12:00:00`).getTime();
  const b = new Date(`${today}T12:00:00`).getTime();
  const i = Math.round((b - a) / 86400000);
  return i >= 0 && i < 7 ? DAY_KEYS[i] : null;
}

export function buildToday(input: Input): Today {
  const doneKm = input.runs
    .filter(r => r.date === input.today)
    .reduce((s, r) => s + (r.distance_km ?? 0), 0);

  const key = dayKeyFor(input.today, input.weekStart);
  const session = key
    ? (input.plan?.days ?? []).find(d => d.day === key) ?? null
    : null;

  /*
   * The calibration nudge, when it is worth making.
   *
   * Never while the athlete is already being asked to test — the plan schedules
   * the 3 km test as a session, and telling somebody to calibrate on the day
   * they were given the calibration workout is the app talking past itself.
   */
  const needsTest = !input.hasTest && session?.type !== "test";
  const testPrompt: TodayPrompt = {
    kind: "test",
    text: "Faça o teste de 3 km para o plano ganhar ritmos e zonas de FC",
    href: "/coach",
  };

  if (!session) {
    return {
      state: "no_plan",
      session: null,
      headline: "Sem plano para hoje",
      detail: "Gere o plano da semana e o treinador monta os sete dias.",
      doneKm,
      prompt: { kind: "generate", text: "Gerar plano da semana", href: "/coach" },
    };
  }

  if (session.type === "rest") {
    return {
      state: "rest",
      session,
      why: sessionWhy(session, input.why ?? {}),
      headline: "Descanso",
      detail: "É quando a adaptação acontece — o ganho das sessões duras vem hoje.",
      doneKm,
      prompt: needsTest ? testPrompt : undefined,
    };
  }

  const km = session.distance_km ?? null;
  const headline = km ? `${session.label} · ${km} km` : session.label ?? "Treino";

  /*
   * Pace, then duration for the sessions measured in minutes (lifting, cross
   * training). Falling back to the description would put a paragraph where a
   * glanceable line belongs.
   */
  const detail =
    session.pace
      ?? (session.duration_min ? `${session.duration_min} min` : null)
      ?? (input.hasTest ? "" : "Sem ritmo alvo — o teste de 3 km destrava isso.");

  /*
   * Any running counts the day as done.
   *
   * Judging "did you do enough" belongs to weekly adherence, which weighs the
   * whole week. On the home screen, telling somebody who ran 5 of 6 km that
   * they missed the session teaches them to stop opening the app.
   */
  const state: TodayState = doneKm > 0 ? "done" : "planned";

  return {
    state,
    session,
    headline,
    detail,
    doneKm,
    why: sessionWhy(session, input.why ?? {}),
    prompt: needsTest ? testPrompt : undefined,
  };
}
