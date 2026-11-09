"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TestDayQuestion } from "@/components/coach/TestDayQuestion";
import { DebriefHeader, DebriefMetrics, DebriefObservation, EffortSelector, debriefChoice } from "@/components/debrief/DebriefUI";
import { compareSessions, executionDiffers, parseProposal, parsedLabel, VERDICT_LABEL } from "@/lib/session-adapt";
import { legacyEffort, perceptionOf, PERCEPTIONS, type Perception } from "@/lib/debrief";
import { haptic } from "@/lib/haptics";
import { formatDistanceKm, secondsToReadable } from "@/lib/utils";
import {
  EXECUTIONS, VERY_HARD, contextQuestion, contextLabel, evaluateRunFeedback, type Execution,
  type FeedbackItem, type RunContext, type RunFeedback,
} from "@/lib/run-feedback";

export interface SavedFeedback {
  feedback: RunFeedback;
  lightened: string[];
}

type Step = "invite" | "effort" | "context" | "result";

export function RunFeedbackForm({ item, onSaved, onLater, onNever, onClose, lightened = [] }: {
  item: FeedbackItem;
  onSaved: (saved: SavedFeedback) => void;
  onLater?: () => void;
  onNever?: () => void;
  onClose?: () => void;
  lightened?: string[];
}) {
  const router = useRouter();
  const feedback = item.feedback?.status === "answered" ? item.feedback : null;
  const [step, setStep] = useState<Step>(feedback ? "result" : onLater ? "invite" : "effort");
  const [effort, setEffort] = useState<number | null>(feedback?.effort ?? null);
  const [perception, setPerception] = useState(feedback?.perception ?? perceptionOf(feedback?.effort ?? null));
  const [rpe, setRpe] = useState<number | null>(feedback?.rpe ?? null);
  const [context, setContext] = useState<RunContext | null>(feedback?.context ?? null);
  const [reduce, setReduce] = useState<boolean | null>(feedback?.reduce_requested ?? null);
  const [note, setNote] = useState(feedback?.note ?? "");
  const [execution, setExecution] = useState<Execution | null>(feedback?.execution ?? null);
  const [executedText, setExecutedText] = useState(feedback?.executed_text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState<"listening" | "thinking" | null>(null);

  const planned = item.feedback ? item.feedback.planned : item.planned;
  const askExecution = Boolean(planned) && (executionDiffers(planned, item.run) || feedback?.execution != null);
  const parsed = execution && execution !== "as_planned" && executedText.trim() ? parseProposal(executedText) : null;
  const parsedName = parsed ? parsedLabel(parsed) : null;
  const comparison = planned && parsed?.kind && parsedName && execution === "adapted"
    ? compareSessions(planned, parsed.kind, parsedName).verdict : null;
  const question = contextQuestion(effort);
  const tooHeavy = effort === VERY_HARD && context === "session_too_hard";
  const alreadyLightened = feedback?.reduce_requested === true;
  const ready = perception != null && effort != null && context != null && (!tooHeavy || reduce != null);
  const changes = feedback?.adjusted_sessions ?? lightened;
  const analysis = evaluateRunFeedback(item);
  const target = planned?.distance_km;
  const ratio = target && target > 0 ? item.run.distance_km / target : null;
  const executionQuestion = ratio != null && ratio > 1.1 ? "A distância extra foi intencional?"
    : ratio != null && ratio < .9 ? "O treino terminou antes do previsto. Você mudou a sessão?"
    : "O treino ficou diferente da referência. Como você o executou?";

  function pickEffort(value: Perception, score: number | null) {
    setPerception(value);
    setRpe(score);
    const level = legacyEffort(value, score);
    setEffort(level);
    if (context && !contextQuestion(level).options.some(([key]) => key === context)) setContext(null);
    if (level !== VERY_HARD) setReduce(null);
    haptic();
  }

  async function save() {
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/run-feedback", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: item.run.id, status: "answered", effort, perception, rpe, context, note,
          ...(askExecution && execution ? { execution, executedText: execution === "as_planned" ? undefined : executedText } : {}),
          ...(tooHeavy ? { reduce } : {}),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.feedback) throw new Error(data?.error ?? "Não foi possível salvar.");
      const changed = Array.isArray(data.lightened) ? data.lightened : [];
      onSaved({ feedback: data.feedback, lightened: changed });
      setStep("result");
      haptic("success");
      if (changed.length) router.refresh();
    } catch (err) {
      setError(err instanceof TypeError ? "Sem conexão. Suas respostas continuam aqui."
        : err instanceof Error ? err.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const resultPerception = feedback?.perception ?? perceptionOf(feedback?.effort ?? null);
  const title = step === "result" ? "Feedback registrado"
    : step === "invite" ? "Treino concluído" : step === "context" ? "O que aconteceu no treino?" : "Como foi seu treino?";

  return (
    <div className="space-y-4">
      <DebriefHeader state={busy || voice === "thinking" ? "thinking" : voice === "listening" ? "listening" : step === "result" ? "success" : step === "invite" ? "idle" : "active"}
        title={title} subtitle={`Corrida · ${item.run.name}`}>
        <DebriefMetrics actual={[formatDistanceKm(item.run.distance_km), item.run.duration_seconds ? secondsToReadable(item.run.duration_seconds) : null].filter(Boolean).join(" · ")}
          planned={target ? formatDistanceKm(target) : planned?.label} />
      </DebriefHeader>

      {step === "invite" && (
        <div className="space-y-2">
          <p className="text-sm text-surface-400">Como seu corpo respondeu hoje? Leva poucos toques.</p>
          <button type="button" className="btn-primary w-full" onClick={() => setStep("effort")}>Avaliar treino</button>
        </div>
      )}

      {step === "effort" && (
        <div className="limiar-enter space-y-4">
          <TestDayQuestion runDate={item.run.date} />
          <EffortSelector perception={perception} rpe={rpe}
            onPerception={value => pickEffort(value, rpe)}
            onRpe={value => perception ? pickEffort(perception, value) : setRpe(value)} />
          {askExecution && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium text-surface-200">{executionQuestion}</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(EXECUTIONS) as [Execution, string][]).map(([value, label]) => (
                  <button type="button" key={value} aria-pressed={execution === value} className={debriefChoice(execution === value)}
                    onClick={() => setExecution(value)}>{label}</button>
                ))}
              </div>
            </fieldset>
          )}
          <button type="button" disabled={perception == null || (askExecution && !execution)} onClick={() => setStep("context")} className="btn-primary w-full">Continuar</button>
        </div>
      )}

      {step === "context" && (
        <div className="limiar-enter space-y-4">
          {askExecution && execution && execution !== "as_planned" && (
            <label className="block text-sm font-medium text-surface-200">
              O que você fez? <span className="text-surface-500">(opcional)</span>
              <input className="input mt-2 w-full" maxLength={300} value={executedText} disabled={busy}
                placeholder="Ex.: 2 km leve, 8 × 400 m" onChange={e => setExecutedText(e.target.value)} />
              {parsedName && <span className="mt-1 block text-xs text-surface-400">Entendi: {parsedName}{comparison ? ` · ${VERDICT_LABEL[comparison].toLowerCase()} do previsto` : ""}</span>}
            </label>
          )}
          <fieldset disabled={busy} className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-surface-200">{question.title}</legend>
            <div className="flex flex-wrap gap-2">
              {question.options.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={context === key} className={debriefChoice(context === key)}
                  onClick={() => { setContext(key); if (key !== "session_too_hard") setReduce(null); }}>{label}</button>
              ))}
            </div>
          </fieldset>
          {tooHeavy && (
            <fieldset disabled={busy || alreadyLightened} className="limiar-feature space-y-2 p-3">
              <legend className="px-1 text-sm font-medium text-surface-200">Ajuste sugerido</legend>
              <p className="text-sm text-surface-400">
                {alreadyLightened ? "Você já confirmou o ajuste neste feedback."
                  : "Quer encurtar em cerca de 15% as próximas corridas leves e o longão desta semana, e segurar o volume da próxima?"}
              </p>
              {!alreadyLightened && <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={reduce === true} onClick={() => setReduce(true)} className={debriefChoice(reduce === true)}>Confirmar ajuste</button>
                <button type="button" aria-pressed={reduce === false} onClick={() => setReduce(false)} className={debriefChoice(reduce === false)}>Manter plano</button>
              </div>}
            </fieldset>
          )}
          <DebriefObservation note={note} onNote={setNote} disabled={busy} onVoiceState={setVoice} />
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep("effort")} disabled={busy}>Voltar</button>
            <button type="button" disabled={busy || !ready || voice != null} onClick={() => void save()} className="btn-primary flex-1">
              {busy ? "Registrando…" : "Salvar feedback"}
            </button>
          </div>
        </div>
      )}

      {step === "result" && (
        <div className="limiar-enter space-y-3 text-sm" aria-live="polite">
          <div className="space-y-1">
            <p className="font-semibold text-surface-100">Seu feedback</p>
            {resultPerception && <p>{PERCEPTIONS[resultPerception]}{feedback?.rpe != null ? ` · PSE ${feedback.rpe}/10` : ""}</p>}
            {feedback?.context && feedback.context !== "none" && <p className="text-surface-400">{contextLabel(feedback.context, feedback.effort)}</p>}
            {feedback?.note && <p className="whitespace-pre-wrap text-surface-300">{feedback.note}</p>}
          </div>
          <div className="rounded-2xl border border-surface-700 bg-surface-800 p-4">
            <p className="limiar-kicker">Leitura do Treinador</p>
            <p className="mt-1 font-semibold text-surface-100">{analysis.title}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-surface-400">
              {analysis.evidence.map(text => <li key={text}>{text}</li>)}
            </ul>
          </div>
          <div className="rounded-2xl border border-surface-700 p-4">
            <p className="font-semibold text-surface-100">{feedback?.reduce_requested ? "Ajuste confirmado" : planned ? "Plano mantido" : "Sem comparação com o plano"}</p>
            <p className="mt-1 text-surface-400">{analysis.next}</p>
            {changes.length > 0 && <ul className="mt-2 list-disc pl-4">{changes.map(line => <li key={line}>{line}</li>)}</ul>}
          </div>
          <div className="flex flex-wrap gap-2">
            {onClose && <button type="button" onClick={onClose} className="btn-primary">Concluir</button>}
            <button type="button" onClick={() => setStep("effort")} className="btn-ghost">Editar respostas</button>
          </div>
        </div>
      )}

      {step !== "result" && onLater && (
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" disabled={busy} onClick={onLater} className="btn-ghost">Responder depois</button>
          {onNever && <button type="button" disabled={busy} onClick={onNever} className="btn-ghost">Dispensar</button>}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-surface-200">{error}</p>}
    </div>
  );
}
