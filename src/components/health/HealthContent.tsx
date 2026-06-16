"use client";

import { useState, useMemo } from "react";
import { HeartPulse, Moon, Battery, Activity, Loader2, Check, Bed } from "lucide-react";
import { SORENESS_AREAS, type HealthCheckin, type BodyMeasurement } from "@/types";
import { BodyCompositionCard } from "@/components/health/BodyCompositionCard";
import { NutritionCard, type NutritionSummary } from "@/components/health/NutritionCard";
import { ReadinessCard } from "@/components/health/ReadinessCard";
import { NativeHealthSync } from "@/components/health/NativeHealthSync";
import { AppleHealthSyncCard } from "@/components/health/AppleHealthSyncCard";
import type { Readiness } from "@/lib/readiness";

interface Props {
  initialCheckins: HealthCheckin[];
  initialBody?: BodyMeasurement[];
  nutrition?: NutritionSummary;
  readiness?: Readiness;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

/** 1-5 selector rendered as labelled dots. */
function Scale5({ value, onChange, lowLabel, highLabel, color = "bg-brand-500" }: {
  value: number | null; onChange: (v: number) => void; lowLabel: string; highLabel: string; color?: string;
}) {
  return (
    <div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 h-9 rounded-lg text-sm font-bold transition-all active:scale-95 ${
              value === n ? `${color} text-white` : "bg-surface-700 text-surface-400 hover:bg-surface-600"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-surface-600 mt-1">
        <span>{lowLabel}</span><span>{highLabel}</span>
      </div>
    </div>
  );
}

export function HealthContent({ initialCheckins, initialBody = [], nutrition, readiness }: Props) {
  const [checkins, setCheckins] = useState<HealthCheckin[]>(initialCheckins);
  const today = todayStr();
  const existing = useMemo(() => checkins.find(c => c.date === today) ?? null, [checkins, today]);

  const [sleepHours, setSleepHours] = useState<number | null>(existing?.sleep_hours ?? null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(existing?.sleep_quality ?? null);
  const [energy, setEnergy] = useState<number | null>(existing?.energy ?? null);
  const [soreness, setSoreness] = useState<number | null>(existing?.soreness ?? null);
  const [areas, setAreas] = useState<string[]>(existing?.soreness_areas ?? []);
  const [rpe, setRpe] = useState<number | null>(existing?.rpe ?? null);
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleArea(key: string) {
    setAreas(prev => prev.includes(key) ? prev.filter(a => a !== key) : [...prev, key]);
  }

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/health/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          sleep_hours: sleepHours,
          sleep_quality: sleepQuality,
          energy,
          soreness,
          soreness_areas: soreness && soreness > 1 ? areas : [],
          rpe,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar");
      setCheckins(prev => [data.checkin, ...prev.filter(c => c.date !== today)]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const rpeColor = rpe == null ? "bg-surface-600"
    : rpe <= 3 ? "bg-green-500" : rpe <= 6 ? "bg-yellow-500" : rpe <= 8 ? "bg-orange-500" : "bg-red-500";

  // Last 7 days history strip
  const history = useMemo(() => {
    const days: Array<{ date: string; c: HealthCheckin | null }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      days.push({ date: ds, c: checkins.find(c => c.date === ds) ?? null });
    }
    return days;
  }, [checkins]);

  return (
    <div className="space-y-5 max-w-2xl mx-auto animate-fade-in">
      <div>
        <h1 className="page-header flex items-center gap-2"><HeartPulse className="w-6 h-6 text-brand-400" /> Saúde</h1>
        <p className="text-surface-500 text-sm">Check-in diário — leva 20 segundos e ajusta seu treino ao seu corpo.</p>
      </div>

      {/* Native bridge — feeds wellness_data from the watch when in the app */}
      <NativeHealthSync />

      {/* Limiar Score — readiness (top of the page) */}
      {readiness && <ReadinessCard readiness={readiness} />}

      {/* Apple Health auto-sync via iOS Shortcut */}
      <AppleHealthSyncCard />

      {/* Check-in card */}
      <div className="card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Check-in de hoje</h2>
          <span className="text-xs text-surface-500 capitalize">
            {new Date(`${today}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </div>

        {/* Sleep */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-surface-200 flex items-center gap-1.5"><Bed className="w-4 h-4 text-blue-400" /> Sono</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSleepHours(h => Math.max(0, (h ?? 8) - 0.5))} className="w-9 h-9 rounded-lg bg-surface-700 text-surface-300 hover:bg-surface-600 font-bold">−</button>
            <div className="flex-1 text-center bg-surface-700/40 rounded-lg py-2">
              <span className="text-lg font-black text-surface-100 tabular-nums">{sleepHours != null ? sleepHours.toFixed(1) : "—"}</span>
              <span className="text-xs text-surface-500"> h</span>
            </div>
            <button type="button" onClick={() => setSleepHours(h => Math.min(24, (h ?? 8) + 0.5))} className="w-9 h-9 rounded-lg bg-surface-700 text-surface-300 hover:bg-surface-600 font-bold">+</button>
          </div>
          <Scale5 value={sleepQuality} onChange={setSleepQuality} lowLabel="péssimo" highLabel="ótimo" color="bg-blue-500" />
        </div>

        {/* Energy */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-surface-200 flex items-center gap-1.5"><Battery className="w-4 h-4 text-green-400" /> Energia / disposição</label>
          <Scale5 value={energy} onChange={setEnergy} lowLabel="exausto" highLabel="cheio" color="bg-green-500" />
        </div>

        {/* Soreness */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-surface-200 flex items-center gap-1.5"><Activity className="w-4 h-4 text-orange-400" /> Dor muscular</label>
          <Scale5 value={soreness} onChange={setSoreness} lowLabel="nenhuma" highLabel="intensa" color="bg-orange-500" />
          {soreness != null && soreness > 1 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(SORENESS_AREAS).map(([key, label]) => (
                <button
                  key={key} type="button" onClick={() => toggleArea(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    areas.includes(key) ? "bg-orange-500/20 text-orange-300 border border-orange-500/40" : "bg-surface-700 text-surface-400 border border-transparent hover:text-surface-200"
                  }`}
                >{label}</button>
              ))}
            </div>
          )}
        </div>

