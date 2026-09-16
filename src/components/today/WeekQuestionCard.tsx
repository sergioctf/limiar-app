"use client";

/**
 * The single question the coach asks about a week.
 *
 * It only exists when the plan would otherwise shrink and nobody knows why —
 * or when two broken weeks in a row stopped being an interruption. Everything
 * else the coach decides on its own: progression week to week is automatic, and
 * a week the check-ins already explained is held and simply reported.
 *
 * On the Home it arrives as the entry pop-up (see EntryPrompt), never as a card
 * parked above the day. In the coach screen it waits inline, next to the plan it
 * changes, for whoever chose "Responder depois".
 */
import { useEffect, useState } from "react";
import type { ShortfallReason, WeekReading } from "@/lib/week-reading";

export interface WeekQuestionPayload {
  weekStart?: string;
  reading?: WeekReading | null;
  question?: { title: string; options: Array<{ value: ShortfallReason; label: string }> } | null;
}

export async function fetchWeekQuestion(signal?: AbortSignal): Promise<WeekQuestionPayload | null> {
  const response = await fetch("/api/coach/week-answer", { cache: "no-store", signal });
  return response.ok ? response.json() : null;
}

function confirmation(reason: ShortfallReason, nextWeekKm: number | null | undefined): string {
  if (reason === "life") {
    return nextWeekKm
      ? `Anotado: foi a rotina, não o seu condicionamento. A próxima semana segue em ${nextWeekKm} km.`
      : "Anotado: foi a rotina, não o seu condicionamento. O volume não foi reduzido.";
  }
  if (reason === "body") {
    return nextWeekKm
      ? `Anotado. A próxima semana parte do que você fez: ${nextWeekKm} km.`
      : "Anotado. A próxima semana parte do que você fez, sem forçar a volta.";
  }
  return nextWeekKm
    ? `Anotado. Reduzimos para o que cabe: ${nextWeekKm} km na próxima semana.`
    : "Anotado. O plano passa a partir do que você fez.";
}

export function WeekQuestionBody({
  payload, onLater, onClose,
}: {
  payload: WeekQuestionPayload;
  /** Pop-up only: leave it for the coach screen. */
  onLater?: () => void;
  /** Pop-up only: close after reading the confirmation. */
  onClose?: () => void;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<ShortfallReason | null>(null);
  const [error, setError] = useState("");

  async function answer(reason: ShortfallReason) {
    if (busy || !payload.weekStart) return;
    setBusy(reason); setError("");
    try {
      const response = await fetch("/api/coach/week-answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: payload.weekStart, reason }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível guardar sua resposta.");
      setSaved(confirmation(reason, body?.nextWeekKm));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar sua resposta.");
    } finally {
      setBusy(null);
    }
  }

  if (saved) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-brand-400 font-semibold">SEU TREINADOR · SEMANA PASSADA</p>
        <p className="text-sm" aria-live="polite">{saved}</p>
        <p className="text-xs text-surface-400">A semana em andamento não é reescrita; o ajuste vale para a próxima.</p>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-xl bg-brand-500 text-white px-4 min-h-[44px]">Fechar</button>
        )}
      </div>
    );
  }

  if (!payload.question || !payload.reading) return null;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-brand-400 font-semibold">SEU TREINADOR · SEMANA PASSADA</p>
        <h2 className="font-semibold mt-1">{payload.reading.headline}</h2>
        <p className="text-sm text-surface-400 mt-1">{payload.reading.detail}</p>
      </div>
      <p className="text-sm font-medium">{payload.question.title}</p>
      <div className="flex flex-wrap gap-2">
        {payload.question.options.map(option => (
          <button key={option.value} type="button" disabled={busy !== null} onClick={() => answer(option.value)}
            className="rounded-xl border border-surface-600 px-3 py-2 min-h-[44px] text-sm transition-colors hover:border-brand-400 disabled:opacity-50">
            {busy === option.value ? "Salvando…" : option.label}
          </button>
        ))}
      </div>
      {onLater && (
        <button type="button" disabled={busy !== null} onClick={onLater} className="text-sm text-surface-400 min-h-[44px]">
          Responder depois
        </button>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

/** Inline version, in the coach screen next to the plan. */
export function WeekQuestionCard() {
  const [payload, setPayload] = useState<WeekQuestionPayload | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // A question is a nudge, not a duty: if it cannot be loaded, stay quiet.
    fetchWeekQuestion(controller.signal).then(setPayload).catch(() => {});
    return () => controller.abort();
  }, []);

  if (!payload?.question) return null;
  return (
    <section className="card p-4 sm:p-5" aria-label="Pergunta sobre a semana passada">
      <WeekQuestionBody payload={payload} />
    </section>
  );
}
