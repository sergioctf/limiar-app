"use client";

/**
 * "Minha agenda da semana" — the week fitted to the days the athlete has.
 *
 * Pick the days, see how the coach would reorganise the week and why, confirm.
 * For a week not built yet the agenda is remembered and the week is built on it.
 * Nothing changes before "Confirmar", and "Desfazer" puts the week back.
 */
import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

type DayKey = WeeklyPlanDay["day"];
const DAYS: Array<{ key: DayKey; short: string; name: string }> = [
  { key: "Mon", short: "Seg", name: "segunda" }, { key: "Tue", short: "Ter", name: "terça" },
  { key: "Wed", short: "Qua", name: "quarta" }, { key: "Thu", short: "Qui", name: "quinta" },
  { key: "Fri", short: "Sex", name: "sexta" }, { key: "Sat", short: "Sáb", name: "sábado" },
  { key: "Sun", short: "Dom", name: "domingo" },
];
const isRun = (d: WeeklyPlanDay) => d.type !== "rest" && d.type !== "strength" && (d.sport == null || d.sport === "corrida");

function list(keys: DayKey[]): string {
  const names = DAYS.filter(d => keys.includes(d.key)).map(d => d.name);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

async function call(body: Record<string, unknown>) {
  const response = await fetch("/api/coach/week-fit", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Não foi possível organizar a semana.");
  return data;
}

interface Preview {
  days: WeeklyPlanDay[];
  explanation: string[];
  unchanged: boolean;
}

export function WeekFitControl({
  week, plan, isNextWeek, todayKey, onChanged,
}: {
  week: string;
  plan: WeeklyPlanData | null;
  isNextWeek: boolean;
  todayKey: DayKey;
  onChanged: (plan: WeeklyPlanData | null) => void;
}) {
  const firstOpen = isNextWeek ? 0 : DAYS.findIndex(d => d.key === todayKey);
  const openDays = DAYS.slice(firstOpen).map(d => d.key);
  const initial = plan ? plan.days.filter(d => isRun(d) && openDays.includes(d.day)).map(d => d.day) : [];

  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<DayKey[]>(initial);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setPreview(null); setNote(null); setError(""); setSaved(false); };
  const toggle = (d: DayKey) => { reset(); setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]); };

  async function run(action: "preview" | "confirm") {
    setBusy(true); setError("");
    try {
      const data = await call({ action, week, days });
      if (action === "preview") {
        if (data.noPlan) setNote(data.message);
        else setPreview(data.proposal);
      } else {
        if (data.plan) onChanged(data.plan);
        setNote(data.noPlan ? data.message : null);
        setSaved(!!data.noPlan);
        if (!data.noPlan) setOpen(false);
        setPreview(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível organizar a semana.");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true); setError("");
    try {
      const data = await call({ action: "undo", week });
      onChanged(data.plan ?? plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível desfazer.");
    } finally {
      setBusy(false);
    }
  }

  const arranged = plan?.rearrangement;

  return (
    <div className="space-y-2">
      {arranged && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-700/40 px-3 py-2 text-xs text-surface-400">
          <span>Semana organizada na sua agenda: {list(arranged.available)}.</span>
          <button type="button" onClick={() => void undo()} disabled={busy} className="min-h-[44px] text-surface-300 hover:text-surface-100">
            Desfazer
          </button>
        </div>
      )}
      {!arranged && plan?.agenda && (
        <p className="text-xs text-surface-500">Montada nos dias que você deu para esta semana: {list(plan.agenda)}.</p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); reset(); setDays(initial); }}
          className="flex min-h-[44px] items-center gap-1.5 text-xs text-surface-400 transition-colors hover:text-brand-300"
        >
          {/* O nome diz o que acontece ao tocar: antes era "Minha agenda desta
              semana", que descreve uma tela, não uma ação. */}
          <CalendarClock className="w-3.5 h-3.5" /> Reorganizar {isNextWeek ? "a próxima semana" : "esta semana"}
        </button>
      ) : (
        /*
          O mesmo painel de baixo de "Mover" e "Adaptar" (01/10). Era um bloco
          com borda dentro do card, com sete botões de três letras — e o
          "Confirmar" mudava de lugar conforme o passo. Agora o título diz o
          escopo, os dias são linhas grandes e os botões ficam sempre no pé.
        */
        <Sheet
          title={`Reorganizar ${isNextWeek ? "a próxima semana" : "esta semana"}`}
          scope={`Quais dias você consegue correr ${isNextWeek ? "na próxima semana" : "até domingo"}?`}
          onClose={() => setOpen(false)}
          busy={busy}
          error={error}
          footer={
            <div className="flex gap-2 pt-1">
              {saved ? (
                <button type="button" onClick={() => setOpen(false)} className="btn-primary min-h-[48px] flex-1 justify-center">Fechar</button>
              ) : !preview ? (
                <>
                  <button type="button" onClick={() => setOpen(false)} disabled={busy} className="btn-secondary min-h-[48px] flex-1">Cancelar</button>
                  <button type="button" disabled={busy || days.length === 0} onClick={() => void run(note ? "confirm" : "preview")} className="btn-primary min-h-[48px] flex-[2] justify-center">
                    {busy ? "Organizando…" : note ? "Confirmar" : "Ver como fica"}
                  </button>
                </>
              ) : preview.unchanged ? (
                <button type="button" onClick={() => setOpen(false)} className="btn-primary min-h-[48px] flex-1 justify-center">Já cabe — nada a mudar</button>
              ) : (
                <>
                  <button type="button" disabled={busy} onClick={() => setPreview(null)} className="btn-secondary min-h-[48px] flex-1">Voltar</button>
                  <button type="button" disabled={busy} onClick={() => void run("confirm")} className="btn-primary min-h-[48px] flex-[2] justify-center">
                    {busy ? "Salvando…" : "Confirmar"}
                  </button>
                </>
              )}
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-1.5">
            {DAYS.map(d => {
              const disabled = !openDays.includes(d.key);
              const on = days.includes(d.key);
              return (
                <button
                  key={d.key}
                  type="button"
                  disabled={disabled || busy}
                  aria-pressed={on}
                  onClick={() => toggle(d.key)}
                  className={`min-h-[48px] rounded-xl border px-3 text-sm font-semibold transition-colors ${
                    disabled ? "cursor-not-allowed border-surface-800 text-surface-700"
                      : on ? "border-brand-500/60 bg-brand-500/15 text-brand-200"
                        : "border-surface-700 text-surface-300 hover:border-surface-600"
                  }`}
                >
                  {d.name.charAt(0).toUpperCase() + d.name.slice(1)}
                </button>
              );
            })}
          </div>

          {preview && (
            <div className="space-y-2">
              <ul className="space-y-1">
                {preview.explanation.map(line => (
                  <li key={line} className="text-xs text-surface-300 leading-relaxed">{line}</li>
                ))}
              </ul>
              <ul className="grid grid-cols-1 gap-0.5 rounded-xl bg-surface-800/60 p-2">
                {preview.days.filter(d => openDays.includes(d.day)).map(d => (
                  <li key={d.day} className="flex justify-between text-xs">
                    <span className="text-surface-500">{d.dayPt}</span>
                    <span className={isRun(d) ? "text-surface-100" : "text-surface-500"}>
                      {d.label}{isRun(d) && d.distance_km ? ` · ${String(d.distance_km).replace(".", ",")} km` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {note && <p className="text-sm leading-relaxed text-surface-300" role="status">{note}</p>}
        </Sheet>
      )}
    </div>
  );
}
