"use client";

import { useState } from "react";
import { CalendarDays, Loader2, X } from "lucide-react";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const DAYS: Array<{ key: WeeklyPlanDay["day"]; short: string }> = [
  { key: "Mon", short: "Seg" }, { key: "Tue", short: "Ter" }, { key: "Wed", short: "Qua" },
  { key: "Thu", short: "Qui" }, { key: "Fri", short: "Sex" }, { key: "Sat", short: "Sáb" },
  { key: "Sun", short: "Dom" },
];

/**
 * Move this one session to another day, this week only.
 *
 * The everyday case it exists for: the run was in the morning, the athlete
 * slept through it and did the afternoon lifting, and wants the run on Tuesday
 * to keep the week intact. Nothing about next week should change — so this
 * never touches the training preferences, and the copy says so.
 */
export function MoveSessionControl({
  week, day, session, label, onMoved,
}: {
  week: string;
  day: WeeklyPlanDay["day"];
  session: "corrida" | "musculacao";
  label: string;
  onMoved: (plan: WeeklyPlanData) => void;
}) {
  const [open, setOpen]       = useState(false);
  const [busy, setBusy]       = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function move(to: WeeklyPlanDay["day"]) {
    setBusy(to);
    setError(null);
    try {
      const res = await fetch("/api/coach/weekly-plan/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week, from: day, to, session }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) { setError(d?.error ?? "Não foi possível mover."); return; }
      onMoved(d.plan as WeeklyPlanData);
      setOpen(false);
    } catch {
      setError("Falha na conexão.");
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    /*
      Um botão, não um link cinza de 11 px.

      Mover a sessão é a coisa que o atleta mais faz nesta tela — a vida muda de
      dia o tempo todo — e estava escrita menor do que o aviso de tênis
      (Sérgio, 26/09). Mesmo desenho de "Adaptar", porque são o mesmo tipo de
      decisão: mexer nesta sessão.
    */
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-surface-600 px-2.5 text-xs font-medium text-surface-300 transition-colors hover:border-brand-500/60 hover:text-brand-300"
      >
        <CalendarDays className="h-3.5 w-3.5" /> Mover de dia
      </button>
    );
  }

  return (
    <div className="bg-surface-800/70 border border-surface-700 rounded-lg p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-surface-300">
          Mover <span className="font-semibold">{label}</span> para:
        </p>
        <button
          onClick={() => { setOpen(false); setError(null); }}
          aria-label="Cancelar"
          className="ml-auto text-surface-500 hover:text-surface-300"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAYS.map(d => (
          <button
            key={d.key}
            onClick={() => move(d.key)}
            disabled={d.key === day || busy != null}
            className={`min-h-[44px] rounded-md text-xs font-bold transition-colors disabled:opacity-40 ${
              d.key === day
                ? "bg-surface-700 text-surface-500"
                : "bg-surface-700/60 text-surface-300 hover:bg-brand-500 hover:text-white"
            }`}
          >
            {busy === d.key ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : d.short}
          </button>
        ))}
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      <p className="text-[10px] text-surface-500 leading-relaxed">
        Vale só para esta semana. Seus dias de treino continuam os mesmos —
        para mudar a rotina, use as preferências.
      </p>
    </div>
  );
}
