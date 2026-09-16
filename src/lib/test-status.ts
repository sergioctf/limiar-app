/**
 * The 3 km test is the app's calibration point.
 *
 * Every prescribed intensity — training paces, heart-rate windows, race
 * predictions, and the advisor's judgement about whether a session was too hard
 * or too easy — derives from a single measured effort. We never estimate them
 * from ordinary runs: a guessed number looks exactly as authoritative on screen
 * as a measured one, and the athlete has no way to tell them apart.
 *
 * So features that depend on calibration stay visibly locked until the test
 * exists, and the athlete is reminded when it goes out of date. This module is
 * the single source of truth for that state — the dashboard card, the coach
 * page, the advisor gate and the reminder push all read from here.
 */
import type { PerformanceTest } from "@/types";

/** Past this, fitness has usually moved enough that the paces mislead. */
export const TEST_AGING_WEEKS = 8;
/** Past this, the numbers are actively wrong rather than merely dated. */
export const TEST_STALE_WEEKS = 16;

export type TestState =
  | "missing"    // never tested — nothing is calibrated
  | "no_hr"      // tested, but without average HR: paces yes, HR zones no
  | "fresh"      // recent and complete
  | "aging"      // 8–16 weeks
  | "stale";     // 16+ weeks

export interface TestUnlocks {
  /** Training paces (E/M/T/I/R) in the weekly plan. */
  paces: boolean;
  /** Heart-rate windows per segment. */
  hrZones: boolean;
  /** The AI advisor — needs calibrated intensities to judge anything. */
  advisor: boolean;
  /** Race-time predictions from VDOT. */
  predictions: boolean;
}

export interface TestStatus {
  state: TestState;
  latest: PerformanceTest | null;
  /** Whole weeks since the test, or null if there is none. */
  weeksSince: number | null;
  hasHr: boolean;
  unlocks: TestUnlocks;
  /** How loudly to ask for a (re)test. */
  nudge: "none" | "soft" | "strong";
  headline: string;
  detail: string;
}

function weeksSince(dateStr: string): number {
  const diff = Date.now() - new Date(`${dateStr}T12:00:00`).getTime();
  return Math.max(0, Math.floor(diff / (7 * 86400_000)));
}

function newest(tests: PerformanceTest[]): PerformanceTest | null {
  if (tests.length === 0) return null;
  return tests.reduce((a, b) => (a.test_date >= b.test_date ? a : b));
}

/**
 * Current calibration state. Accepts a list, a single test or null so callers
 * can pass whatever they already have loaded.
 */
