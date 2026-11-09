/**
 * How the week that just ended enters the next one.
 *
 * The engine recomputes volume from what was *run*, which is right when the
 * athlete is training and wrong when life got in the way: a week broken by work
 * or rain came back as a smaller plan, silently, as if the body had lost
 * something. Sérgio's rule, in his words: avaliar sozinho, progredir sozinho,
 * e perguntar só quando algo não fecha.
 *
 * So three outcomes, and only one of them is a question:
 *
 *   · **met** — nothing to decide. The ratchet already holds the floor.
 *   · **short with a reason we know** — the check-ins said work, rain or
 *     schedule, so the missing kilometres are not evidence about the body: the
 *     volume is held and the athlete is told. Fatigue or pain prompts a
 *     question before easing off.
 *   · **short and nobody knows why** — hold without increasing and ask.
 *     Silence does not count as agreement to change the plan.
 *
 * Nothing here writes a plan. It produces the number the engine should treat as
 * executed, plus the sentence the athlete reads.
 */
import type { RunContext } from "@/lib/run-feedback";

/** Why a week fell short. `too_much` only ever comes from the athlete. */
export type ShortfallReason = "life" | "body" | "too_much" | "unknown";

export type AskKind = "what_happened" | "does_it_fit" | "body_lighter";

export interface WeekReading {
  plannedKm: number;
  actualKm: number;
  /** Fraction of the prescribed distance that was run. */
  completion: number;
  status: "met" | "short";
  reason: ShortfallReason | null;
  /** What the volume engine should treat as executed. */
  creditedKm: number;
  /** True when the shortfall was not allowed to pull the plan down. */
  holding: boolean;
  /** Next week must not climb above this one (the athlete asked, or the body is in question). */
  noRamp?: boolean;
  ask: AskKind | null;
  headline: string;
  detail: string;
}

/** Below this the week counts as met; ten per cent short is the week, done. */
const MET = 0.9;

// Outside the training itself: a short week for these reasons is not a smaller athlete.
const LIFE: RunContext[] = ["schedule", "work", "weather", "sleep", "stress", "personal"];
const BODY: RunContext[] = ["fatigue", "pain"];

const km = (n: number) => `${Number(n.toFixed(1)).toString().replace(".", ",")} km`;

