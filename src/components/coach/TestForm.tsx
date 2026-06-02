"use client";

import { useState } from "react";
import { X, Timer, Heart, FileText, Info } from "lucide-react";
import type { PerformanceTest } from "@/types";

interface Props {
  onClose: () => void;
  onSaved: (test: PerformanceTest) => void;
}

interface FormState {
  test_date: string;
  time_minutes: string;
  time_seconds_part: string;
  avg_hr: string;
  max_hr: string;
  notes: string;
}

export function TestForm({ onClose, onSaved }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState<FormState>({
    test_date:         today,
    time_minutes:      "",
    time_seconds_part: "00",
    avg_hr:            "",
    max_hr:            "",
    notes:             "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  function update(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const mins = parseInt(form.time_minutes, 10);
    const secs = parseInt(form.time_seconds_part, 10);

    if (!form.test_date) {
      setError("Informe a data do teste.");
      return;
    }
    if (isNaN(mins) || mins <= 0) {
      setError("Informe um tempo válido (minutos > 0).");
      return;
    }
    if (isNaN(secs) || secs < 0 || secs > 59) {
      setError("Segundos deve ser entre 0 e 59.");
      return;
    }

    const time_seconds = mins * 60 + secs;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/performance-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_date:   form.test_date,
          distance_km: 3.0,
          time_seconds,
          avg_hr:  form.avg_hr  ? parseInt(form.avg_hr,  10) : undefined,
          max_hr:  form.max_hr  ? parseInt(form.max_hr,  10) : undefined,
          notes:   form.notes   || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.migration_needed) {
          setError(
            "Tabela de testes não encontrada. Acesse /api/admin/create-perf-table?secret=limiar_admin_2026 para criá-la."
          );
        } else {
          setError(data.error ?? "Erro ao salvar teste.");
        }
        return;
      }

      onSaved(data as PerformanceTest);
    } catch {
      setError("Falha na conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface-800 border border-surface-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700">
          <div>
            <h2 className="font-bold text-surface-100">Registrar Teste de 3km</h2>
            <p className="text-xs text-surface-500 mt-0.5">Tempo máximo sustentável</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-700 transition-colors text-surface-400 hover:text-surface-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info note */}
        <div className="mx-5 mt-4 flex items-start gap-2 bg-brand-500/10 border border-brand-500/20 rounded-xl p-3">
          <Info className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
          <p className="text-xs text-surface-400 leading-relaxed">
            Corra 3km no seu ritmo máximo sustentável (~10-14 min). Registre o tempo total e a FC média do seu relógio.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-surface-400 mb-1.5 uppercase tracking-wide">
              Data do teste
            </label>
            <input
              type="date"
              value={form.test_date}
              onChange={e => update("test_date", e.target.value)}
              className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
              required
            />
          </div>

          {/* Time */}
          <div>
            <label className="block text-xs font-semibold text-surface-400 mb-1.5 uppercase tracking-wide">
              <Timer className="w-3.5 h-3.5 inline mr-1.5" />
              Tempo total
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  min="1"
                  max="99"
                  placeholder="10"
                  value={form.time_minutes}
                  onChange={e => update("time_minutes", e.target.value)}
                  className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-4 py-2.5 text-sm text-center focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                  required
                />
                <p className="text-xs text-surface-500 text-center mt-1">min</p>
              </div>
              <span className="text-surface-500 text-xl font-bold pb-5">:</span>
              <div className="flex-1">
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="00"
                  value={form.time_seconds_part}
                  onChange={e => update("time_seconds_part", e.target.value.padStart(2, "0"))}
                  className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-4 py-2.5 text-sm text-center focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                />
                <p className="text-xs text-surface-500 text-center mt-1">seg</p>
              </div>
            </div>
          </div>

          {/* Heart Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-surface-400 mb-1.5 uppercase tracking-wide">
                <Heart className="w-3.5 h-3.5 inline mr-1.5" />
                FC média
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="100"
                  max="220"
                  placeholder="178"
                  value={form.avg_hr}
                  onChange={e => update("avg_hr", e.target.value)}
                  className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-500">bpm</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-surface-400 mb-1.5 uppercase tracking-wide">
                FC máxima
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="100"
                  max="220"
                  placeholder="192"
                  value={form.max_hr}
                  onChange={e => update("max_hr", e.target.value)}
                  className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-500">bpm</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-surface-400 mb-1.5 uppercase tracking-wide">
              <FileText className="w-3.5 h-3.5 inline mr-1.5" />
              Observações
            </label>
            <textarea
              rows={2}
              placeholder="Condições, sensações, terreno..."
              value={form.notes}
              onChange={e => update("notes", e.target.value)}
              className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 placeholder:text-surface-600"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={submitting}
            >
              {submitting ? "Salvando…" : "Salvar teste"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
