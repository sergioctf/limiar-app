"use client";

/**
 * The post-run check-in, as one piece used in two places: the pop-up that
 * greets the athlete after a session, and the run's own page, where a check-in
 * left for later is answered.
 *
 * The questions branch only where the answer needs it:
 *
 *   1. How did it feel? (five levels)
 *   2. Anything to consider? — or, after "muito difícil", what made it so.
 *   3. Only after "o treino estava pesado demais": lighten the next sessions?
 *
 * "Difícil" opens nothing. A hard session that feels hard is the plan working.
 */
import { useState } from "react";
import Link from "next/link";
import { compareSessions, executionDiffers, parseProposal, parsedLabel, VERDICT_LABEL } from "@/lib/session-adapt";
import {
  EFFORTS, EXECUTIONS, VERY_HARD, contextQuestion, evaluateRunFeedback, type Execution,
  type FeedbackItem, type RunContext, type RunFeedback,
} from "@/lib/run-feedback";

export interface SavedFeedback {
  feedback: RunFeedback;
  /** Sessions that were shortened because the athlete asked. */
  lightened: string[];
}

const choice = "rounded-xl border px-3 py-2 min-h-[44px] text-sm transition-colors ";
const picked = (on: boolean) => choice + (on ? "border-brand-400 bg-brand-500/15" : "border-surface-600 hover:border-surface-500");

