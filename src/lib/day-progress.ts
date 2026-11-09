/**
 * O que aconteceu num dia do plano — previsto, registrado, ou nada.
 *
 * A agenda mostrava a semana como ela foi **planejada** e nunca mudava depois
 * do treino: o sábado dizia "Longão · 12 km" igual antes e depois de você
 * correr. Uma agenda que não sabe o que você fez está descrevendo um documento,
 * não a sua semana.
 *
 * As sessões e o que conta para cada uma vêm de `dayStatus`, que é a mesma
 * origem da Hoje e da adesão — de propósito. Já houve um tempo em que "treino
 * feito" queria dizer três coisas diferentes em três telas, e a mesma terça
 * aparecia concluída num card e pendente no outro.
 *
 * Aqui só se acrescenta a leitura do tempo: um dia sem registro que ainda não
 * terminou é **previsto**, não **perdido**. Essa diferença é a razão de esta
 * função existir em vez de a tela olhar `allDone`.
 */
import type { SessionActivityLink } from "@/lib/session-activity-link";
import { adaptationApplies, dayStatus, type DayActivity, type DayRun } from "@/lib/day-status";
import type { WeeklyPlanDay } from "@/types";

export type DayProgressState =
  /** Ainda vai acontecer (ou é hoje e o dia não acabou). */
  | "planned"
  /** Tudo que o plano pediu tem registro. */
  | "done"
  /** Duas sessões, uma registrada. */
  | "partial"
  | "unresolved"
  /** O dia passou e o que estava marcado não foi registrado. */
  | "missed"
  /** Não havia nada marcado, mas alguma coisa foi registrada. */
  | "extra"
  /** Descanso, e descanso foi o que aconteceu. */
  | "rest";

export interface DayProgress {
  state: DayProgressState;
  /** "Registrado", "1 de 2 registradas", "Sem registro" — null quando calar é melhor. */
  label: string | null;
  /** Sessões do plano com registro, e quantas o plano pediu. */
  done: number;
  total: number;
  /** Registros que o plano não pediu — a pelada de sábado, a caminhada. */
  extras: number;
  /**
   * A sessão foi adaptada.
   *
   * É uma característica, não um estado: um treino pode estar adaptado e ainda
   * previsto, ou adaptado e já realizado.
   */
  adapted: boolean;
}

export function dayProgress(input: {
  day: WeeklyPlanDay | null | undefined;
  /** A data desse dia, "YYYY-MM-DD". */
  date: string;
  /** Hoje, na mesma forma. Dias depois de hoje nunca são "sem registro". */
  today: string;
  runs: DayRun[];
  activities: DayActivity[];
  weightKg?: number | null;
  links?: SessionActivityLink[];
}): DayProgress {
  const status = dayStatus({
    date: input.date,
    planned: input.day,
    runs: input.runs,
    activities: input.activities,
    weightKg: input.weightKg,
    links: input.links,
  });

  const total = status.sessions.length;
  const done = status.sessions.filter(s => s.done).length;
  const extras = status.done.filter(d => !d.planned).length;
  const adapted = adaptationApplies(input.day, status);
  const isPast = input.date < input.today;

  const base = { done, total, extras, adapted };

  // Nada marcado no plano.
  if (total === 0) {
    if (extras > 0) {
      return {
        ...base, state: "extra",
        label: extras === 1 ? "1 atividade registrada" : `${extras} atividades registradas`,
      };
    }
    return { ...base, state: "rest", label: null };
  }

  if (status.sessions.some(s => s.unresolved)) return { ...base, state: "unresolved", label: "Vínculo a confirmar" };

  if (done === total) return { ...base, state: "done", label: "Registrado" };

  if (done > 0) {
    return { ...base, state: "partial", label: `${done} de ${total} registradas` };
  }

  // Sem registro só é uma constatação depois que o dia acabou. Hoje ainda dá.
  if (isPast) return { ...base, state: "missed", label: "Sem registro" };

  return { ...base, state: "planned", label: null };
}

/** O que foi registrado num dia, para mostrar ao lado do que estava previsto. */
export function dayDone(input: {
  day: WeeklyPlanDay | null | undefined;
  date: string;
  runs: DayRun[];
  activities: DayActivity[];
  weightKg?: number | null;
}) {
  return dayStatus({
    date: input.date,
    planned: input.day,
    runs: input.runs,
    activities: input.activities,
    weightKg: input.weightKg,
  }).done;
}