export function testStatus(input: PerformanceTest[] | PerformanceTest | null | undefined): TestStatus {
  const list = Array.isArray(input) ? input : input ? [input] : [];
  const latest = newest(list);

  if (!latest) {
    return {
      state: "missing",
      latest: null,
      weeksSince: null,
      hasHr: false,
      unlocks: { paces: false, hrZones: false, advisor: false, predictions: false },
      nudge: "strong",
      headline: "Faça o teste de 3 km para calibrar o app",
      detail:
        "Sem ele o plano monta volume e estrutura, mas não consegue dizer em que ritmo " +
        "correr nem em que faixa de FC ficar. Preferimos deixar em branco a chutar: um " +
        "número estimado parece tão confiável quanto um medido, e você não teria como " +
        "saber a diferença.",
    };
  }

  const weeks = weeksSince(latest.test_date);
  const hasHr = latest.avg_hr != null && latest.avg_hr > 0;

  const state: TestState =
    weeks >= TEST_STALE_WEEKS ? "stale"
      : weeks >= TEST_AGING_WEEKS ? "aging"
        : hasHr ? "fresh" : "no_hr";

  // Paces and predictions survive ageing (with a warning); HR zones need the
  // average heart rate to have been recorded at all.
  const unlocks: TestUnlocks = {
    paces: true,
    hrZones: hasHr,
    advisor: true,
    predictions: true,
  };

  if (state === "stale") {
    return {
      state, latest, weeksSince: weeks, hasHr, unlocks,
      nudge: "strong",
      headline: `Seu teste tem ${weeks} semanas`,
      detail:
        "Depois de ~4 meses os ritmos deixam de descrever você: provavelmente lentos " +
        "demais se você vem treinando, ou pesados demais se ficou parado. Refaça o " +
        "teste — leva 15 minutos e recalibra todo o plano.",
    };
  }

  if (state === "aging") {
    return {
      state, latest, weeksSince: weeks, hasHr, unlocks,
      nudge: "soft",
      headline: `Teste de ${weeks} semanas atrás`,
      detail:
        "Já dá para refazer. Dois meses de treino costumam mudar o condicionamento o " +
        "suficiente para os alvos ficarem lentos — e treinar abaixo do que você aguenta " +
        "custa evolução em silêncio.",
    };
  }

  if (state === "no_hr") {
    return {
      state, latest, weeksSince: weeks, hasHr, unlocks,
      nudge: "soft",
      headline: "Faltou a FC média no seu teste",
      detail:
        "Os ritmos estão calibrados, mas sem a frequência cardíaca média do teste não " +
        "dá para definir suas faixas de FC. No próximo teste, registre a FC média — é " +
        "ela que libera as zonas.",
    };
  }

  return {
    state, latest, weeksSince: weeks, hasHr, unlocks,
    nudge: "none",
    headline: "Plano calibrado",
    detail: `Teste de ${weeks === 0 ? "esta semana" : `${weeks} semana${weeks > 1 ? "s" : ""} atrás`} — ritmos e faixas de FC estão valendo.`,
  };
}

/** What the athlete gets by doing the test, for empty/locked states. */
export const TEST_BENEFITS: Array<{ title: string; detail: string }> = [
  {
    title: "Ritmos de treino",
    detail: "Rodagem, limiar, tiro e ritmo de prova em min/km — cada km do plano ganha um alvo.",
  },
  {
    title: "Faixas de frequência cardíaca",
    detail: "Z1 a Z5 calculadas a partir do seu limiar real, não de \"220 menos a idade\".",
  },
  {
    title: "Previsão de tempo nas provas",
    detail: "Do 5 km à maratona, com o ritmo-alvo para cada uma.",
  },
  {
    title: "Conselheiro de IA",
    detail: "Só faz sentido com intensidades calibradas — sem elas ele não sabe se seu treino foi forte ou leve.",
  },
];

/** How to run it, shown wherever we ask for the test. */
export const TEST_PROTOCOL: string[] = [
  "Aqueça 10–15 min de corrida leve, sem pressa.",
  "Corra 3 km no ritmo mais forte que você consegue SUSTENTAR — sem sobrar no fim, sem apagar no meio.",
  "Terreno plano, de preferência o mesmo lugar todas as vezes.",
  "Anote o tempo total e a FC média (é ela que libera as zonas).",
  "Desaqueça 5–10 min trotando.",
];

/**
 * Whether this week's plan should carry the 3 km test as its hard session.
 *
 * The reminder existed only as a push notification, which competes with the
 * lock screen and loses: four of the app's six athletes had never tested, so
 * their plans prescribed structure and volume with no paces at all. Putting it
 * on the calendar as a session is much harder to ignore than a banner.
 *
 * Two conditions, and both matter:
 *
 *   • The test is actually owed — missing, ageing or stale. An athlete with a
 *     fresh test is asked for nothing.
 *   • It is the first week of the block, right after the recovery week. Testing
 *     on tired legs measures fatigue rather than fitness, and a bad number here
 *     miscalibrates every pace in the app until the next test.
 */
export function shouldScheduleTest(
  status: Pick<TestStatus, "nudge">,
  cycleWeek: number | null | undefined,
): boolean {
  if (status.nudge === "none") return false;
  return cycleWeek === 1;
}
