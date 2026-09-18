"use client";

/**
 * The coach's question before today's session, when Saúde earns one.
 *
 * Two places, one decision (`/api/coach/today-check`):
 *   · the entry pop-up, at most once a day;
 *   · the Hoje card, where it stays until answered or the session is done.
 *
 * When the coach is asking, the question replaces the older "recuperação baixa"
 * swap buttons on the card — two ways of offering the same decision side by
 * side is the clutter this was meant to avoid.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse } from "lucide-react";
import type { TodayAnswer, TodayCheck } from "@/lib/today-check";
import type { WeeklyPlanDay } from "@/types";

export interface TodayCheckPayload {
  date: string;
  check: TodayCheck;
  answer: TodayAnswer | null;
  prompted: boolean;
}

export async function fetchTodayCheck(signal?: AbortSignal): Promise<TodayCheckPayload | null> {
  const response = await fetch("/api/coach/today-check", { cache: "no-store", signal });
  return response.ok ? (await response.json()) as TodayCheckPayload : null;
}

const DONE: Record<TodayAnswer, (day: WeeklyPlanDay | null) => string> = {
  keep: () => "Combinado, treino mantido. Se no aquecimento as pernas não responderem, encurtar continua valendo.",
  shorter: day => `Pronto: ${day?.label ?? "versão mais curta"} no lugar do previsto. O original fica guardado — dá para desfazer no card.`,
  easy: day => `Pronto: trocado por ${day?.label?.toLowerCase() ?? "rodagem leve"}. Um estímulo a menos não custa nada; um treino forte sem recuperação custa.`,
  tomorrow: () => "Pronto: o treino passou para amanhã, e amanhã veio para hoje.",
};

export function TodayCheckBody({
  payload, onAnswered, onLater, compact = false,
}: {
  payload: TodayCheckPayload;
  onAnswered?: (answer: TodayAnswer) => void;
  onLater?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<TodayAnswer | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const { check } = payload;

  async function answer(value: TodayAnswer) {
    setBusy(value); setError("");
    try {
      const response = await fetch("/api/coach/today-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: value }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível registrar a resposta.");
      setDone(DONE[value](data?.today ?? null));
      onAnswered?.(value);
      if (value !== "keep") router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar a resposta.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <HeartPulse className="w-4 h-4 mt-0.5 shrink-0 text-brand-400" />
        <div className="space-y-1">
          <p className={`${compact ? "text-xs" : "text-sm"} text-surface-300 leading-relaxed`}>{check.message}</p>
          {!done && check.question && <p className="text-sm font-semibold text-surface-100">{check.question}</p>}
        </div>
      </div>

      {done ? (
        <p className="text-sm text-surface-300 leading-relaxed" role="status">{done}</p>
      ) : (
        <div className="grid gap-2">
          {check.options.map(o => (
            <button
              key={o.value}
              type="button"
              disabled={busy != null}
              onClick={() => void answer(o.value)}
              className="min-h-[44px] rounded-xl border border-surface-600 px-3 text-left text-sm text-surface-200 hover:border-brand-400 disabled:opacity-60"
            >
              {busy === o.value ? "Ajustando…" : o.label}
            </button>
          ))}
          {onLater && (
            <button type="button" onClick={onLater} className="min-h-[44px] text-sm text-surface-500">
              Responder depois
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

/**
 * On the Hoje card: the question while it is open, a note when that is all the
 * signals earn, and otherwise whatever the card showed before (`children`).
 */
export function TodayCheckPanel({ children }: { children?: ReactNode }) {
  const [payload, setPayload] = useState<TodayCheckPayload | null>(null);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchTodayCheck(controller.signal).then(setPayload).catch(() => {});
    return () => controller.abort();
  }, []);

  const check = payload?.check;
  if (check?.action === "ask" && (!payload?.answer || answered)) {
    return (
      <div className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-3">
        <TodayCheckBody payload={payload!} compact onAnswered={() => setAnswered(true)} />
      </div>
    );
  }
  return (
    <>
      {check?.action === "note" && check.message && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-surface-400">
          <HeartPulse className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-400" />
          {check.message}
        </p>
      )}
      {children}
    </>
  );
}
