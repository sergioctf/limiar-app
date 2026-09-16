"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Loader2, Check, Info } from "lucide-react";
import type { DayKey, TrainingPrefs } from "@/types";

const DAYS: Array<{ key: DayKey; short: string }> = [
  { key: "Mon", short: "Seg" },
  { key: "Tue", short: "Ter" },
  { key: "Wed", short: "Qua" },
  { key: "Thu", short: "Qui" },
  { key: "Fri", short: "Sex" },
  { key: "Sat", short: "Sáb" },
  { key: "Sun", short: "Dom" },
];

/**
 * Weekly layout editor. Everyone trains differently — the plan follows the days
 * the athlete picks here rather than a fixed template.
 */
export function TrainingPrefsCard() {
  const [prefs, setPrefs] = useState<TrainingPrefs | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/training-prefs")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.prefs) return;
        setPrefs(d.prefs);
        setWarnings(d.warnings ?? []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function save(next: TrainingPrefs) {
    setPrefs(next);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/coach/training-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const d = await res.json().catch(() => null);
      if (res.ok) {
        setWarnings(d?.warnings ?? []);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(d?.error ?? "Não foi possível salvar.");
      }
    } catch {
      setError("Falha na conexão.");
    } finally {
      setSaving(false);
    }
  }

  if (!prefs) {
    return (
      <div className="card p-4 flex items-center gap-2 text-surface-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando preferências…
      </div>
    );
  }

  const toggle = (list: DayKey[], d: DayKey) =>
    list.includes(d) ? list.filter(x => x !== d) : [...list, d];

  const runDays = prefs.runDays ?? [];

  return (
    <div id="training-prefs" className="card p-4 space-y-4 scroll-mt-20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-surface-100 text-sm flex items-center gap-1.5">
            <CalendarRange className="w-4 h-4 text-brand-400" /> Sua semana
          </h3>
          <p className="text-[11px] text-surface-500">
            Escolha os dias — o plano se molda a você, não o contrário
          </p>
        </div>
        {saving ? <Loader2 className="w-4 h-4 animate-spin text-surface-500 shrink-0" />
          : saved ? <Check className="w-4 h-4 text-green-400 shrink-0" /> : null}
      </div>

      {/* Run days */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1.5">
          Dias de corrida ({runDays.length}/semana)
        </p>
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map(d => {
            const on = runDays.includes(d.key);
            return (
              <button
                key={d.key}
                onClick={() => save({ ...prefs, runDays: toggle(runDays, d.key), runDaysConfirmed: true })}
                disabled={saving}
                aria-pressed={on}
                className={`min-h-[44px] rounded-lg text-xs font-bold transition-colors disabled:opacity-60 ${
                  on ? "bg-brand-500 text-white" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
                }`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Long run day */}
      {runDays.length > 1 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1.5">
            Dia do longão
          </p>
          <div className="flex gap-1 flex-wrap">
            {DAYS.filter(d => runDays.includes(d.key)).map(d => {
              const on = (prefs.longRunDay ?? runDays[runDays.length - 1]) === d.key;
              return (
                <button
                  key={d.key}
                  onClick={() => save({ ...prefs, longRunDay: d.key, runDaysConfirmed: true })}
                  disabled={saving}
                  className={`px-3 min-h-[44px] py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                    on ? "bg-purple-500 text-white" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
                  }`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quality sessions */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1.5">
          Treinos fortes por semana
        </p>
        <div className="flex gap-1">
          {[0, 1, 2].map(n => (
            <button
              key={n}
              onClick={() => save({ ...prefs, qualityPerWeek: n })}
              disabled={saving}
              className={`flex-1 min-h-[44px] py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                (prefs.qualityPerWeek ?? 1) === n
                  ? "bg-orange-500 text-white" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
              }`}
            >
              {n === 0 ? "nenhum" : n}
            </button>
          ))}
        </div>
      </div>

      {/* Strength days */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1.5">
          Dias de musculação
        </p>
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map(d => {
            const on = (prefs.strengthDays ?? []).includes(d.key);
            return (
              <button
                key={d.key}
                onClick={() => save({ ...prefs, strengthDays: toggle(prefs.strengthDays ?? [], d.key) })}
                disabled={saving}
                aria-pressed={on}
                className={`min-h-[44px] rounded-lg text-xs font-bold transition-colors disabled:opacity-60 ${
                  on ? "bg-blue-500 text-white" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
                }`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-surface-500 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-surface-500" />{w}
            </p>
          ))}
        </div>
      )}

      <p className="text-[11px] text-brand-400 leading-relaxed">
        As sessões são distribuídas nos seus dias como leve → forte → longão. Use
        <span className="font-semibold"> Regenerar</span> no plano para aplicar,
        ou peça um ajuste no chat do treinador.
      </p>
    </div>
  );
}
