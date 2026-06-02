"use client";

import { useState, useEffect } from "react";
import { X, MapPin, Timer, Heart, FileText, Target, Trophy, Info } from "lucide-react";
import { timeToString } from "@/lib/performance";
import type { Race } from "@/types";

const DISTANCE_PRESETS = [
  { label: "5 km",    km: 5     },
  { label: "10 km",   km: 10    },
  { label: "21,1 km", km: 21.1  },
  { label: "42,2 km", km: 42.2  },
];

interface Props {
  onClose:  () => void;
  onSaved:  (race: Race) => void;
  editRace?: Race | null;
  /** Pre-fill as "register result" for a future race */
  addResult?: boolean;
}

interface FormState {
  name:           string;
  race_date:      string;
  distance_km:    string;
  custom_distance: string;
  has_result:     boolean;
  time_hours:     string;
  time_minutes:   string;
  time_seconds:   string;
  avg_hr:         string;
  location:       string;
  notes:          string;
  is_target_race: boolean;
  bib_number:     string;
  save_as_test:   boolean;
}

function secsToHMS(s: number): { h: string; m: string; ss: string } {
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return {
    h:  h  > 0 ? String(h)  : "",
    m:  String(m).padStart(h > 0 ? 2 : 1, "0"),
    ss: String(ss).padStart(2, "0"),
  };
}

