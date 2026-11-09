"use client";

/**
 * Modo de execução — o treino enquanto ele acontece.
 *
 * O app sabia descrever a sessão (`StrengthSessionView`) e sabia guardá-la
 * depois (`StrengthLogger`), e não acompanhava nada no meio. Quem estava na
 * academia abria uma lista de quatro exercícios com letra de 11 px, decorava,
 * treinava, e no fim preenchia uma tabela de inputs tentando lembrar quanto
 * tinha posto em cada série. "Falta o app servir dentro da academia, não só
 * antes dela" (Sérgio, item 3).
 *
 * O que esta tela assume sobre quem a usa: está **de pé**, com **uma mão**, a
 * um braço de distância do telefone, e vai voltar a ela umas vinte vezes em
 * cinquenta minutos. Daí as três decisões de forma:
 *
 *   1. **Um exercício por vez, ocupando a tela.** A lista inteira é uma tela de
 *      planejamento; entre duas séries ninguém precisa dela.
 *   2. **A série ativa é a única aberta.** As feitas viram uma linha com o que
 *      foi levantado — que é o que se consulta — e as futuras, uma linha só.
 *   3. **O descanso começa sozinho.** Ninguém aperta "iniciar descanso": você
 *      termina a série, e o relógio já está correndo. Ele é calculado pelo
 *      horário de término, então continua certo com a tela apagada.
 *
 * O registro sai pela mesma rota do formulário antigo (`/api/strength/log`),
 * com as mesmas séries — a progressão de carga não sabe por qual tela o atleta
 * entrou, e não deveria mesmo saber.
 */
import { useDeviceAccount } from "@/components/layout/DeviceAccount";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X, Check, Minus, Plus, ChevronLeft, ChevronRight, Loader2, Timer, Flag,
} from "lucide-react";
import { ExerciseImage } from "@/components/coach/ExerciseImage";
import { exerciseById } from "@/lib/exercises";
import { haptic } from "@/lib/haptics";
import {
  exerciseComplete, loggableSets, mergeStoredRunner, nextPendingIndex, parseStoredRunner,
  reconcileLate, restRemaining, runnerProgress, runnerStorageKey, seedRunnerState,
  type RunnerState,
} from "@/lib/session-runner";
import type { StrengthSession } from "@/lib/strength-builder";
import type { ProgressionAdvice } from "@/lib/strength-progression";

