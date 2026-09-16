"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";

const PRESETS = [
  { label: "5 km",   km: 5 },
  { label: "10 km",  km: 10 },
  { label: "21,1 km", km: 21.0975 },
  { label: "42,2 km", km: 42.195 },
];

/** Parse "1:45:00" / "45:30" / "45" (minutes) into seconds. */
function parseTime(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const parts = t.split(":").map(p => parseInt(p, 10));
  if (parts.some(n => !Number.isFinite(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 60;
}

export function AddGoalForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName]         = useState("");
  const [distance, setDistance] = useState("10");
  const [date, setDate]         = useState("");
  const [target, setTarget]     = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const km = Number(distance.replace(",", "."));
    if (!name.trim())                    { setError("Informe o nome da prova."); return; }
    if (!Number.isFinite(km) || km <= 0) { setError("Distância inválida."); return; }

    setSaving(true);
    setError(null);
    const targetSeconds = parseTime(target);

    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          race_name: name.trim(),
          distance_km: km,
          race_date: date || null,
          target_time_seconds: targetSeconds,
          target_pace_seconds_per_km: targetSeconds ? Math.round(targetSeconds / km) : null,
          status: "active",
        }),
      });
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Não foi possível criar a meta.");
      }
    } catch {
      setError("Falha na conexão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-surface-100 text-sm">Nova meta</h3>
        <button type="button" onClick={onClose} className="text-surface-500 hover:text-surface-300 p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="block text-xs text-surface-400 mb-1.5">Prova</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Meia Maratona do Rio"
          className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
        />
      </div>

      <div>
        <label className="block text-xs text-surface-400 mb-1.5">Distância (km)</label>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {PRESETS.map(p => (
            <button
              key={p.km} type="button" onClick={() => setDistance(String(p.km))}
              className={`px-2.5 min-h-[44px] py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                Number(distance) === p.km ? "bg-brand-500 text-white" : "bg-surface-700 text-surface-400 hover:text-surface-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="number" step="0.1" min="0"
          value={distance}
          onChange={e => setDistance(e.target.value)}
          className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-sm text-surface-200 focus:outline-none focus:border-brand-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-surface-400 mb-1.5">Data da prova</label>
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-sm text-surface-200 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs text-surface-400 mb-1.5">Tempo-alvo</label>
          <input
            value={target} onChange={e => setTarget(e.target.value)}
            placeholder="1:45:00"
            className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar meta"}
      </button>
    </form>
  );
}
