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
 *
 * Desde 01/10 usa o painel de baixo padrão, como mover e reorganizar: mesma
 * posição de confirmar, mesmo tratamento de erro, alvos de 48 px.
 */
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Sheet, SheetActions, SheetOption } from "@/components/ui/Sheet";
import { shorterOptions, displayMinutes } from "@/lib/strength-adapt";
import type { StrengthSession } from "@/lib/strength-builder";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

type Choice = { kind: "shorter"; minutes: number } | { kind: "lighter" };

export function AdaptStrengthControl({
  session, week, day, onChanged,
}: {
  session: StrengthSession;
  week: string;
  day: WeeklyPlanDay["day"];
  onChanged: (plan: WeeklyPlanData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [forever, setForever] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = shorterOptions(session);
  const now = displayMinutes(session);

  function close() {
    setOpen(false);
    setChoice(null);
    setForever(false);
    setError(null);
  }

  async function apply() {
    if (!choice || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/strength/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: week, day,
          action: choice.kind,
          minutes: choice.kind === "shorter" ? choice.minutes : undefined,
          forever: forever && choice.kind === "shorter",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.plan) {
        setError(data?.error ?? "Não foi possível adaptar.");
        return;
      }
      onChanged(data.plan as WeeklyPlanData);
      close();
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
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-surface-600 px-3 text-xs font-medium text-surface-300 transition-colors hover:border-brand-500/60 hover:text-brand-300"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" /> Adaptar
      </button>
    );
  }

  const consequence = !choice
    ? `Hoje a sessão leva ~${now} min.`
    : choice.kind === "shorter"
      ? `Saem os acessórios do fim — o composto principal fica. ${forever ? "E as próximas sessões já nascem com essa duração." : "Vale só para hoje."}`
      : "Mesmos exercícios, uma série a menos e uma repetição a mais em reserva. Vale só para hoje.";

  return (
    <Sheet
      title="Adaptar a musculação"
      scope={`Sessão de hoje, ~${now} min.`}
      onClose={close}
      busy={busy}
      error={error}
      footer={
        <SheetActions
          confirmLabel="Adaptar"
          onConfirm={apply}
          onCancel={close}
          disabled={!choice}
          busy={busy}
        />
      }
    >
      <div className="space-y-1.5">
        {options.map(m => (
          <SheetOption
            key={m}
            label={`Tenho ${m} minutos`}
            detail={`${now - m} min a menos que hoje`}
            selected={choice?.kind === "shorter" && choice.minutes === m}
            onClick={() => setChoice({ kind: "shorter", minutes: m })}
          />
        ))}
        <SheetOption
          label="Manter os exercícios, mais leve"
          detail="Uma série a menos, uma repetição a mais em reserva"
          selected={choice?.kind === "lighter"}
          onClick={() => setChoice({ kind: "lighter" })}
        />
      </div>

      {choice?.kind === "shorter" && (
        <label className="flex min-h-[48px] items-center gap-3 rounded-xl border border-surface-700 px-3.5 text-sm text-surface-300">
          <input
            type="checkbox"
            checked={forever}
            onChange={e => setForever(e.target.checked)}
            className="h-5 w-5 rounded border-surface-600 bg-surface-700 accent-brand-500"
          />
          Deixar assim para sempre
        </label>
      )}

      <p className="text-xs leading-relaxed text-surface-500">{consequence}</p>
    </Sheet>
  );
}
