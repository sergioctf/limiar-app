"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, ChevronDown, Plus } from "lucide-react";
import {
  ALL_SPORTS, SECONDARY_SPORTS, SPORTS, CATEGORY_LABEL, isSecondarySport,
  type SportKey, type SportCategory, type SecondarySport,
} from "@/lib/sports";
import type { DayKey, TrainingPrefs } from "@/types";

const DAYS: Array<{ key: DayKey; short: string }> = [
  { key: "Mon", short: "S" }, { key: "Tue", short: "T" }, { key: "Wed", short: "Q" },
  { key: "Thu", short: "Q" }, { key: "Fri", short: "S" }, { key: "Sat", short: "S" },
  { key: "Sun", short: "D" },
];

/** Full names for the day buttons' accessible label — "S" alone is three days. */
const DAY_PT: Record<DayKey, string> = {
  Mon: "Segunda", Tue: "Terça", Wed: "Quarta", Thu: "Quinta",
  Fri: "Sexta", Sat: "Sábado", Sun: "Domingo",
};

/**
 * Sport selector for the Treinador.
 *
 * Two tiers, and the difference is real rather than cosmetic. The four primary
 * sports are the ones the coach periodises — it sizes them, paces them and
 * exports them to a watch. Everything under "Outros" is scheduled: the athlete
 * says which days they do it, the plan places it and counts it, and no engine
 * pretends to prescribe a load for a jiu-jitsu class.
 *
 * The days live here, next to the choice, rather than in "Sua semana". Picking
 * pilates and then hunting for another card to say when you do it is two steps
 * for one decision.
 */
