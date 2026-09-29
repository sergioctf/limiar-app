"use client";

/**
 * "Quando você vai fazer o teste?"
 *
 * O botão dizia **Registrar novo teste** e abria um formulário de resultado —
 * uma pergunta que só faz sentido depois de correr. Entre saber que o teste
 * está velho e fazê-lo havia um vão, e é nesse vão que a intenção morre.
 *
 * Agora ele diz **Marcar teste de 3 km**, abre um calendário, e o teste entra
 * na semana no mesmo instante. Quando o dia chegar, o check-in do treino
 * pergunta se foi feito.
 */
import { useState } from "react";
import { CalendarDays, Loader2, X } from "lucide-react";
import { testDateOptions } from "@/lib/planned-test";
import type { PlannedTest } from "@/lib/planned-test";
import { localDateStr } from "@/lib/week";

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatTestDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${WEEKDAY[d.getDay()]}, ${d.getDate()} de ${MONTH[d.getMonth()]}`;
}

export function ScheduleTestSheet({
  current, onClose, onSaved,
}: {
  current: PlannedTest | null;
  onClose: () => void;
  onSaved: (test: PlannedTest | null) => void;
}) {
  const today = localDateStr(new Date());
  const [date, setDate] = useState<string>(current?.date ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = testDateOptions(today);

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Marcar teste de 3 km"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] space-y-4 overflow-y-auto rounded-t-3xl border border-surface-700 bg-surface-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-surface-100">Marcar teste de 3 km</h2>
            <p className="mt-0.5 text-sm text-surface-400">
              Ele entra na sua semana e substitui o treino forte do dia.
            </p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="p-1 text-surface-500 hover:text-surface-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/*
          Um campo de data nativo, porque o teclado do celular já sabe desenhar
          calendário — e uma fileira de atalhos para os próximos dias, que é
          como a escolha realmente acontece ("sábado de manhã").
        */}
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-surface-500">Dia</span>
          <input
            type="date"
            value={date}
            min={today}
            max={options[options.length - 1]}
            onChange={e => setDate(e.target.value)}
            className="mt-1.5 min-h-[48px] w-full rounded-xl border border-surface-600 bg-surface-800 px-3 text-surface-100 focus:border-brand-500 focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {options.slice(0, 8).map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={`min-h-[44px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                date === d
                  ? "border-brand-500/60 bg-brand-500/15 text-brand-200"
                  : "border-surface-600 text-surface-300 hover:border-brand-500/40"
              }`}
            >
              {formatTestDate(d)}
            </button>
          ))}
        </div>

        <div className="rounded-xl bg-surface-800/60 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-surface-300">
            <CalendarDays className="h-3.5 w-3.5 text-brand-400" /> Como ele aparece
          </p>
          <p className="mt-1 text-xs leading-relaxed text-surface-400">
            6 km no dia — 2 de aquecimento, 3 no limite e 1 de volta à calma. O volume da
            semana não muda por causa disso; no dia, o check-in pergunta se você fez.
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={save} disabled={!date || busy} className="btn-primary flex-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : current ? "Remarcar" : "Marcar"}
          </button>
          {current && (
            <button type="button" onClick={unschedule} disabled={busy} className="btn-ghost">
              Desmarcar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