export function SessionRunner({ session, date, onClose, onLogged }: {
  session: StrengthSession;
  /** O dia da sessão (YYYY-MM-DD) — é a chave do registro e do rascunho. */
  date: string;
  onClose: () => void;
  /** Disparado depois de um registro salvo, para a tela de trás se atualizar. */
  onLogged?: () => void;
}) {
  const exercises = session.exercises;
  const accountId = useDeviceAccount();
  const draftKey = accountId ? runnerStorageKey(accountId, date) : null;
  const [state, setState] = useState<RunnerState>(() => seedRunnerState(session));
  const [index, setIndex] = useState(0);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);
  const startedAt = useRef(Date.now());
  const lastSetAt = useRef<number | null>(null);
  /** O estado já comprometido, para quem precisa dele fora de um render. */
  const latest = useRef(state);
  useEffect(() => { latest.current = state; }, [state]);

  /*
    Carga sugerida e rascunho chegam juntos, antes de qualquer toque.

    A sugestão vem do histórico (`advice.weightKg`): ninguém deveria redigitar o
    que levantou na semana passada. O rascunho vem do armazenamento local, e é
    o que faz uma ligação no meio do treino não custar três exercícios.
  */
  useEffect(() => {
    let cancelled = false;
    const ids = exercises.map(e => e.exerciseId).join(",");
    fetch(`/api/strength/log?exercises=${ids}`, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return;
        const history = (d?.history ?? {}) as Record<string, { advice?: ProgressionAdvice }>;
        const advice: Record<string, ProgressionAdvice | undefined> = {};
        for (const [id, entry] of Object.entries(history)) advice[id] = entry.advice;
        apply(seedRunnerState(session, advice));
      })
      .catch(() => { if (!cancelled) apply(seedRunnerState(session)); });

    function apply(seeded: RunnerState) {
      let stored: RunnerState | null = null;
      try {
        const raw = draftKey ? localStorage.getItem(draftKey) : null;
        stored = parseStoredRunner(raw, date);
        if (stored && raw) {
          const times = JSON.parse(raw);
          if (Number.isFinite(times.startedAt)) startedAt.current = times.startedAt;
          if (Number.isFinite(times.lastSetAt)) lastSetAt.current = times.lastSetAt;
        }
      } catch { /* sem rascunho */ }
      // `reconcileLate`: quem marcou uma série antes da rede responder não a perde.
      const merged = reconcileLate(latest.current, mergeStoredRunner(seeded, stored));
      setState(merged);
      hydrated.current = true;
      // Volta para onde o treino parou, não para o começo dele.
      const pending = nextPendingIndex(exercises, merged, exercises.length - 1);
      if (pending != null) setIndex(pending);
    }

    return () => { cancelled = true; };
  }, [date, draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* O rascunho é gravado a cada mudança — e nunca por cima do que ainda não leu. */
  useEffect(() => {
    if (!hydrated.current) return;
    try { if (draftKey) localStorage.setItem(draftKey, JSON.stringify({ date, state, startedAt: startedAt.current, lastSetAt: lastSetAt.current })); } catch { /* modo privado */ }
  }, [state, date, draftKey]);

  /* Um tique por segundo, só enquanto há descanso correndo. */
  useEffect(() => {
    if (restEndsAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [restEndsAt]);

  const falta = restRemaining(restEndsAt, now);
  useEffect(() => {
    if (restEndsAt != null && falta === 0) haptic("success");
  }, [falta, restEndsAt]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  const progress = useMemo(() => runnerProgress(state), [state]);
  const current = exercises[index];
  const sets = state[current?.exerciseId] ?? [];
  /** A série aberta é a primeira não marcada — as outras são consulta. */
  const activeSet = sets.findIndex(s => !s.done);

  const edit = useCallback((i: number, field: "weightKg" | "reps" | "rir", value: string) => {
    setState(prev => {
      const list = [...(prev[current.exerciseId] ?? [])];
      list[i] = { ...list[i], [field]: value };
      return { ...prev, [current.exerciseId]: list };
    });
  }, [current?.exerciseId]);

  function completeSet(i: number) {
    lastSetAt.current = Date.now();
    haptic("tap");
    const list = [...(state[current.exerciseId] ?? [])];
    list[i] = { ...list[i], done: true };
    const next = { ...state, [current.exerciseId]: list };
    setState(next);

    /*
      A última série do exercício não pede descanso: pede o próximo exercício.
      Deixar o relógio de 90 s correndo ali é o app pedindo para esperar por
      nada enquanto o atleta já está andando para o outro aparelho.
    */
    if (list.every(s => s.done)) {
      setRestEndsAt(null);
      const pending = nextPendingIndex(exercises, next, index);
      if (pending != null) setIndex(pending);
    } else {
      setRestEndsAt(Date.now() + current.restSeconds * 1000);
      setNow(Date.now());
    }
  }

  function undoSet(i: number) {
    setState(prev => {
      const list = [...(prev[current.exerciseId] ?? [])];
      list[i] = { ...list[i], done: false };
      return { ...prev, [current.exerciseId]: list };
    });
  }

  async function finish() {
    const payload = loggableSets(state);
    if (payload.length === 0) {
      setError("Marque ao menos uma série antes de terminar.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/strength/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date, sets: payload, exercises: exercises.map(e => e.exerciseId), recordActivity: true, keep: false,
          startedAt: new Date(startedAt.current).toISOString(),
          finishedAt: new Date(lastSetAt.current ?? Date.now()).toISOString(),
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setError(d?.error ?? "Não foi possível salvar o treino.");
        return;
      }
      haptic("success");
      // O rascunho existe para sobreviver ao treino, não ao registro dele.
      try { if (draftKey) localStorage.removeItem(draftKey); } catch { /* nada a limpar */ }
      onLogged?.();
      onClose();
    } catch {
      setError("Falha na conexão. O que você marcou continua aqui.");
    } finally {
      setSaving(false);
    }
  }

  if (!current) return null;

  const tudoFeito = exercises.every(e => exerciseComplete(state, e.exerciseId));
  const terminar = tudoFeito || index === exercises.length - 1;
  const repsAlvo = current.timeBased
    ? `${current.reps[0]}-${current.reps[1]}s`
    : current.reps[0] === current.reps[1] ? `${current.reps[0]}` : `${current.reps[0]}-${current.reps[1]}`;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-surface-900">
      {/* ── Cabeçalho: onde estou, e quanto falta ─────────────────────────── */}
      <header className="shrink-0 border-b border-surface-700 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-surface-400 transition-colors hover:text-surface-200"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-surface-500">
              Exercício {index + 1} de {exercises.length}
            </p>
            <p className="text-xs text-surface-500">
              {progress.done} de {progress.total} séries
            </p>
          </div>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-700">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
          />
        </div>
      </header>

      {/* ── O exercício ───────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-lg space-y-4">
          <div className="flex items-center gap-3">
            <ExerciseImage
              exercise={{ name: current.name, image: exerciseById(current.exerciseId)?.image, exerciseId: current.exerciseId }}
              size="md"
              zoomable
            />
            <div className="min-w-0">
              <h2 className="text-xl font-bold leading-tight text-surface-100">{current.name}</h2>
              <p className="mt-0.5 text-sm text-surface-400">
                {sets.length} × {repsAlvo}
                {current.unilateral && " · cada lado"}
                <span className="text-surface-500"> · RIR {current.rir}</span>
              </p>
            </div>
          </div>

          {current.cue && (
            <p className="rounded-xl bg-surface-800/60 px-3 py-2 text-sm leading-relaxed text-surface-400">
              {current.cue}
            </p>
          )}

          <div className="space-y-2">
            {sets.map((set, i) => (
              <SetRow
                key={i}
                numero={i + 1}
                set={set}
                ativa={i === activeSet}
                timeBased={current.timeBased}
                onEdit={(field, value) => edit(i, field, value)}
                onDone={() => completeSet(i)}
                onUndo={() => undoSet(i)}
              />
            ))}
          </div>

          {!terminar && progress.done > 0 && (
            <button type="button" onClick={finish} disabled={saving} className="btn-ghost w-full">
              <Flag className="h-4 w-4" /> Encerrar e salvar as séries feitas
            </button>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
          )}
        </div>
      </div>

      {/* ── Descanso ──────────────────────────────────────────────────────── */}
      {restEndsAt != null && (
        <RestBar
          falta={falta}
          total={current.restSeconds}
          onAdd={() => setRestEndsAt(e => (e ?? Date.now()) + 15_000)}
          onSkip={() => setRestEndsAt(null)}
        />
      )}

      {/* ── Navegação e fim ───────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-surface-700 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <button
            type="button"
            onClick={() => setIndex(i => Math.max(0, i - 1))}
            disabled={index === 0}
            aria-label="Exercício anterior"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-surface-700 text-surface-400 transition-colors disabled:opacity-30 enabled:hover:text-surface-200"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/*
            Um botão central, nunca dois caminhos para a mesma coisa. Enquanto
            ele diz "próximo exercício", a seta da direita seria o mesmo toque
            duas vezes; quando vira "terminar", ela volta — aí ela é a única
            forma de continuar circulando pelos exercícios.
          */}
          {terminar ? (
            <>
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="btn-primary min-h-[48px] flex-1 justify-center"
              >
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</>
                  : <><Flag className="h-4 w-4" /> Terminar treino</>}
              </button>
              <button
                type="button"
                onClick={() => setIndex(i => Math.min(exercises.length - 1, i + 1))}
                disabled={index === exercises.length - 1}
                aria-label="Próximo exercício"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-surface-700 text-surface-400 transition-colors disabled:opacity-30 enabled:hover:text-surface-200"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIndex(i => Math.min(exercises.length - 1, i + 1))}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-700 text-sm font-semibold text-surface-200 transition-colors hover:bg-surface-600"
            >
              Próximo exercício <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

/**
 * Uma série.
 *
 * Fechada quando já foi feita — vira a linha de consulta "40 kg × 8", que é o
 * que se olha para decidir a próxima. Aberta só a ativa, com os números grandes
 * e os passos de carga no polegar: digitar num teclado numérico de pé, suado,
 * com o telefone numa mão só, é o tipo de coisa que faz alguém desistir de
 * registrar.
 */
function SetRow({ numero, set, ativa, timeBased, onEdit, onDone, onUndo }: {
  numero: number;
  set: { weightKg: string; reps: string; rir: string; done: boolean };
  ativa: boolean;
  timeBased: boolean;
  onEdit: (field: "weightKg" | "reps" | "rir", value: string) => void;
  onDone: () => void;
  onUndo: () => void;
}) {
  if (set.done) {
    return (
      <button
        type="button"
        onClick={onUndo}
        className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-green-500/25 bg-green-500/[0.06] px-3 text-left"
      >
        <Check className="h-4 w-4 shrink-0 text-green-400" />
        <span className="text-sm font-semibold text-surface-300">Série {numero}</span>
        <span className="ml-auto font-mono text-sm tabular-nums text-surface-200">
          {set.weightKg ? `${set.weightKg} kg` : "peso do corpo"}
          <span className="text-surface-500"> × </span>
          {set.reps || "—"}{timeBased ? "s" : ""}
        </span>
      </button>
    );
  }

  if (!ativa) {
    return (
      <div className="flex min-h-[48px] items-center gap-3 rounded-xl border border-surface-700/60 px-3">
        <span className="text-sm font-medium text-surface-500">Série {numero}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-brand-500/40 bg-brand-500/[0.05] p-3">
      <p className="text-sm font-bold text-surface-100">Série {numero}</p>

      <div className="grid grid-cols-2 gap-3">
        <Stepper
          label="Carga (kg)"
          value={set.weightKg}
          step={2.5}
          onChange={v => onEdit("weightKg", v)}
        />
        <Stepper
          label={timeBased ? "Segundos" : "Repetições"}
          value={set.reps}
          step={1}
          onChange={v => onEdit("reps", v)}
        />
      </div>

      <button
        type="button"
        onClick={onDone}
        className="btn-primary min-h-[52px] w-full justify-center text-base"
      >
        <Check className="h-5 w-5" /> Série feita
      </button>
    </div>
  );
}

/** Número grande, com os passos no polegar e o teclado ainda disponível. */
function Stepper({ label, value, step, onChange }: {
  label: string;
  value: string;
  step: number;
  onChange: (value: string) => void;
}) {
  const bump = (dir: 1 | -1) => {
    const atual = Number((value || "0").replace(",", "."));
    const base = Number.isFinite(atual) ? atual : 0;
    const next = Math.max(0, Math.round((base + dir * step) * 100) / 100);
    onChange(next === 0 && dir === -1 ? "" : String(next));
  };

  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-surface-500">
        {label}
      </label>
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => bump(-1)}
          aria-label={`Diminuir ${label}`}
          className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-700 text-surface-300 transition-colors hover:bg-surface-600"
        >
          <Minus className="h-4 w-4" />
        </button>
        {/* Sem `placeholder`: um travessão entre dois botões vira um terceiro
            botão aos olhos, e o da esquerda já é um menos. */}
        <input
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-label={label}
          className="h-12 min-w-0 flex-1 rounded-lg border border-surface-700 bg-surface-800 text-center font-mono text-lg font-bold tabular-nums text-surface-100 outline-none focus:border-brand-500"
        />
        <button
          type="button"
          onClick={() => bump(1)}
          aria-label={`Aumentar ${label}`}
          className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-700 text-surface-300 transition-colors hover:bg-surface-600"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * O descanso.
 *
 * Fica no rodapé porque é informação periférica: o atleta olha, vê quanto
 * falta, e guarda o telefone. Vira verde no zero em vez de sumir — quem voltou
 * do bolso depois de dois minutos precisa ver que o tempo passou, não um espaço
 * vazio onde havia um relógio.
 */
function RestBar({ falta, total, onAdd, onSkip }: {
  falta: number;
  total: number;
  onAdd: () => void;
  onSkip: () => void;
}) {
  const acabou = falta === 0;
  const mm = Math.floor(falta / 60);
  const ss = String(falta % 60).padStart(2, "0");

  return (
    <div className={`shrink-0 border-t px-4 py-2.5 transition-colors ${
      acabou ? "border-green-500/30 bg-green-500/10" : "border-surface-700 bg-surface-800"
    }`}>
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <Timer className={`h-4 w-4 shrink-0 ${acabou ? "text-green-400" : "text-surface-400"}`} />
        <span className={`font-mono text-2xl font-bold tabular-nums ${acabou ? "text-green-300" : "text-surface-100"}`}>
          {acabou ? "Pode ir" : `${mm}:${ss}`}
        </span>
        <span className="hidden text-xs text-surface-500 sm:inline">descanso de {total}s</span>
        <div className="ml-auto flex items-center gap-1">
          {!acabou && (
            <button
              type="button"
              onClick={onAdd}
              className="min-h-[44px] rounded-lg px-3 text-xs font-semibold text-surface-300 transition-colors hover:text-brand-300"
            >
              +15s
            </button>
          )}
          <button
            type="button"
            onClick={onSkip}
            className="min-h-[44px] rounded-lg px-3 text-xs font-semibold text-surface-400 transition-colors hover:text-surface-200"
          >
            {acabou ? "Fechar" : "Pular"}
          </button>
        </div>
      </div>
    </div>
  );
}
