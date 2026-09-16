"use client";

/**
 * The single question the coach asks about a week.
 *
 * It only appears when the plan would otherwise shrink and nobody knows why —
 * or when two broken weeks in a row stopped being an interruption. Everything
 * else the coach decides on its own: progression week to week is automatic, and
 * a week the check-ins already explained is held and simply reported.
 */
import { useEffect, useState } from "react";
import type { ShortfallReason, WeekReading } from "@/lib/week-reading";

interface Payload {
  weekStart?: string;
  reading?: WeekReading | null;
  question?: { title: string; options: Array<{ value: ShortfallReason; label: string }> } | null;
}

export function WeekQuestionCard() {
  const [data, setData] = useState<Payload | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<ShortfallReason | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/coach/week-answer", { cache: "no-store", signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(payload => setData(payload))
      // A question is a nudge, not a duty: if it cannot be loaded, stay quiet.
      .catch(() => {});
    return () => controller.abort();
  }, []);

  async function answer(reason: ShortfallReason) {
    if (busy || !data?.weekStart) return;
    setBusy(reason); setError("");
    try {
      const response = await fetch("/api/coach/week-answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: data.weekStart, reason }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível guardar sua resposta.");
      setSaved(
        reason === "life"
          ? body?.nextWeekKm
            ? `Anotado: foi a rotina, não o seu condicionamento. A próxima semana segue em ${body.nextWeekKm} km.`
            : "Anotado: foi a rotina, não o seu condicionamento. O volume não foi reduzido."
          : reason === "body"
            ? body?.nextWeekKm
              ? `Anotado. A próxima semana parte do que você fez: ${body.nextWeekKm} km.`
              : "Anotado. A próxima semana parte do que você fez, sem forçar a volta."
            : body?.nextWeekKm
              ? `Anotado. Reduzimos para o que cabe: ${body.nextWeekKm} km na próxima semana.`
              : "Anotado. O plano passa a partir do que você fez.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar sua resposta.");
    } finally {
      setBusy(null);
    }
  }

  if (saved) {
    return (
      <section className="card p-4 sm:p-5 space-y-1" aria-label="Resposta registrada">
        <p className="text-xs text-brand-400 font-semibold">SEU TREINADOR · SEMANA PASSADA</p>
        <p className="text-sm" aria-live="polite">{saved}</p>
        <p className="text-xs text-surface-400">A semana em andamento não é reescrita; o ajuste vale para a próxima.</p>
      </section>
    );
  }

  if (!data?.question || !data.reading) return null;

  return (
    <section className="card p-4 sm:p-5 space-y-3" aria-label="Pergunta sobre a semana passada">
      <div>
        <p className="text-xs text-brand-400 font-semibold">SEU TREINADOR · SEMANA PASSADA</p>
        <h2 className="font-semibold mt-1">{data.reading.headline}</h2>
        <p className="text-sm text-surface-400 mt-1">{data.reading.detail}</p>
      </div>
      <p className="text-sm font-medium">{data.question.title}</p>
      <div className="flex flex-wrap gap-2">
        {data.question.options.map(option => (
          <button
            key={option.value}
            type="button"
            disabled={busy !== null}
            onClick={() => answer(option.value)}
            className="rounded-xl border border-surface-600 px-3 py-2 min-h-[44px] text-sm transition-colors hover:border-brand-400 disabled:opacity-50"
          >
            {busy === option.value ? "Salvando…" : option.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </section>
  );
}
