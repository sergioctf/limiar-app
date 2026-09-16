"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Check } from "lucide-react";
import { haptic } from "@/lib/haptics";
import type { HealthCheckin } from "@/types";

const SORENESS = ["Nenhuma", "Leve", "Moderada", "Forte", "Muita"];
const RPE_HINT: Record<number, string> = {
  1: "repouso", 3: "bem leve", 5: "moderado", 7: "duro", 9: "quase no limite", 10: "máximo",
};

interface Props {
  today: string;
  initial: HealthCheckin | null;
  /** The watch already measured the night, so asking about it would be noise. */
  watchHasSleep: boolean;
  onClose: () => void;
}

/**
 * Thirty seconds of what no watch can measure.
 *
 * Only questions that change the score are asked. The old check-in stored an
 * "energy" rating the readiness engine never read — a question whose answer goes
 * nowhere teaches the athlete that the form is ceremony, and they stop filling it.
 */
export function CheckinSheet({ today, initial, watchHasSleep, onClose }: Props) {
  const router = useRouter();
  const [soreness, setSoreness] = useState<number | null>(initial?.soreness ?? null);
  const [rpe, setRpe] = useState<number | null>(initial?.rpe ?? null);
  const [sleepHours, setSleepHours] = useState<string>(initial?.sleep_hours?.toString() ?? "");
  const [sleepQuality, setSleepQuality] = useState<number | null>(initial?.sleep_quality ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/health/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          soreness, rpe,
          sleep_hours: !watchHasSleep && sleepHours ? Number(sleepHours.replace(",", ".")) : initial?.sleep_hours ?? null,
          sleep_quality: !watchHasSleep ? sleepQuality : initial?.sleep_quality ?? null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao salvar");
      haptic("success");
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
      haptic("warn");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label="Check-in de hoje"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl border border-surface-700 bg-surface-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface-600" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-surface-100">Como você está hoje?</h2>
            <p className="mt-0.5 text-xs text-surface-500">O que o relógio não mede. Entra direto no score.</p>
          </div>
          <button onClick={onClose} className="-mr-2 -mt-1 flex h-11 w-11 items-center justify-center text-surface-500 hover:text-surface-200" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <fieldset>
            <legend className="text-sm font-semibold text-surface-200">Dor muscular</legend>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {SORENESS.map((label, i) => (
                <button key={label} onClick={() => { setSoreness(i + 1); haptic("tap"); }}
                  className={`min-h-[44px] rounded-xl px-1 text-[11px] font-semibold transition-all active:scale-95 ${
                    soreness === i + 1 ? "bg-brand-500 text-white" : "bg-surface-800 text-surface-400"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex w-full items-baseline justify-between text-sm font-semibold text-surface-200">
              <span>Esforço do treino de ontem</span>
              <span className="text-xs font-normal text-surface-500">
                {rpe != null ? `${rpe}/10 · ${RPE_HINT[rpe] ?? RPE_HINT[rpe - 1] ?? ""}` : "não treinei / pular"}
              </span>
            </legend>
            <input
              type="range" min={1} max={10} step={1} value={rpe ?? 5}
              onChange={e => setRpe(Number(e.target.value))}
              className="mt-3 h-1.5 w-full accent-brand-500"
            />
            {rpe != null && (
              <button onClick={() => setRpe(null)} className="mt-1 text-[11px] text-surface-500 hover:text-surface-300">limpar</button>
            )}
          </fieldset>

          {!watchHasSleep && (
            <fieldset>
              <legend className="text-sm font-semibold text-surface-200">Sono desta noite</legend>
              <div className="mt-2 flex gap-2">
                <input
                  type="text" inputMode="decimal" value={sleepHours} onChange={e => setSleepHours(e.target.value)}
                  placeholder="horas (7,5)"
                  className="w-28 rounded-xl border border-surface-700 bg-surface-800 px-3 text-sm text-surface-200 focus:border-brand-500 focus:outline-none"
                />
                <div className="grid flex-1 grid-cols-5 gap-1">
                  {[1, 2, 3, 4, 5].map(q => (
                    <button key={q} onClick={() => setSleepQuality(q)} aria-label={`qualidade ${q}`}
                      className={`min-h-[44px] rounded-xl text-xs font-bold transition-all active:scale-95 ${
                        sleepQuality === q ? "bg-indigo-500 text-white" : "bg-surface-800 text-surface-400"
                      }`}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-[11px] text-surface-500">Qualidade de 1 (péssima) a 5 (ótima).</p>
            </fieldset>
          )}
        </div>

        {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

        <button onClick={save} disabled={saving} className="btn-primary mt-6 w-full">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</> : <><Check className="w-4 h-4" /> Atualizar recuperação</>}
        </button>
      </div>
    </div>
  );
}
