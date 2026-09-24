"use client";

/**
 * "Hoje eu não tenho uma hora."
 *
 * A corrida tinha "Adaptar este treino"; a musculação não tinha nada — ou dava
 * a hora inteira, ou o atleta não ia. E "não fui" é a pior adaptação de todas,
 * porque some do plano e o motor nunca fica sabendo por quê.
 *
 * Menos tempo pode virar regra ("deixar assim para sempre" grava a duração nas
 * preferências). Mais leve é sobre hoje, e por isso não tem essa opção: um dia
 * ruim não deve mudar como o atleta treina.
 */
import { useState } from "react";
import { Loader2, SlidersHorizontal, X } from "lucide-react";
import { shorterOptions, displayMinutes } from "@/lib/strength-adapt";
import type { StrengthSession } from "@/lib/strength-builder";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

export function AdaptStrengthControl({
  session, week, day, onChanged,
}: {
  session: StrengthSession;
  week: string;
  day: WeeklyPlanDay["day"];
  onChanged: (plan: WeeklyPlanData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forever, setForever] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = shorterOptions(session);
  const now = displayMinutes(session);

  async function adapt(action: "shorter" | "lighter", minutes?: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/strength/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: week, day, action, minutes, forever: forever && action === "shorter" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.plan) {
        setError(data?.error ?? "Não foi possível adaptar.");
        return;
      }
      onChanged(data.plan as WeeklyPlanData);
      setOpen(false);
      setForever(false);
    } catch {
      setError("Falha na conexão.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-surface-600 px-2.5 text-xs font-medium text-surface-300 transition-colors hover:border-brand-500/60 hover:text-brand-300"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" /> Adaptar
      </button>
    );
  }

  return (
    <div className="w-full space-y-2.5 rounded-xl border border-surface-600 bg-surface-900/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-surface-100">Adaptar esta musculação</p>
        <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="p-1 text-surface-500 hover:text-surface-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      {options.length > 0 && (
        <div>
          <p className="text-xs text-surface-400">Tenho menos tempo — hoje são ~{now} min:</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {options.map(m => (
              <button
                key={m}
                type="button"
                disabled={busy}
                onClick={() => adapt("shorter", m)}
                className="min-h-[40px] rounded-lg border border-surface-600 px-3 text-xs font-semibold text-surface-200 transition-colors hover:border-brand-500/60 hover:text-brand-300 disabled:opacity-50"
              >
                {m} min
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-surface-400">
            <input
              type="checkbox"
              checked={forever}
              onChange={e => setForever(e.target.checked)}
              className="h-4 w-4 rounded border-surface-600 bg-surface-700 accent-brand-500"
            />
            Deixar assim para sempre
          </label>
        </div>
      )}

      <div className="border-t border-surface-700/60 pt-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => adapt("lighter")}
          className="min-h-[40px] w-full rounded-lg border border-surface-600 px-3 text-xs font-semibold text-surface-200 transition-colors hover:border-brand-500/60 hover:text-brand-300 disabled:opacity-50"
        >
          Manter os exercícios, mas mais leve hoje
        </button>
        <p className="mt-1 text-[11px] leading-relaxed text-surface-500">
          Uma série a menos e uma repetição a mais em reserva. Vale só para hoje.
        </p>
      </div>

      {busy && (
        <p className="flex items-center gap-1.5 text-xs text-surface-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Ajustando…
        </p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
