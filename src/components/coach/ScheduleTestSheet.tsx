"use client";

/**
 * "Quando você vai fazer o teste?"
 *
 * O botão dizia **Registrar novo teste** e abria um formulário de resultado —
 * uma pergunta que só faz sentido depois de correr. Entre saber que o teste
 * está velho e fazê-lo havia um vão, e é nesse vão que a intenção morre.
 *
 * Agora ele diz **Marcar teste de 3 km**, abre este painel, e o teste entra na
 * semana no mesmo instante. Quando o dia chegar, o check-in do treino pergunta
 * se foi feito.
 *
 * Desde 01/10 usa o painel de baixo padrão (`Sheet`), como mover, adaptar e
 * reorganizar — mesma posição de confirmar, mesmos alvos de 48 px.
 */
import { useState } from "react";
import { testDateOptions } from "@/lib/planned-test";
import type { PlannedTest } from "@/lib/planned-test";
import { Sheet, SheetActions, SheetOption } from "@/components/ui/Sheet";
import { localDateStr } from "@/lib/week";

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatTestDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${WEEKDAY[d.getDay()]}, ${d.getDate()} de ${MONTH[d.getMonth()]}`;
}

/** "daqui a 3 dias", para a opção dizer mais do que a data. */
function inDays(from: string, to: string): string {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  const n = Math.round((b - a) / 86_400_000);
  if (n === 1) return "amanhã";
  return `daqui a ${n} dias`;
}

export function ScheduleTestSheet({
  current, onClose, onSaved,
}: {
  current: PlannedTest | null;
  onClose: () => void;
  onSaved: (test: PlannedTest | null) => void;
}) {
  const today = localDateStr(new Date());
  const [date, setDate] = useState<string | null>(current?.date ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = testDateOptions(today).slice(0, 8);

  async function save() {
    if (!date || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/coach/planned-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.test) { setError(data?.error ?? "Não foi possível marcar."); return; }
      onSaved(data.test as PlannedTest);
      onClose();
    } catch {
      setError("Falha na conexão.");
    } finally {
      setBusy(false);
    }
  }

  async function unschedule() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/coach/planned-test", { method: "DELETE" });
      if (!res.ok) { setError("Não foi possível desmarcar."); return; }
      onSaved(null);
      onClose();
    } catch {
      setError("Falha na conexão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={current ? "Remarcar o teste de 3 km" : "Marcar o teste de 3 km"}
      scope="Ele entra na sua semana e substitui o treino forte do dia."
      onClose={onClose}
      busy={busy}
      error={error}
      footer={
        <div className="space-y-2 pt-1">
          <SheetActions
            confirmLabel={current ? "Remarcar" : "Marcar"}
            onConfirm={save}
            onCancel={onClose}
            disabled={!date}
            busy={busy}
          />
          {current && (
            <button
              type="button"
              onClick={unschedule}
              disabled={busy}
              className="min-h-[44px] w-full text-xs text-surface-500 transition-colors hover:text-red-400 disabled:opacity-50"
            >
              Desmarcar o teste
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-1.5">
        {options.map(d => (
          <SheetOption
            key={d}
            label={formatTestDate(d)}
            detail={inDays(today, d)}
            selected={date === d}
            onClick={() => setDate(d)}
          />
        ))}
      </div>

      <p className="text-xs leading-relaxed text-surface-500">
        6 km no dia — 2 de aquecimento, 3 no limite e 1 de volta à calma. O volume da
        semana não muda por causa disso; no dia, o check-in pergunta se você fez.
      </p>
    </Sheet>
  );
}
