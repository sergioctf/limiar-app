"use client";

import { useState } from "react";
import { Pill, Plus, X, Loader2, Clock } from "lucide-react";
import type { Supplement } from "@/types";

export function SupplementsCard({ initial }: { initial: Supplement[] }) {
  const [items, setItems] = useState<Supplement[]>(initial);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", dosage: "", timing: "", notes: "" });

  async function add() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/health/supplements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setItems(prev => [...prev, data.supplement]);
        setForm({ name: "", dosage: "", timing: "", notes: "" });
        setAdding(false);
      }
    } finally { setSaving(false); }
  }

  async function remove(id?: string) {
    if (!id) return;
    setItems(prev => prev.filter(s => s.id !== id));
    await fetch(`/api/health/supplements?id=${id}`, { method: "DELETE" });
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Suplementação</h2>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-ghost text-xs text-brand-400">
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </button>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="text-sm text-surface-500">Cadastre seus suplementos (creatina, whey, cafeína, vitaminas…) com dose e horário.</p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map(s => (
            <li key={s.id} className="flex items-center gap-3 bg-surface-700/30 rounded-xl p-3">
              <div className="w-9 h-9 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
                <Pill className="w-4 h-4 text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-surface-200">
                  {s.name}{s.dosage ? <span className="text-surface-400 font-normal"> · {s.dosage}</span> : null}
                </p>
                <div className="flex items-center gap-2 text-xs text-surface-500">
                  {s.timing && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.timing}</span>}
                  {s.notes && <span className="truncate">· {s.notes}</span>}
                </div>
              </div>
              <button onClick={() => remove(s.id)} className="text-surface-500 hover:text-red-400 shrink-0 p-1" title="Remover">
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="space-y-2 bg-surface-700/20 rounded-xl p-3">
          <input
            autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Nome (ex: Creatina)"
            className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:border-brand-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.dosage} onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))} placeholder="Dose (5 g)"
              className="bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:border-brand-500" />
            <input value={form.timing} onChange={e => setForm(f => ({ ...f, timing: e.target.value }))} placeholder="Quando (manhã)"
              className="bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:border-brand-500" />
          </div>
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observação (opcional)"
            className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:border-brand-500" />
          <div className="flex gap-2">
            <button onClick={() => { setAdding(false); setForm({ name: "", dosage: "", timing: "", notes: "" }); }} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={add} disabled={saving || !form.name.trim()} className="btn-primary flex-1 justify-center">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
