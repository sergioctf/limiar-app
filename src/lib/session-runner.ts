import type { StrengthExercisePrescription, StrengthSession } from "@/lib/strength-builder";
import type { ProgressionAdvice } from "@/lib/strength-progression";

/**
 * O treino enquanto ele acontece.
 *
 * O app sabia descrever a sessão e sabia guardá-la depois — e não acompanhava
 * nada no meio. Quem estava na academia abria uma lista de quatro exercícios,
 * decorava, treinava, e no fim preenchia uma tabela de inputs tentando lembrar
 * o que fez em cada série. "Falta o app servir dentro da academia, não só antes
 * dela" (Sérgio, item 3).
 *
 * Aqui mora a parte que não é tela: o estado de uma sessão em andamento, o
 * descanso, e o que disso tudo vira registro. A tela
 * (`components/coach/SessionRunner.tsx`) só desenha.
 *
 * Duas decisões que valem explicação:
 *
 * 1. **O descanso é um instante, não um contador.** Guardar os segundos
 *    restantes e subtrair de um em um erra toda vez que a tela apaga — e a
 *    tela apaga em todo descanso de 90 s com o telefone no bolso. Guardamos
 *    *quando ele acaba*, e o que sobra é sempre derivado do relógio.
 *
 * 2. **A sessão sobrevive ao app.** O telefone bloqueia, chega uma ligação, o
 *    navegador descarta a aba. Perder três exercícios registrados por causa
 *    disso faria o atleta não confiar no modo nenhuma vez mais, então o estado
 *    é serializável e volta de onde parou.
 */

/** Uma série, como ela está na mão do atleta. */
export interface RunnerSet {
  /** Texto, não número: o campo é editável e "" é um estado legítimo. */
  weightKg: string;
  reps:     string;
  rir:      string;
  /** Marcada como feita — é isso que decide o que vai para o registro. */
  done:     boolean;
}

/** O estado da sessão inteira, por exercício. */
export type RunnerState = Record<string, RunnerSet[]>;

export interface StoredRunner {
  date:  string;
  state: RunnerState;
}

export const RUNNER_STORAGE_PREFIX = "limiar-exec-";
export const runnerStorageKey = (date: string) => `${RUNNER_STORAGE_PREFIX}${date}`;

/**
 * O ponto de partida de cada série.
 *
 * A carga vem da sugestão da progressão quando existe, senão da última sessão
 * — digitar de novo o que já se levantou na semana passada é exatamente o
 * atrito que faz as pessoas pararem de registrar. As repetições começam no
 * piso da faixa prescrita: é o número que o atleta precisa bater, e subir dele
 * é mais fácil do que descobrir que não chegou no topo.
 */
export function seedRunnerState(
  session: Pick<StrengthSession, "exercises">,
  advice: Record<string, ProgressionAdvice | undefined> = {},
): RunnerState {
  const state: RunnerState = {};
  for (const ex of session.exercises) {
    const suggested = advice[ex.exerciseId]?.weightKg ?? null;
    state[ex.exerciseId] = Array.from({ length: Math.max(1, ex.sets) }, () => ({
      weightKg: suggested != null ? String(suggested) : "",
      reps:     String(ex.reps[0]),
      rir:      String(ex.rir),
      done:     false,
    }));
  }
  return state;
}

/** Quantas séries estão feitas, de quantas. */
export function runnerProgress(state: RunnerState): { done: number; total: number } {
  let done = 0, total = 0;
  for (const sets of Object.values(state)) {
    for (const s of sets) { total++; if (s.done) done++; }
  }
  return { done, total };
}

/** Um exercício está vencido quando todas as suas séries estão marcadas. */
export function exerciseComplete(state: RunnerState, exerciseId: string): boolean {
  const sets = state[exerciseId];
  return !!sets && sets.length > 0 && sets.every(s => s.done);
}

/**
 * O próximo exercício que ainda tem série por fazer, a partir de onde se está.
 *
 * Procura para a frente e depois volta ao começo: quem pulou o supino porque o
 * banco estava ocupado e terminou o resto precisa ser levado de volta a ele, e
 * não para o fim do treino.
 */
export function nextPendingIndex(
  exercises: Array<Pick<StrengthExercisePrescription, "exerciseId">>,
  state: RunnerState,
  from: number,
): number | null {
  const n = exercises.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (!exerciseComplete(state, exercises[i].exerciseId)) return i;
  }
  return null;
}