        {/* RPE */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-surface-200 flex items-center gap-1.5"><Moon className="w-4 h-4 text-purple-400" /> Esforço do treino de ontem (RPE)</label>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={10} value={rpe ?? 0} onChange={e => setRpe(Number(e.target.value) || null)} className="flex-1 accent-brand-500 h-1.5" />
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black text-white ${rpeColor}`}>{rpe ?? "—"}</span>
          </div>
          <p className="text-[10px] text-surface-600">0 = descanso · 1-3 leve · 4-6 moderado · 7-8 forte · 9-10 máximo</p>
        </div>

        {/* Notes */}
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Observações (opcional) — como você se sente?"
          rows={2}
          className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500 resize-none"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button onClick={save} disabled={saving} className="btn-primary w-full justify-center">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</>
            : saved ? <><Check className="w-4 h-4" /> Salvo!</>
            : existing ? "Atualizar check-in" : "Salvar check-in"}
        </button>
      </div>

      {/* Body composition */}
      <BodyCompositionCard initial={initialBody} />

      {/* Nutrition (TMB/TDEE + AI tip + fueling) */}
      {nutrition && <NutritionCard data={nutrition} />}

      {/* 7-day history */}
      <div className="card p-4">
        <p className="stat-label mb-3">Últimos 7 dias</p>
        <div className="grid grid-cols-7 gap-1.5">
          {history.map(({ date, c }) => {
            const d = new Date(`${date}T12:00:00`);
            const filled = !!c;
            return (
              <div key={date} className="text-center">
                <p className="text-[9px] text-surface-600 uppercase mb-1">{d.toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3)}</p>
                <div className={`rounded-lg py-2 ${filled ? "bg-surface-700/50" : "bg-surface-800 border border-dashed border-surface-700"}`}>
                  {filled ? (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-blue-300" title="sono">{c!.sleep_hours != null ? `${c!.sleep_hours}h` : "—"}</p>
                      <p className="text-[10px] text-orange-300" title="dor">{c!.soreness != null ? `D${c!.soreness}` : "—"}</p>
                    </div>
                  ) : <p className="text-[10px] text-surface-700">·</p>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-surface-600 mt-2">Em breve: índice de prontidão combinando sono, dor e carga de treino.</p>
      </div>
    </div>
  );
}
