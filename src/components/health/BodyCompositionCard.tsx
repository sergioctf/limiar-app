"use client";

import { useState, useMemo } from "react";
import { Scale, Loader2, Check, ChevronDown, ChevronUp, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { BodyMeasurement } from "@/types";

interface Props {
  initial: BodyMeasurement[];
}

const todayStr = () => new Date().toISOString().slice(0, 10);

/** 7-day trailing moving average over date-sorted weights. */
function movingAverage(points: { date: string; w: number }[]): number[] {
  return points.map((p, i) => {
    const cutoff = new Date(`${p.date}T12:00:00`).getTime() - 6 * 86400000;
    let sum = 0, n = 0;
    for (let j = 0; j <= i; j++) {
      if (new Date(`${points[j].date}T12:00:00`).getTime() >= cutoff) { sum += points[j].w; n++; }
    }
    return n > 0 ? sum / n : p.w;
  });
}

export function BodyCompositionCard({ initial }: Props) {
  const [items, setItems] = useState<BodyMeasurement[]>(initial);
  const [expanded, setExpanded] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayStr();
  const todayEntry = items.find(m => m.date === today) ?? null;
  const latest = items[0] ?? null;

  const [form, setForm] = useState({
    weight_kg: todayEntry?.weight_kg?.toString() ?? "",
    body_fat_pct: todayEntry?.body_fat_pct?.toString() ?? "",
    muscle_mass_kg: todayEntry?.muscle_mass_kg?.toString() ?? "",
    water_pct: todayEntry?.water_pct?.toString() ?? "",
    visceral_fat: todayEntry?.visceral_fat?.toString() ?? "",
    basal_kcal: todayEntry?.basal_kcal?.toString() ?? "",
  });

  const setField = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Chart data (ascending)
  const chart = useMemo(() => {
    const pts = [...items]
      .filter(m => m.weight_kg)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map(m => ({ date: m.date, w: m.weight_kg }));
    if (pts.length < 2) return null;
    const ma = movingAverage(pts);
    const weights = pts.map(p => p.w);
    const min = Math.min(...weights), max = Math.max(...weights);
    const range = Math.max(max - min, 0.5);
    const W = 300, H = 70, PAD = 6;
    const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
    const y = (w: number) => H - PAD - ((w - min) / range) * (H - PAD * 2);
    const maPath = ma.map((w, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(w).toFixed(1)}`).join(" ");
    const dots = pts.map((p, i) => ({ cx: x(i), cy: y(p.w) }));
    const first = pts[0].w, last = pts[pts.length - 1].w;
    return { maPath, dots, min, max, delta: last - first, span: pts.length };
  }, [items]);

  async function save() {
    const weight = parseFloat(form.weight_kg.replace(",", "."));
    if (!weight || weight < 20) { setError("Informe um peso válido"); return; }
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/health/body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          weight_kg: weight,
          body_fat_pct: parseFloat(form.body_fat_pct.replace(",", ".")) || null,
          muscle_mass_kg: parseFloat(form.muscle_mass_kg.replace(",", ".")) || null,
          water_pct: parseFloat(form.water_pct.replace(",", ".")) || null,
          visceral_fat: parseFloat(form.visceral_fat.replace(",", ".")) || null,
          basal_kcal: parseInt(form.basal_kcal) || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar");
      setItems(prev => [data.measurement, ...prev.filter(m => m.date !== today)].sort((a, b) => (a.date < b.date ? 1 : -1)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const trendIcon = !chart ? null
    : chart.delta < -0.3 ? <TrendingDown className="w-3.5 h-3.5 text-green-400" />
    : chart.delta > 0.3 ? <TrendingUp className="w-3.5 h-3.5 text-yellow-400" />
    : <Minus className="w-3.5 h-3.5 text-surface-400" />;

  return (
    <div className="card p-5 space-y-4">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Composição corporal</h2>
        </div>
        <div className="flex items-center gap-2">
          {latest && <span className="text-sm font-bold text-surface-100 tabular-nums">{latest.weight_kg} kg</span>}
          {expanded ? <ChevronUp className="w-4 h-4 text-surface-500" /> : <ChevronDown className="w-4 h-4 text-surface-500" />}
        </div>
      </button>

      {/* Weight trend (always visible when there's data) */}
      {chart && (
        <div className="bg-surface-700/30 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-surface-500 uppercase tracking-wide">Tendência (média 7 dias)</span>
            <span className="text-[11px] flex items-center gap-1 text-surface-400">
              {trendIcon}{chart.delta > 0 ? "+" : ""}{chart.delta.toFixed(1)} kg em {chart.span} medições
            </span>
          </div>
          <svg viewBox="0 0 300 70" className="w-full h-16" preserveAspectRatio="none">
            {chart.dots.map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r="1.5" className="fill-surface-500" />)}
            <path d={chart.maPath} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-brand-400" />
          </svg>
          <div className="flex justify-between text-[9px] text-surface-600">
            <span>{chart.min.toFixed(1)} kg</span><span>{chart.max.toFixed(1)} kg</span>
          </div>
        </div>
      )}

      {/* Latest composition snapshot */}
      {latest && (latest.body_fat_pct || latest.muscle_mass_kg || latest.water_pct || latest.visceral_fat) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {latest.body_fat_pct != null && <Snapshot label="Gordura" value={`${latest.body_fat_pct}%`} />}
          {latest.muscle_mass_kg != null && <Snapshot label="Músculo" value={`${latest.muscle_mass_kg} kg`} />}
          {latest.water_pct != null && <Snapshot label="Água" value={`${latest.water_pct}%`} />}
          {latest.visceral_fat != null && <Snapshot label="Visceral" value={`${latest.visceral_fat}`} />}
        </div>
      )}

      {expanded && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-surface-500">
            Registre hoje (os números que o Mi Home mostra após pesar). Peso é o essencial; o resto é opcional.
          </p>
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="text-[11px] text-surface-500">Peso (kg) *</span>
              <input
                type="text" inputMode="decimal" value={form.weight_kg} onChange={e => setField("weight_kg", e.target.value)}
                placeholder="ex: 72.4"
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:border-brand-500 mt-0.5"
              />
            </label>
            <button onClick={() => setAdvanced(a => !a)} className="btn-ghost text-xs text-brand-400 pb-2">
              {advanced ? "menos campos" : "mais campos"}
            </button>
          </div>

          {advanced && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Field label="Gordura %" v={form.body_fat_pct} on={v => setField("body_fat_pct", v)} ph="18.5" />
              <Field label="Músculo kg" v={form.muscle_mass_kg} on={v => setField("muscle_mass_kg", v)} ph="55.2" />
              <Field label="Água %" v={form.water_pct} on={v => setField("water_pct", v)} ph="55.0" />
              <Field label="Gord. visceral" v={form.visceral_fat} on={v => setField("visceral_fat", v)} ph="8" />
              <Field label="Metab. basal" v={form.basal_kcal} on={v => setField("basal_kcal", v)} ph="1650" />
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button onClick={save} disabled={saving} className="btn-primary w-full justify-center">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</>
              : saved ? <><Check className="w-4 h-4" /> Salvo!</>
              : todayEntry ? "Atualizar peso de hoje" : "Salvar peso de hoje"}
          </button>
        </div>
      )}

      {items.length === 0 && !expanded && (
        <p className="text-sm text-surface-500">Toque para registrar seu peso e acompanhar a evolução.</p>
      )}
    </div>
  );
}

function Snapshot({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-700/30 rounded-lg p-2.5 text-center">
      <p className="text-[10px] text-surface-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-surface-100 tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function Field({ label, v, on, ph }: { label: string; v: string; on: (v: string) => void; ph: string }) {
  return (
    <label className="block">
      <span className="text-[11px] text-surface-500">{label}</span>
      <input
        type="text" inputMode="decimal" value={v} onChange={e => on(e.target.value)} placeholder={ph}
        className="w-full bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-sm text-surface-200 focus:outline-none focus:border-brand-500 mt-0.5"
      />
    </label>
  );
}
