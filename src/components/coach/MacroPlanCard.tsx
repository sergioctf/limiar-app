"use client";

import { useState } from "react";
import {
  CalendarRange, Loader2, Sparkles, Wand2, X, Flag, ChevronDown, ChevronUp, RefreshCcw,
} from "lucide-react";
import type { MacroPlan, MacroRaceType, MacroPhase } from "@/types";

interface Props {
  initialPlan: MacroPlan | null;
  /** actual km already run, keyed by week_start (Monday) */
  weeklyActualKm: Record<string, number>;
}

const RACE_TYPES: Array<{ key: MacroRaceType; label: string }> = [
  { key: "5k", label: "5K" },
  { key: "10k", label: "10K" },
  { key: "half", label: "Meia" },
  { key: "marathon", label: "Maratona" },
  { key: "ultra", label: "Ultra" },
  { key: "triathlon", label: "Triathlon" },
];

const PHASE_UI: Record<MacroPhase, { label: string; bar: string; text: string }> = {
  base:  { label: "Base",   bar: "bg-blue-500",   text: "text-blue-300" },
  build: { label: "Build",  bar: "bg-brand-500",  text: "text-brand-300" },
  peak:  { label: "Pico",   bar: "bg-red-500",    text: "text-red-300" },
  taper: { label: "Taper",  bar: "bg-green-500",  text: "text-green-300" },
  race:  { label: "Prova",  bar: "bg-yellow-400", text: "text-yellow-300" },
};

