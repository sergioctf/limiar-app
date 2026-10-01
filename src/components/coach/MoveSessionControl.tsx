"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Sheet, SheetActions, SheetOption } from "@/components/ui/Sheet";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const DAYS: Array<{ key: WeeklyPlanDay["day"]; label: string }> = [
  { key: "Mon", label: "Segunda" }, { key: "Tue", label: "Terça" }, { key: "Wed", label: "Quarta" },
  { key: "Thu", label: "Quinta" }, { key: "Fri", label: "Sexta" }, { key: "Sat", label: "Sábado" },
  { key: "Sun", label: "Domingo" },
];

const DAY_LABEL = Object.fromEntries(DAYS.map(d => [d.key, d.label])) as Record<string, string>;

/**
 * Move this one session to another day, this week only.
 *
 * The everyday case it exists for: the run was in the morning, the athlete
 * slept through it and did the afternoon lifting, and wants the run on Tuesday
 * to keep the week intact. Nothing about next week should change — so this
 * never touches the training preferences, and the copy says so.
 *
 * ## Como ele mudou em 01/10
 *
 * Abria um bloco dentro do card com sete botões de três letras numa grade, e
 * **movia no toque**: sem confirmação, sem dizer o que ia acontecer, com alvos
 * que a mão erra. Agora é o painel de baixo padrão (`Sheet`): dias como linhas
 * grandes, a consequência escrita antes, e confirmar/cancelar onde eles estão
 * em todo o resto do app.
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
  const [open, setOpen]   = useState(false);
  const [target, setTarget] = useState<WeeklyPlanDay["day"] | null>(null);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move() {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/weekly-plan/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week, from: day, to: target, session }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) { setError(d?.error ?? "Não foi possível mover."); return; }
      onMoved(d.plan as WeeklyPlanData);
      close();
    } catch {
      setError("Falha na conexão.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setTarget(null);
    setError(null);
  }

  if (!open) {
    /*
      Um botão, não um link cinza de 11 px — e com 44 px de altura, que é o
      mínimo para o dedo (Sérgio, 26/09 e 01/10). Mover a sessão é a coisa que
      o atleta mais faz nesta tela: a vida muda de dia o tempo todo.
    */
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-surface-600 px-3 text-xs font-medium text-surface-300 transition-colors hover:border-brand-500/60 hover:text-brand-300"
      >
        <CalendarDays className="h-3.5 w-3.5" /> Mover de dia
      </button>
    );
  }

  return (
    <Sheet
      title={`Mover ${label.toLowerCase()}`}
      scope={`De ${DAY_LABEL[day]?.toLowerCase() ?? day}, só nesta semana.`}
      onClose={close}
      busy={busy}
      error={error}
      footer={
        <SheetActions
          confirmLabel={target ? `Mover para ${DAY_LABEL[target].toLowerCase()}` : "Escolha um dia"}
          onConfirm={move}
          onCancel={close}
          disabled={!target}
          busy={busy}
        />
      }
    >
      <div className="space-y-1.5">
        {DAYS.map(d => (
          <SheetOption
            key={d.key}
            label={d.label}
            detail={d.key === day ? "é onde está hoje" : null}
            selected={target === d.key}
            disabled={d.key === day}
            onClick={() => setTarget(d.key)}
          />
        ))}
      </div>

      {/* A consequência, antes de confirmar. */}
      <p className="text-xs leading-relaxed text-surface-500">
        {target
          ? `${label} sai de ${DAY_LABEL[day]?.toLowerCase()} e passa para ${DAY_LABEL[target].toLowerCase()}. O volume da semana não muda.`
          : "Vale só para esta semana. Seus dias de treino continuam os mesmos — para mudar a rotina, use as preferências."}
      </p>
    </Sheet>
  );
}