export function RunFeedbackForm({
  item, onSaved, onLater, onNever, onClose, lightened = [],
}: {
  item: FeedbackItem;
  onSaved: (saved: SavedFeedback) => void;
  /** Pop-up only: ask again on a later visit. */
  onLater?: () => void;
  /** Pop-up only: do not ask about this run again. */
  onNever?: () => void;
  /** Pop-up only: close after reading the assessment. */
  onClose?: () => void;
  lightened?: string[];
}) {
  const answered = item.feedback?.status === "answered";
  const [effort, setEffort] = useState<number | null>(answered ? item.feedback?.effort ?? null : null);
  const [context, setContext] = useState<RunContext | null>(answered ? item.feedback?.context ?? null : null);
  const [reduce, setReduce] = useState<boolean | null>(answered ? item.feedback?.reduce_requested ?? null : null);
  const [note, setNote] = useState(item.feedback?.note ?? "");
  const [execution, setExecution] = useState<Execution | null>(answered ? item.feedback?.execution ?? null : null);
  const [executedText, setExecutedText] = useState(item.feedback?.executed_text ?? "");

  // Asked only when the run looks clearly different from the plan — never as a
  // routine question. A session adapted beforehand is already known.
  const planned = item.feedback?.planned ?? item.planned;
  const askExecution = Boolean(planned) && (executionDiffers(planned, item.run) || item.feedback?.execution != null);
  const parsedExecuted = execution && execution !== "as_planned" && executedText.trim() ? parseProposal(executedText) : null;
  const executedLabel = parsedExecuted ? parsedLabel(parsedExecuted) : null;
  const executedVerdict = planned && parsedExecuted?.kind && executedLabel && execution === "adapted"
    ? compareSessions(planned, parsedExecuted.kind, executedLabel).verdict : null;
  const [editing, setEditing] = useState(!answered);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const question = contextQuestion(effort);
  const tooHeavy = effort === VERY_HARD && context === "session_too_hard";
  const alreadyLightened = item.feedback?.reduce_requested === true;
  const ready = effort != null && context != null && (!tooHeavy || reduce != null) && (!askExecution || execution != null);

  function chooseEffort(level: number) {
    setEffort(level);
    // Switching between "muito difícil" and the rest swaps the second question;
    // an answer to the old one must not survive into the new one.
    if (context && !contextQuestion(level).options.some(([key]) => key === context)) setContext(null);
    if (level !== VERY_HARD) setReduce(null);
  }

  function chooseContext(key: RunContext) {
    setContext(key);
    if (key !== "session_too_hard") setReduce(null);
  }

  async function save() {
    if (busy || !ready) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/run-feedback", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: item.run.id, status: "answered", effort, context, note,
          ...(askExecution && execution ? { execution, executedText: execution === "as_planned" ? undefined : executedText } : {}),
          ...(tooHeavy ? { reduce } : {}),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.feedback) {
        throw new Error(data?.error || "Não foi possível salvar. Confira sua conexão. Suas respostas continuam aqui.");
      }
      onSaved({ feedback: data.feedback, lightened: Array.isArray(data.lightened) ? data.lightened : [] });
      setEditing(false);
    } catch (e) {
      setError(e instanceof TypeError
        ? "Sem conexão. Suas respostas continuam aqui; tente salvar novamente."
        : e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const assessment = evaluateRunFeedback(item);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-brand-400 font-semibold">SEU TREINADOR · PÓS-TREINO</p>
        <h2 className="font-semibold mt-1">{editing ? "Como foi para você?" : assessment.title}</h2>
        <Link className="text-sm text-surface-400 underline" href={`/runs/${item.run.id}`}>
          {item.run.name} · {item.run.date.split("-").reverse().join("/")}
        </Link>
        <p className="text-sm text-surface-400 mt-1">
          {item.run.distance_km.toFixed(1).replace(".", ",")} km{item.run.avg_hr ? ` · FC média ${item.run.avg_hr} bpm` : ""}
        </p>
      </div>

      {editing ? (
        <>
          {askExecution && planned && (
            <fieldset disabled={busy} className="space-y-2">
              <legend className="text-sm font-medium mb-2">Estava previsto: {planned.label}. Como foi?</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(EXECUTIONS) as Array<[Execution, string]>).map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={execution === key}
                    onClick={() => setExecution(key)} className={picked(execution === key)}>
                    {label}
                  </button>
                ))}
              </div>
              {execution && execution !== "as_planned" && (
                <label className="block text-sm">
                  O que você fez? <span className="text-surface-500">(opcional)</span>
                  <input className="input mt-1 w-full" maxLength={300} value={executedText} disabled={busy}
                    placeholder="Ex.: 2 km de aquecimento, 8 × 400 m, 1 km de desaquecimento"
                    onChange={e => setExecutedText(e.target.value)} />
                  {executedLabel && (
                    <span className="mt-1 block text-xs text-surface-400">
                      Entendi: {executedLabel}{executedVerdict ? ` · ${VERDICT_LABEL[executedVerdict].toLowerCase()} do treino previsto` : ""}
                    </span>
                  )}
                </label>
              )}
            </fieldset>
          )}

          <fieldset disabled={busy} className="space-y-2">
            <legend className="text-sm font-medium mb-2">Como esse treino pareceu para você?</legend>
            <div className="flex flex-wrap gap-2">
              {EFFORTS.map((label, i) => (
                <button key={label} type="button" aria-pressed={effort === i + 1}
                  onClick={() => chooseEffort(i + 1)} className={picked(effort === i + 1)}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {effort != null && (
            <fieldset disabled={busy} className="space-y-2">
              <legend className="text-sm font-medium mb-2">{question.title}</legend>
              <div className="flex flex-wrap gap-2">
                {question.options.map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={context === key}
                    onClick={() => chooseContext(key)} className={picked(context === key)}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {tooHeavy && (
            <fieldset disabled={busy || alreadyLightened} className="space-y-2">
              <legend className="text-sm font-medium mb-2">Quer reduzir um pouco a carga dos próximos treinos?</legend>
              {alreadyLightened ? (
                <p className="text-sm text-surface-400">Os próximos treinos já foram aliviados a seu pedido.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" aria-pressed={reduce === true} onClick={() => setReduce(true)} className={picked(reduce === true)}>
                      Sim, reduzir um pouco
                    </button>
                    <button type="button" aria-pressed={reduce === false} onClick={() => setReduce(false)} className={picked(reduce === false)}>
                      Não, manter como está
                    </button>
                  </div>
                  <p className="text-xs text-surface-500">
                    Nada muda sem o seu sim. Se reduzir, as corridas leves e o longão restantes da semana ficam cerca de 15% mais curtos e a semana seguinte não aumenta.
                  </p>
                </>
              )}
            </fieldset>
          )}

          {effort != null && (
            <details open={Boolean(note)}>
              <summary className="text-sm cursor-pointer text-surface-400">Adicionar observação (opcional)</summary>
              <label className="block text-sm mt-2">
                <span className="sr-only">Sua observação</span>
                <textarea className="input mt-1 w-full" maxLength={300} rows={2} disabled={busy}
                  value={note} onChange={e => setNote(e.target.value)} />
              </label>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || !ready} onClick={save}
              className="rounded-xl bg-brand-500 text-white px-4 min-h-[44px] disabled:opacity-50">
              {busy ? "Salvando…" : "Ver feedback"}
            </button>
            {onLater && (
              <button type="button" disabled={busy} onClick={onLater} className="text-sm text-surface-400 min-h-[44px]">
                Responder depois
              </button>
            )}
            {onNever && (
              <button type="button" disabled={busy} onClick={onNever} className="text-xs text-surface-500 min-h-[44px] underline-offset-2 hover:underline">
                Não quero responder
              </button>
            )}
          </div>
        </>
      ) : (
        <div aria-live="polite" className="space-y-3 text-sm">
          {assessment.evidence.map(text => <p key={text}>{text}</p>)}
          {item.feedback?.note && <p className="text-surface-400">Sua observação: {item.feedback.note}</p>}
          <p className="rounded-xl bg-brand-500/10 p-3">{assessment.next}</p>
          {lightened.length > 0 && (
            <ul className="space-y-1 text-surface-300">
              {lightened.map(line => <li key={line}>{line}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            {onClose && (
              <button type="button" onClick={onClose} className="rounded-xl bg-brand-500 text-white px-4 min-h-[44px]">
                Fechar
              </button>
            )}
            <button type="button" className="text-brand-400 min-h-[44px]" onClick={() => setEditing(true)}>
              Editar respostas
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