export function readWeek(input: {
  plannedKm: number;
  actualKm: number;
  /** Contexts the athlete gave in that week's post-run check-ins. */
  contexts?: RunContext[];
  /** The athlete's own answer about the week, when they gave one. */
  answer?: ShortfallReason | null;
  /** The week before this one was already held; holding twice needs a question. */
  heldLastWeek?: boolean;
  /**
   * Nobody has trained for weeks. "What happened last week?" is a question for
   * someone who is training and had a bad week; asking it of an athlete who
   * stopped a month ago is the app talking to itself.
   */
  inactive?: boolean;
  /**
   * After a session felt too heavy, the athlete said yes to lighter sessions.
   * That is their call about the plan, so it outranks what the check-ins imply.
   */
  reductionRequested?: boolean;
}): WeekReading {
  const plannedKm = Math.max(0, Math.round(input.plannedKm));
  const actualKm = Math.max(0, Math.round(input.actualKm));
  const contexts = input.contexts ?? [];
  const completion = plannedKm > 0 ? actualKm / plannedKm : 1;

  // Nothing was prescribed, so nothing fell short.
  if (plannedKm <= 0) {
    return {
      plannedKm, actualKm, completion: 1, status: "met", reason: null,
      creditedKm: actualKm, holding: false, ask: null,
      headline: "Semana sem plano anterior",
      detail: "Sem uma prescrição da semana passada para comparar, o volume segue o seu histórico recente.",
    };
  }

  if (completion >= MET) {
    if (input.reductionRequested) {
      return {
        plannedKm, actualKm, completion, status: "met", reason: "too_much",
        creditedKm: actualKm, holding: false, ask: null,
        noRamp: true,
        headline: "Semana cumprida, sem aumento",
        detail: `Você fez ${km(actualKm)} dos ${km(plannedKm)} previstos, mas achou um treino pesado demais e pediu para aliviar. Por isso a semana seguinte não aumenta o volume.`,
      };
    }
    return {
      plannedKm, actualKm, completion, status: "met", reason: null,
      creditedKm: actualKm, holding: false, ask: null,
      headline: "Semana cumprida",
      detail: `Você fez ${km(actualKm)} dos ${km(plannedKm)} previstos. A progressão da semana seguinte segue normalmente.`,
    };
  }

  if (input.inactive && actualKm === 0) {
    return {
      plannedKm, actualKm, completion, status: "short", reason: null,
      creditedKm: actualKm, holding: false, ask: null,
      headline: "Sem treinos registrados",
      detail: "Nenhuma corrida registrada nesta semana nem nas anteriores. O plano volta a acompanhar o seu histórico quando você voltar a correr.",
    };
  }

  // Pain and fatigue outrank a busy calendar: if the body spoke in any session,
  // that is the reading, even when another day was lost to work.
  const fromCheckins: ShortfallReason | null =
    contexts.some(c => BODY.includes(c)) ? "body"
      : contexts.some(c => LIFE.includes(c)) ? "life"
        : null;
  const reason: ShortfallReason = input.answer ?? (input.reductionRequested ? "too_much" : null) ?? fromCheckins ?? "unknown";
  const missing = km(plannedKm - actualKm);
  const done = `Você fez ${km(actualKm)} dos ${km(plannedKm)} previstos`;

  if (reason === "life") {
    return {
      plannedKm, actualKm, completion, status: "short", reason,
      creditedKm: plannedKm, holding: true, noRamp: true,
      // Two weeks in a row held is no longer an interruption; it is a plan that
      // does not fit the athlete's routine, and only they can say that.
      ask: input.heldLastWeek ? "does_it_fit" : null,
      headline: "Semana atrapalhada pela rotina",
      detail: `${done}. Trabalho, agenda ou clima entraram no caminho, e isso não é perda de condicionamento: mantivemos o mesmo volume, sem tentar compensar os ${missing} que faltaram.`,
    };
  }

  if (reason === "body") {
    // The athlete said so themselves, in answer to the coach: ease off.
    if (input.answer === "body") {
      return {
        plannedKm, actualKm, completion, status: "short", reason,
        creditedKm: actualKm, holding: false, noRamp: true, ask: null,
        headline: "Semana mais leve, e tudo bem",
        detail: `${done}. Você pediu uma semana mais leve, então a seguinte parte do que foi feito, sem forçar a volta ao volume anterior.`,
      };
    }
    // Only the check-ins spoke. The individual feedback promised the plan would
    // not change, so it does not change silently now either: hold without
    // climbing, and ask (Sérgio's rule — ask before reducing).
    return {
      plannedKm, actualKm, completion, status: "short", reason,
      creditedKm: plannedKm, holding: true, noRamp: true, ask: "body_lighter",
      headline: "Semana com cansaço ou incômodo",
      detail: `${done}. Você relatou cansaço ou incômodo. Nada foi reduzido sem você: o volume fica como estava, sem aumentar, até você dizer se prefere uma semana mais leve.`,
    };
  }

  if (reason === "too_much") {
    return {
      plannedKm, actualKm, completion, status: "short", reason,
      creditedKm: actualKm, holding: false, noRamp: true, ask: null,
      headline: "Plano ajustado ao que cabe",
      detail: `${done}. Você disse que o plano estava grande demais, então ele passa a partir do que foi feito, em vez de insistir nos ${km(plannedKm)}.`,
    };
  }

  return {
    plannedKm, actualKm, completion, status: "short", reason: "unknown",
    creditedKm: plannedKm, holding: true, noRamp: true,
    ask: input.heldLastWeek ? "does_it_fit" : "what_happened",
    headline: "Faltou saber o que houve",
    detail: `${done}. Mantivemos o volume sem aumentar. Se você contar o que houve, o treinador pode ajustar a próxima semana com você.`,
  };
}

/** The question itself, when there is one. Short on purpose: one tap. */
export function weekQuestion(kind: AskKind): { title: string; options: Array<{ value: ShortfallReason; label: string }> } {
  if (kind === "body_lighter") {
    return {
      title: "Você relatou cansaço ou incômodo nesta semana. Como seguimos?",
      options: [
        { value: "life", label: "Foi pontual, pode manter" },
        { value: "body", label: "Quero uma semana mais leve" },
      ],
    };
  }
  return kind === "does_it_fit"
    ? {
      title: "Duas semanas seguidas atrapalhadas. O plano precisa mudar?",
      options: [
        { value: "life", label: "Foi pontual, mantenha" },
        { value: "too_much", label: "Está grande para minha rotina" },
        { value: "body", label: "Meu corpo pediu menos" },
      ],
    }
    : {
      title: "Sua semana ficou abaixo do previsto. O que houve?",
      options: [
        { value: "life", label: "Rotina, trabalho ou clima" },
        { value: "body", label: "Cansaço ou incômodo" },
        { value: "too_much", label: "O plano estava grande demais" },
      ],
    };
}
