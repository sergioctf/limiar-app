"use client";

import { useEffect, useState } from "react";
import { DebriefHeader, DebriefMetrics, DebriefObservation, EffortSelector, debriefChoice } from "./DebriefUI";
import { ACTIVITY_REASONS, activityComparison, type ActivityFeedback, type ActivityFeedbackItem } from "@/lib/activity-feedback";
import { PERCEPTIONS, type Perception } from "@/lib/debrief";
import { haptic } from "@/lib/haptics";
import { SPORTS, toSportKey } from "@/lib/sports";
import { formatDistanceKm, secondsToReadable } from "@/lib/utils";

export function ActivityFeedbackForm({ item, onSaved, onLater, onNever, onClose }: {
  item: ActivityFeedbackItem;
  onSaved: (feedback: ActivityFeedback) => void;
  onLater?: () => void;
  onNever?: () => void;
  onClose?: () => void;
}) {
  const { activity } = item;
  const saved = item.feedback?.status === "answered" ? item.feedback : null;
  const [step, setStep] = useState(saved ? "result" : onLater ? "invite" : "effort");
  const [perception, setPerception] = useState<Perception | null>(saved?.perception ?? null);
  const [rpe, setRpe] = useState<number | null>(saved?.rpe ?? null);
  const [reason, setReason] = useState<ActivityFeedback["reason"]>(saved?.reason ?? null);
  const [note, setNote] = useState(saved?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState<"listening" | "thinking" | null>(null);

  const plan = item.feedback ? item.feedback.planned : item.planned;
  const comparison = activityComparison(activity, plan);
  const sport = toSportKey(activity.sport_type);
  const label = sport ? SPORTS[sport].label : activity.sport_type;
  const actual = [
    activity.distance_m ? sport === "natacao" ? `${activity.distance_m.toLocaleString("pt-BR")} m` : formatDistanceKm(activity.distance_m / 1000) : null,
    activity.duration_seconds ? secondsToReadable(activity.duration_seconds) : null,
  ].filter(Boolean).join(" · ");
  const target = plan?.distance_km ? sport === "natacao" ? `${Math.round(plan.distance_km * 1000)} m` : formatDistanceKm(plan.distance_km)
    : plan?.duration_min ? `${plan.duration_min} min` : plan?.label;

  async function save() {
    if (!perception || !reason || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/activity-feedback", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId: activity.id, status: "answered", perception, rpe, reason, note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.feedback) throw new Error(data?.error ?? "Não foi possível salvar.");
      onSaved(data.feedback);
      setStep("result");
      haptic("success");
    } catch (err) {
      setError(err instanceof TypeError ? "Sem conexão. Suas respostas continuam aqui."
        : err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  const title = step === "result" ? "Feedback registrado" : step === "invite" ? "Treino concluído"
    : step === "context" ? "O que aconteceu no treino?" : "Como foi seu treino?";

  return (
    <div className="space-y-4">
      <DebriefHeader title={title} subtitle={activity.name && activity.name !== label ? `${label} · ${activity.name}` : label}
        state={busy || voice === "thinking" ? "thinking" : voice === "listening" ? "listening" : step === "result" ? "success" : "idle"}>
        <DebriefMetrics actual={actual} planned={target} />
      </DebriefHeader>
      {step === "invite" && (
        <div className="space-y-2">
          <p className="text-sm text-surface-400">Conte como seu corpo respondeu. Sua percepção fica no Histórico.</p>
          <button type="button" onClick={() => setStep("effort")} className="btn-primary w-full">Avaliar treino</button>
        </div>
      )}
      {step === "effort" && (
        <div className="limiar-enter space-y-4">
          <EffortSelector perception={perception} rpe={rpe} onPerception={setPerception} onRpe={setRpe} />
          <button type="button" disabled={!perception} onClick={() => setStep("context")} className="btn-primary w-full">Continuar</button>
        </div>
      )}
      {step === "context" && (
        <div className="limiar-enter space-y-4">
          <fieldset disabled={busy}>
            <legend className="mb-2 text-sm font-medium text-surface-200">
              {comparison?.question ?? (perception === "heavy" ? "O que pesou neste treino?" : "Algo influenciou este treino?")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(ACTIVITY_REASONS) as [NonNullable<ActivityFeedback["reason"]>, string][]).map(([key, name]) => (
                <button key={key} type="button" aria-pressed={reason === key} onClick={() => setReason(key)}
                  className={debriefChoice(reason === key)}>{name}</button>
              ))}
            </div>
          </fieldset>
          <DebriefObservation note={note} onNote={setNote} onVoiceState={setVoice} disabled={busy} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep("effort")} className="btn-ghost" disabled={busy}>Voltar</button>
            <button type="button" onClick={() => void save()} disabled={!reason || busy || voice != null} className="btn-primary flex-1">
              {busy ? "Registrando…" : "Salvar feedback"}
            </button>
          </div>
        </div>
      )}
      {step === "result" && saved && (
        <div className="limiar-enter space-y-3 text-sm" aria-live="polite">
          <div className="space-y-1">
            <p className="font-semibold text-surface-100">Seu feedback</p>
            {saved.perception && <p>{PERCEPTIONS[saved.perception]}{saved.rpe != null ? ` · PSE ${saved.rpe}/10` : ""}</p>}
            {saved.reason && saved.reason !== "as_expected" && <p className="text-surface-400">{ACTIVITY_REASONS[saved.reason]}</p>}
            {saved.note && <p className="whitespace-pre-wrap text-surface-300">{saved.note}</p>}
          </div>
          <div className="rounded-2xl border border-surface-700 bg-surface-800 p-4">
            <p className="limiar-kicker">Leitura do Treinador</p>
            <p className="mt-1">{comparison?.summary ?? "Faltam dados para comparar este registro com o plano."}</p>
            {saved.reason === "discomfort" && <p className="mt-2 text-surface-400">Considere como está se sentindo antes da próxima sessão. Se o incômodo persistir ou piorar, procure orientação profissional.</p>}
            <p className="mt-2 text-surface-400">O feedback foi guardado no Histórico. Plano mantido.</p>
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

export function ActivityFeedbackCard({ activityId }: { activityId: string }) {
  const [item, setItem] = useState<ActivityFeedbackItem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/activity-feedback?activityId=${encodeURIComponent(activityId)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "Não foi possível abrir o Debrief.");
        setItem(data?.items?.[0] ?? null);
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activityId, retry]);

  if (loading) return <p role="status" className="text-sm text-surface-500">Carregando feedback…</p>;
  if (error) return <div className="card p-4 text-sm"><p role="alert">{error}</p><button type="button" className="btn-ghost" onClick={() => setRetry(n => n + 1)}>Tentar novamente</button></div>;
  if (!item) return null;

  return (
    <section className="card p-4" aria-label="Seu feedback do treino">
      <ActivityFeedbackForm key={item.activity.id} item={item}
        onSaved={feedback => setItem(current => current ? { ...current, feedback } : current)} />
    </section>
  );
}