const toNumber = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * O que vai para `/api/strength/log`.
 *
 * **Só as séries marcadas.** Uma série que ficou na tela com a carga sugerida e
 * nunca foi feita não é um registro — é uma intenção, e gravá-la como feita
 * envenenaria a progressão, que é calculada exatamente a partir destas linhas.
 *
 * Séries sem repetição nem carga são descartadas aqui também, pelo mesmo
 * motivo pelo qual a rota as descarta: não carregam informação.
 */
export function loggableSets(state: RunnerState): Array<{
  exerciseId: string; setIndex: number;
  weightKg: number | null; reps: number | null; rir: number | null;
}> {
  const out: Array<{ exerciseId: string; setIndex: number; weightKg: number | null; reps: number | null; rir: number | null }> = [];
  for (const [exerciseId, sets] of Object.entries(state)) {
    sets.forEach((s, i) => {
      if (!s.done) return;
      const weightKg = toNumber(s.weightKg);
      const reps     = toNumber(s.reps);
      if (weightKg == null && reps == null) return;
      out.push({ exerciseId, setIndex: i + 1, weightKg, reps, rir: toNumber(s.rir) });
    });
  }
  return out;
}

/** Quanto falta do descanso, em segundos, pelo relógio e não por contagem. */
export function restRemaining(endsAt: number | null, now: number): number {
  if (endsAt == null) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/**
 * O que foi lido do armazenamento local é dado de fora, não estado nosso.
 *
 * Pode vir de uma versão anterior do app, de outro dia, ou corrompido. Qualquer
 * coisa que não case com a prescrição de hoje é descartada em silêncio — uma
 * sessão que volta errada é pior do que uma que não volta.
 */
export function parseStoredRunner(raw: string | null, date: string): RunnerState | null {
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  const stored = parsed as Partial<StoredRunner>;
  if (stored.date !== date || !stored.state || typeof stored.state !== "object") return null;

  const state: RunnerState = {};
  for (const [exerciseId, sets] of Object.entries(stored.state)) {
    if (!Array.isArray(sets)) return null;
    state[exerciseId] = sets.map(s => ({
      weightKg: typeof s?.weightKg === "string" ? s.weightKg : "",
      reps:     typeof s?.reps     === "string" ? s.reps     : "",
      rir:      typeof s?.rir      === "string" ? s.rir      : "",
      done:     s?.done === true,
    }));
  }
  return state;
}

/**
 * O que o atleta já fez ganha do que chegou depois.
 *
 * A carga sugerida vem de uma chamada de rede, e no subsolo de uma academia
 * essa chamada demora. Quem abriu o modo e marcou a primeira série antes de ela
 * responder tinha a série apagada quando ela chegava — o pior momento possível
 * para o app parecer que não guardou nada.
 *
 * A regra é simples: uma série marcada, ou com carga digitada, é do atleta. O
 * resto aceita o que chegou (a sugestão, ou o rascunho do próprio treino).
 */
export function reconcileLate(current: RunnerState, incoming: RunnerState): RunnerState {
  const out: RunnerState = {};
  for (const [exerciseId, sets] of Object.entries(incoming)) {
    const mine = current[exerciseId];
    out[exerciseId] = sets.map((chegou, i) => {
      const meu = mine?.[i];
      if (!meu) return chegou;
      return meu.done || meu.weightKg.trim() !== "" ? meu : chegou;
    });
  }
  return out;
}

/**
 * Casa o que foi guardado com a prescrição de hoje.
 *
 * Entre guardar e voltar, a sessão pode ter mudado — uma troca de exercício,
 * uma adaptação, uma semana de volume reduzido. O que vale é a prescrição
 * atual; o guardado só preenche o que ainda existe nela.
 */
export function mergeStoredRunner(seeded: RunnerState, stored: RunnerState | null): RunnerState {
  if (!stored) return seeded;
  const merged: RunnerState = {};
  for (const [exerciseId, sets] of Object.entries(seeded)) {
    const old = stored[exerciseId];
    merged[exerciseId] = old
      ? sets.map((s, i) => old[i] ?? s).concat(old.slice(sets.length))
      : sets;
  }
  return merged;
}