export function SportSelector() {
  const [selected, setSelected] = useState<SportKey[] | null>(null);
  const [prefs, setPrefs]       = useState<TrainingPrefs | null>(null);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);
  const [open, setOpen]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/coach/sports")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.sports) return;
        const list = d.sports as SportKey[];
        setSelected(list);
        // Open the drawer for someone who already practises something down
        // there — otherwise their choices are hidden behind a closed section.
        if (list.some(isSecondarySport)) setOpen(true);
      })
      .catch(() => { if (!cancelled) setSelected(["corrida", "musculacao"]); });

    fetch("/api/coach/training-prefs")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.prefs) setPrefs(d.prefs as TrainingPrefs); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  const saveSports = useCallback(async (next: SportKey[], previous: SportKey[]) => {
    setSelected(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/sports", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sports: next }),
      });
      if (res.ok) {
        setDirty(true);
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Não foi possível salvar.");
        setSelected(previous);
      }
    } catch {
      setError("Falha na conexão.");
      setSelected(previous);
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * Save only `otherDays`. The route merges over what is stored, so this cannot
   * clobber the running days that "Sua semana" owns.
   */
  const saveDays = useCallback(async (otherDays: TrainingPrefs["otherDays"], previous: TrainingPrefs) => {
    setPrefs(p => (p ? { ...p, otherDays } : p));
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/training-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherDays }),
      });
      if (res.ok) {
        setDirty(true);
      } else {
        setError("Não foi possível salvar os dias.");
        setPrefs(previous);
      }
    } catch {
      setError("Falha na conexão.");
      setPrefs(previous);
    } finally {
      setSaving(false);
    }
  }, []);

  function togglePrimary(sport: SportKey) {
    if (!selected || saving) return;
    const isOn = selected.includes(sport);
    const next = isOn ? selected.filter(s => s !== sport) : [...selected, sport];
    // The engine needs something to plan; the route rejects it anyway.
    if (next.filter(s => !isSecondarySport(s)).length === 0) return;
    void saveSports(next, selected);
  }

  function toggleSecondary(sport: SecondarySport) {
    if (!selected || saving) return;
    const isOn = selected.includes(sport);
    const next = isOn ? selected.filter(s => s !== sport) : [...selected, sport];
    void saveSports(next, selected);

    // Unticking a sport takes its days with it. Leaving them behind would put
    // the session back on the plan the moment the sport was re-selected months
    // later, on days chosen for a different life.
    if (isOn && prefs?.otherDays?.[sport]) {
      const { [sport]: _removed, ...rest } = prefs.otherDays;
      void saveDays(rest, prefs);
    }
  }

  function toggleDay(sport: SecondarySport, day: DayKey) {
    if (!prefs || saving) return;
    const current = prefs.otherDays?.[sport] ?? [];
    const days = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
    const next = { ...(prefs.otherDays ?? {}) };
    if (days.length > 0) next[sport] = days;
    else delete next[sport];
    void saveDays(next, prefs);
  }

  if (!selected) {
    return (
      <div className="card p-4 flex items-center gap-2 text-surface-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando esportes…
      </div>
    );
  }

  const groups: Array<{ category: SportCategory; sports: SportKey[] }> = [
    { category: "cardio", sports: ALL_SPORTS.filter(s => SPORTS[s].category === "cardio") },
    { category: "forca",  sports: ALL_SPORTS.filter(s => SPORTS[s].category === "forca") },
  ];

  const chosenOthers = SECONDARY_SPORTS.filter(s => selected.includes(s));

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-surface-100 text-sm">Esportes praticados</h3>
          <p className="text-[11px] text-surface-500">O plano semanal considera só o que você marcar</p>
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-surface-500 shrink-0" />}
      </div>

      {groups.map(({ category, sports }) => (
        <div key={category} className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold">
            {CATEGORY_LABEL[category]}
          </p>
          <div className="flex flex-wrap gap-2">
            {sports.map(s => (
              <SportChip
                key={s}
                sport={s}
                on={selected.includes(s)}
                disabled={saving}
                onClick={() => togglePrimary(s)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* ── Outros ───────────────────────────────────────────────────────── */}
      <div className="space-y-2 pt-1 border-t border-surface-700">
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-2 min-h-[44px] text-left"
        >
          <span>
            <span className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold block">
              Outros
            </span>
            <span className="text-[11px] text-surface-500">
              {chosenOthers.length === 0
                ? "Pilates, bike indoor, luta, vôlei…"
                : chosenOthers.map(s => SPORTS[s].label).join(", ")}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-surface-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {SECONDARY_SPORTS.map(s => {
                const on = selected.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSecondary(s)}
                    disabled={saving}
                    aria-pressed={on}
                    className={[
                      "flex items-center gap-1 rounded-lg border px-2.5 py-2 min-h-[44px] text-xs transition-colors duration-100 active:opacity-80 disabled:opacity-60",
                      on
                        ? "bg-brand-500/20 border-brand-500/40 text-brand-300 font-medium"
                        : "bg-surface-700/40 border-surface-700 text-surface-400 hover:text-surface-200",
                    ].join(" ")}
                  >
                    <span aria-hidden>{SPORTS[s].emoji}</span>
                    {SPORTS[s].label}
                    {on ? <Check className="w-3 h-3 shrink-0" /> : <Plus className="w-3 h-3 shrink-0 opacity-40" />}
                  </button>
                );
              })}
            </div>

            {chosenOthers.length > 0 && (
              <div className="space-y-2 rounded-xl bg-surface-700/30 p-3">
                <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold">
                  Em que dias?
                </p>
                {!prefs ? (
                  <p className="text-[11px] text-surface-500 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Carregando sua semana…
                  </p>
                ) : (
                  <>
                    {chosenOthers.map(s => (
                      <div key={s} className="space-y-1">
                        <p className="text-[11px] text-surface-300">
                          <span aria-hidden>{SPORTS[s].emoji}</span> {SPORTS[s].label}
                        </p>
                        <div className="grid grid-cols-7 gap-1">
                          {DAYS.map(d => {
                            const on = (prefs.otherDays?.[s] ?? []).includes(d.key);
                            return (
                              <button
                                key={d.key}
                                onClick={() => toggleDay(s, d.key)}
                                disabled={saving}
                                aria-pressed={on}
                                aria-label={`${SPORTS[s].label} — ${DAY_PT[d.key]}`}
                                className={`min-h-[44px] rounded-lg text-xs font-bold transition-colors disabled:opacity-60 ${
                                  on ? "bg-brand-500 text-white" : "bg-surface-700/60 text-surface-400 hover:text-surface-200"
                                }`}
                              >
                                {d.short}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <p className="text-[10px] text-surface-500 leading-relaxed">
                      Sem dia marcado o esporte só conta quando você registra a atividade.
                      Com dia marcado ele entra no plano da semana — e nunca no lugar de uma corrida.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {dirty && (
        <p className="text-[11px] text-brand-400 leading-relaxed">
          Esportes atualizados. Use <span className="font-semibold">Regenerar</span> no plano abaixo para aplicar às sessões da semana.
        </p>
      )}
    </div>
  );
}

function SportChip({
  sport, on, disabled, onClick,
}: {
  sport: SportKey; on: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={[
        "flex items-center gap-1.5 rounded-xl border px-3 py-2 min-h-[44px] text-sm font-medium transition-colors duration-100 active:opacity-80 disabled:opacity-60",
        on
          ? "bg-brand-500 border-brand-400 text-white"
          : "bg-surface-700/40 border-surface-700 text-surface-400 hover:text-surface-200",
      ].join(" ")}
    >
      <span aria-hidden>{SPORTS[sport].emoji}</span>
      {SPORTS[sport].label}
      {on && <Check className="w-3.5 h-3.5" />}
    </button>
  );
}