function monthLabel(ym: string): string {
  return new Date(`${ym}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function currentMondayStr(): string {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function MacroPlanCard({ initialPlan, weeklyActualKm }: Props) {
  const [plan, setPlan] = useState<MacroPlan | null>(initialPlan);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Wizard state
  const [raceType, setRaceType] = useState<MacroRaceType>("half");
  const [raceLabel, setRaceLabel] = useState("");
  const [targetMonth, setTargetMonth] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adaptMsg, setAdaptMsg] = useState<string | null>(null);

  const minMonth = (() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 7);
  })();

  async function generate() {
    if (!targetMonth) { setError("Escolha o mês estimado da prova"); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/coach/macro-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raceType, raceLabel, targetMonth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao gerar plano");
      setPlan(data.plan);
      setWizardOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar");
    } finally {
      setBusy(false);
    }
  }

  async function adapt() {
    setBusy(true); setAdaptMsg(null); setError(null);
    try {
      const res = await fetch("/api/coach/macro-plan", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao adaptar");
      setAdaptMsg(data.message);
      // Refresh plan
      const ref = await fetch("/api/coach/macro-plan");
      const refData = await ref.json();
      if (refData.plan) setPlan(refData.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adaptar");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPlan() {
    if (!confirm("Cancelar o plano de longo prazo?")) return;
    await fetch("/api/coach/macro-plan", { method: "DELETE" });
    setPlan(null);
    setAdaptMsg(null);
  }

  /* ── Wizard / empty state ─────────────────────────────────────────────── */
  if (!plan || wizardOpen) {
    return (
      <div className="card p-4 sm:p-5 border-brand-500/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-brand-400" />
            <h2 className="section-title">Plano de longo prazo</h2>
          </div>
          {wizardOpen && plan && (
            <button onClick={() => setWizardOpen(false)} className="text-surface-500 hover:text-surface-300">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="text-sm text-surface-400 mb-4">
          Qual sua próxima prova-alvo? O treinador monta a periodização completa
          (base → build → pico → taper) e <strong className="text-surface-200">adapta toda semana</strong> conforme seus treinos reais.
        </p>

        {/* Race type pills */}
        <div className="flex gap-1.5 flex-wrap mb-3">
          {RACE_TYPES.map(rt => (
            <button key={rt.key} onClick={() => setRaceType(rt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                raceType === rt.key ? "bg-brand-500 text-white" : "bg-surface-700 text-surface-400 hover:text-surface-200"
              }`}>
              {rt.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <input
            type="text"
            value={raceLabel}
            onChange={e => setRaceLabel(e.target.value)}
            placeholder="Nome da prova (opcional)"
            className="bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
          />
          <input
            type="month"
            value={targetMonth}
            min={minMonth}
            onChange={e => setTargetMonth(e.target.value)}
            className="bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-sm text-surface-200 focus:outline-none focus:border-brand-500"
          />
        </div>
        <p className="text-[11px] text-surface-600 mb-3">O mês é uma estimativa — dá pra mudar depois sem perder o histórico.</p>

        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

        <button onClick={generate} disabled={busy} className="btn-primary w-full justify-center">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Montando periodização…</> : <><Sparkles className="w-4 h-4" /> Gerar plano até a prova</>}
        </button>
      </div>
    );
  }

  /* ── Active plan view ─────────────────────────────────────────────────── */
  const weeks = plan.plan_json.weeks;
  const thisMonday = currentMondayStr();
  const currentIdx = weeks.findIndex(w => w.week_start === thisMonday);
  const current = currentIdx >= 0 ? weeks[currentIdx] : null;
  const weeksToRace = weeks.length - (currentIdx >= 0 ? currentIdx : 0);
  const upcoming = weeks.filter(w => w.week_start > thisMonday).slice(0, expanded ? 100 : 3);

  // Phase segments for the timeline bar
  const segments: Array<{ phase: MacroPhase; count: number }> = [];
  for (const w of weeks) {
    const last = segments[segments.length - 1];
    if (last && last.phase === w.phase) last.count++;
    else segments.push({ phase: w.phase, count: 1 });
  }

  return (
    <div className="card p-4 sm:p-5 border-brand-500/20">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="w-4 h-4 text-brand-400" />
          <div>
            <h2 className="section-title">{plan.race_label}</h2>
            <p className="text-[11px] text-surface-500 capitalize">{monthLabel(plan.target_month)} · {weeksToRace} semana{weeksToRace !== 1 ? "s" : ""} até a prova</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setWizardOpen(true)} title="Trocar prova/mês"
            className="p-1.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-700/50 transition-colors">
            <Flag className="w-4 h-4" />
          </button>
          <button onClick={cancelPlan} title="Cancelar plano"
            className="p-1.5 rounded-lg text-surface-500 hover:text-red-400 hover:bg-surface-700/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Phase timeline */}
      <div className="mb-1 flex h-2.5 rounded-full overflow-hidden bg-surface-700">
        {segments.map((s, i) => (
          <div key={i} className={`${PHASE_UI[s.phase].bar} ${i > 0 ? "border-l border-surface-900/60" : ""}`}
            style={{ width: `${(s.count / weeks.length) * 100}%` }} />
        ))}
      </div>
      {/* progress marker */}
      {currentIdx >= 0 && (
        <div className="relative h-2 mb-2">
          <div className="absolute -top-0.5 w-0.5 h-3 bg-white/80 rounded"
            style={{ left: `${((currentIdx + 0.5) / weeks.length) * 100}%` }} />
        </div>
      )}
      <div className="flex gap-3 flex-wrap mb-4">
        {segments.filter((s, i, arr) => arr.findIndex(x => x.phase === s.phase) === i).map(s => (
          <span key={s.phase} className={`flex items-center gap-1 text-[10px] ${PHASE_UI[s.phase].text}`}>
            <span className={`w-2 h-2 rounded-full ${PHASE_UI[s.phase].bar}`} />{PHASE_UI[s.phase].label}
          </span>
        ))}
      </div>

      {/* Current week */}
      {current && (() => {
        const actual = weeklyActualKm[current.week_start] ?? 0;
        const pct = Math.min(100, (actual / Math.max(current.target_km, 1)) * 100);
        const ui = PHASE_UI[current.phase];
        return (
          <div className="bg-surface-700/30 rounded-xl p-3 mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${ui.text}`}>Semana atual · {ui.label}</span>
              <span className="text-xs font-mono font-bold text-surface-200 tabular-nums">{actual.toFixed(1)} / {current.target_km} km</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-700 overflow-hidden mb-2">
              <div className={`h-full rounded-full transition-all duration-500 ${ui.bar}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-surface-300">
              <strong className="text-surface-100">{current.focus}</strong> · treino-chave: {current.key_workout}
            </p>
          </div>
        );
      })()}

      {/* Upcoming weeks */}
      <div className="space-y-1.5">
        {upcoming.map(w => {
          const ui = PHASE_UI[w.phase];
          return (
            <div key={w.week_start} className="flex items-center gap-2.5 text-xs bg-surface-700/20 rounded-lg px-2.5 py-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ui.bar}`} />
              <span className="text-surface-500 tabular-nums shrink-0">
                {new Date(`${w.week_start}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </span>
              <span className="font-mono font-bold text-surface-200 tabular-nums shrink-0 w-12">{w.target_km}km</span>
              <span className="text-surface-400 truncate flex-1">{w.focus}</span>
              <span className="text-surface-500 truncate hidden sm:block">{w.key_workout}</span>
            </div>
          );
        })}
      </div>
      {weeks.filter(w => w.week_start > thisMonday).length > 3 && (
        <button onClick={() => setExpanded(e => !e)} className="btn-ghost w-full justify-center text-xs mt-1">
          {expanded ? <>Mostrar menos <ChevronUp className="w-3 h-3" /></> : <>Ver todas as semanas <ChevronDown className="w-3 h-3" /></>}
        </button>
      )}

      {/* Adaptation */}
      {(adaptMsg || plan.plan_json.adaptation_note) && (
        <div className="mt-3 bg-brand-500/10 border border-brand-500/20 rounded-xl p-3">
          <p className="text-xs text-surface-300 leading-relaxed">
            <Wand2 className="w-3.5 h-3.5 text-brand-400 inline mr-1" />
            {adaptMsg ?? plan.plan_json.adaptation_note}
          </p>
        </div>
      )}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      <button onClick={adapt} disabled={busy} className="btn-secondary w-full justify-center mt-3">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Reavaliando…</> : <><RefreshCcw className="w-4 h-4" /> Reavaliar com base nos treinos reais</>}
      </button>
      <p className="text-[10px] text-surface-600 text-center mt-1.5">O plano também se adapta sozinho toda segunda-feira.</p>
    </div>
  );
}