export function RaceForm({ onClose, onSaved, editRace, addResult }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const isEdit = !!editRace;

  function initForm(): FormState {
    if (editRace) {
      const preset = DISTANCE_PRESETS.find((p) => p.km === editRace.distance_km);
      const hms    = editRace.time_seconds ? secsToHMS(editRace.time_seconds) : { h: "", m: "", ss: "00" };
      return {
        name:            editRace.name,
        race_date:       editRace.race_date,
        distance_km:     preset ? String(preset.km) : "custom",
        custom_distance: preset ? "" : String(editRace.distance_km),
        has_result:      !!editRace.time_seconds || !!addResult,
        time_hours:      hms.h,
        time_minutes:    hms.m,
        time_seconds:    hms.ss,
        avg_hr:          editRace.avg_hr   ? String(editRace.avg_hr)  : "",
        location:        editRace.location ?? "",
        notes:           editRace.notes    ?? "",
        is_target_race:  editRace.is_target_race,
        bib_number:      editRace.bib_number ?? "",
        save_as_test:    false,
      };
    }
    return {
      name: "", race_date: today,
      distance_km: "", custom_distance: "",
      has_result: false,
      time_hours: "", time_minutes: "", time_seconds: "00",
      avg_hr: "", location: "", notes: "",
      is_target_race: false, bib_number: "",
      save_as_test: false,
    };
  }

  const [form, setForm]           = useState<FormState>(initForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Auto-jump to the result section if addResult
  useEffect(() => {
    if (addResult) setForm((f) => ({ ...f, has_result: true }));
  }, [addResult]);

  function set(field: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function resolvedDistanceKm(): number | null {
    if (form.distance_km === "custom") {
      const v = parseFloat(form.custom_distance);
      return isNaN(v) || v <= 0 ? null : v;
    }
    const v = parseFloat(form.distance_km);
    return isNaN(v) || v <= 0 ? null : v;
  }

  function resolvedTimeSecs(): number | null {
    if (!form.has_result) return null;
    const h  = parseInt(form.time_hours  || "0", 10);
    const m  = parseInt(form.time_minutes || "0", 10);
    const s  = parseInt(form.time_seconds || "0", 10);
    if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
    const total = h * 3600 + m * 60 + s;
    return total > 0 ? total : null;
  }

  // Check if race date is in the past (or today)
  const isPastRace = form.race_date <= today;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const distance_km = resolvedDistanceKm();
    if (!form.name.trim()) { setError("Informe o nome da prova."); return; }
    if (!form.race_date)   { setError("Informe a data."); return; }
    if (!distance_km)      { setError("Informe a distância."); return; }

    const time_seconds = resolvedTimeSecs();
    if (form.has_result && !time_seconds) {
      setError("Informe um tempo válido (pelo menos minutos > 0)."); return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      name:           form.name.trim(),
      race_date:      form.race_date,
      distance_km,
      time_seconds:   time_seconds ?? null,
      avg_hr:         form.avg_hr   ? parseInt(form.avg_hr, 10)  : null,
      notes:          form.notes.trim() || null,
      location:       form.location.trim() || null,
      is_target_race: form.is_target_race,
      bib_number:     form.bib_number.trim() || null,
      save_as_test:   form.save_as_test && !!time_seconds,
    };

    try {
      const url    = isEdit ? `/api/races/${editRace!.id}` : "/api/races";
      const method = isEdit ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.migration_needed) {
          setError("Tabela de provas não encontrada. Execute o SQL em /api/admin/create-races-table?secret=limiar_admin_2026");
        } else {
          setError(data.error ?? "Erro ao salvar prova.");
        }
        return;
      }
      onSaved(data as Race);
    } catch {
      setError("Falha na conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg bg-surface-800 border border-surface-700 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700 shrink-0">
          <div>
            <h2 className="font-bold text-surface-100">
              {isEdit ? (addResult ? "Registrar Resultado" : "Editar Prova") : "Adicionar Prova"}
            </h2>
            <p className="text-xs text-surface-500 mt-0.5">
              {isEdit && addResult ? editRace?.name : "Provas passadas e futuras"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Name */}
          {!addResult && (
            <div>
              <label className="block text-xs font-semibold text-surface-400 mb-1.5 uppercase tracking-wide">Nome da prova</label>
              <input
                type="text"
                placeholder="Meia Maratona do Rio, São Silvestre…"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 placeholder:text-surface-600"
                required
              />
            </div>
          )}

          {/* Date + Location row */}
          {!addResult && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5 uppercase tracking-wide">Data</label>
                <input
                  type="date"
                  value={form.race_date}
                  onChange={(e) => set("race_date", e.target.value)}
                  className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5 uppercase tracking-wide">
                  <MapPin className="w-3.5 h-3.5 inline mr-1" />Local
                </label>
                <input
                  type="text"
                  placeholder="Rio de Janeiro…"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 placeholder:text-surface-600"
                />
              </div>
            </div>
          )}

          {/* Distance */}
          {!addResult && (
            <div>
              <label className="block text-xs font-semibold text-surface-400 mb-1.5 uppercase tracking-wide">Distância</label>
              <div className="flex flex-wrap gap-2">
                {DISTANCE_PRESETS.map((p) => (
                  <button
                    key={p.km}
                    type="button"
                    onClick={() => set("distance_km", String(p.km))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      form.distance_km === String(p.km)
                        ? "bg-brand-500/20 border-brand-500/40 text-brand-400"
                        : "bg-surface-700 border-surface-600 text-surface-400 hover:text-surface-200"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => set("distance_km", "custom")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.distance_km === "custom"
                      ? "bg-brand-500/20 border-brand-500/40 text-brand-400"
                      : "bg-surface-700 border-surface-600 text-surface-400 hover:text-surface-200"
                  }`}
                >
                  Outra
                </button>
              </div>
              {form.distance_km === "custom" && (
                <div className="relative mt-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    placeholder="15.0"
                    value={form.custom_distance}
                    onChange={(e) => set("custom_distance", e.target.value)}
                    className="w-40 bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-500">km</span>
                </div>
              )}
            </div>
          )}

          {/* Has result toggle */}
          {!addResult && (
            <div
              onClick={() => set("has_result", !form.has_result)}
              className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                form.has_result
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-surface-700/40 border-surface-600 hover:border-surface-500"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Trophy className={`w-4 h-4 ${form.has_result ? "text-green-400" : "text-surface-500"}`} />
                <span className={`text-sm font-medium ${form.has_result ? "text-green-300" : "text-surface-400"}`}>
                  {form.has_result ? "Tenho resultado" : "Adicionar resultado (opcional)"}
                </span>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${form.has_result ? "bg-green-500" : "bg-surface-600"}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.has_result ? "translate-x-4" : "translate-x-0"}`} />
              </div>
            </div>
          )}

          {/* Time input — shown when has_result or addResult */}
          {(form.has_result || addResult) && (
            <div>
              <label className="block text-xs font-semibold text-surface-400 mb-1.5 uppercase tracking-wide">
                <Timer className="w-3.5 h-3.5 inline mr-1.5" />
                Tempo oficial
              </label>
              <div className="flex items-center gap-2">
                {/* Hours (optional) */}
                <div className="w-16">
                  <input
                    type="number" min="0" max="9" placeholder="0"
                    value={form.time_hours}
                    onChange={(e) => set("time_hours", e.target.value)}
                    className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                  />
                  <p className="text-xs text-surface-500 text-center mt-1">h</p>
                </div>
                <span className="text-surface-500 text-xl font-bold pb-5">:</span>
                {/* Minutes */}
                <div className="w-16">
                  <input
                    type="number" min="0" max="59" placeholder="48"
                    value={form.time_minutes}
                    onChange={(e) => set("time_minutes", e.target.value)}
                    className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                    required={form.has_result || !!addResult}
                  />
                  <p className="text-xs text-surface-500 text-center mt-1">min</p>
                </div>
                <span className="text-surface-500 text-xl font-bold pb-5">:</span>
                {/* Seconds */}
                <div className="w-16">
                  <input
                    type="number" min="0" max="59" placeholder="32"
                    value={form.time_seconds}
                    onChange={(e) => set("time_seconds", e.target.value)}
                    className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                  />
                  <p className="text-xs text-surface-500 text-center mt-1">seg</p>
                </div>
                {/* Live preview */}
                {resolvedTimeSecs() && (
                  <span className="text-sm font-mono text-surface-300 ml-2">
                    = {timeToString(resolvedTimeSecs()!)}
                  </span>
                )}
              </div>

              {/* Avg HR */}
              <div className="mt-3">
                <label className="block text-xs font-semibold text-surface-400 mb-1.5 uppercase tracking-wide">
                  <Heart className="w-3.5 h-3.5 inline mr-1.5" />
                  FC média (opcional)
                </label>
                <div className="relative w-32">
                  <input
                    type="number" min="100" max="220" placeholder="165"
                    value={form.avg_hr}
                    onChange={(e) => set("avg_hr", e.target.value)}
                    className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-500">bpm</span>
                </div>
              </div>

              {/* Save as test toggle — only for past races with result */}
              {isPastRace && (
                <div
                  onClick={() => set("save_as_test", !form.save_as_test)}
                  className={`mt-3 flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                    form.save_as_test
                      ? "bg-brand-500/10 border-brand-500/30"
                      : "bg-surface-700/40 border-surface-600 hover:border-surface-500"
                  }`}
                >
                  <Info className={`w-4 h-4 shrink-0 mt-0.5 ${form.save_as_test ? "text-brand-400" : "text-surface-500"}`} />
                  <div>
                    <p className={`text-sm font-medium ${form.save_as_test ? "text-brand-300" : "text-surface-400"}`}>
                      Atualizar VDOT &amp; Zonas com este resultado
                    </p>
                    <p className="text-xs text-surface-500 mt-0.5 leading-relaxed">
                      Salva como dado de desempenho — atualiza suas zonas de FC e paces de treino na aba Treinador.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Target race toggle + Notes */}
          {!addResult && (
            <>
              {/* Mark as target race */}
              <div
                onClick={() => set("is_target_race", !form.is_target_race)}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                  form.is_target_race
                    ? "bg-brand-500/10 border-brand-500/30"
                    : "bg-surface-700/40 border-surface-600 hover:border-surface-500"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Target className={`w-4 h-4 ${form.is_target_race ? "text-brand-400" : "text-surface-500"}`} />
                  <span className={`text-sm font-medium ${form.is_target_race ? "text-brand-300" : "text-surface-400"}`}>
                    Marcar como prova alvo
                  </span>
                </div>
                <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${form.is_target_race ? "bg-brand-500" : "bg-surface-600"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_target_race ? "translate-x-4" : "translate-x-0"}`} />
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
                  placeholder="Sensações, condições, estratégia…"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  className="w-full bg-surface-700 border border-surface-600 text-surface-100 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 placeholder:text-surface-600"
                />
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1 pb-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={submitting}>
              {submitting ? "Salvando…" : isEdit ? "Salvar" : "Adicionar prova"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
