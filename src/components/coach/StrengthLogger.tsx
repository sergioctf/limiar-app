"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X, Loader2, Check, TrendingUp, History, AlertTriangle,
  Plus, Trash2, Minus, ChevronDown, Copy,
} from "lucide-react";
import { exerciseById } from "@/lib/exercises";
import { ExerciseImage } from "./ExerciseImage";
import { ExercisePicker } from "./ExercisePicker";
import type { StrengthSession } from "@/lib/strength-builder";
import type { ProgressionAdvice, SessionSummary } from "@/lib/strength-progression";
import type { WeeklyPlanDay } from "@/types";

interface HistoryEntry {
  sessions: SessionSummary[];
  advice:   ProgressionAdvice;
}

interface SetEntry {
  weightKg: string;
  reps:     string;
  rir:      string;
}

/** One exercise as it stands in this session — prescribed or added by hand. */
interface Row {
  exerciseId: string;
  name:       string;
  reps:       [number, number];
  rir:        number;
  timeBased:  boolean;
  /** False for anything the athlete added themselves. */
  prescribed: boolean;
  image?:     string;
}

/**
 * The last few sessions, set by set, with a one-tap way to reuse one.
 *
 * Progressive load with regressive reps is a structure the athlete carries from
 * week to week; a single "top weight" number cannot express it, so the raw
 * sequence is what gets shown.
 */
function SetHistory({
  sessions, onCopy,
}: {
  sessions: SessionSummary[];
  onCopy: (sets: SessionSummary["detail"]) => void;
}) {
  const withDetail = sessions.filter(s => s.detail.length > 0).slice(0, 3);

  if (withDetail.length === 0) {
    return (
      <p className="text-[10px] text-surface-500 bg-surface-800/60 rounded-lg px-2.5 py-2">
        Sem série registrada ainda para este exercício.
      </p>
    );
  }

  return (
    <div className="bg-surface-800/60 rounded-lg p-2.5 space-y-2">
      {withDetail.map(s => (
        <div key={s.date} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold text-surface-400">{s.date}</p>
            <button
              type="button"
              onClick={() => onCopy(s.detail)}
              className="text-[10px] text-brand-400 hover:text-brand-300 inline-flex items-center gap-1"
            >
              <Copy className="w-2.5 h-2.5" /> repetir
            </button>
          </div>
          <div className="space-y-0.5">
            {s.detail.map(set => (
              <div key={set.setIndex} className="grid grid-cols-[1.25rem_1fr_1fr_1fr] gap-1.5 text-[10px]">
                <span className="text-surface-500">{set.setIndex}</span>
                <span className="font-mono text-surface-200">
                  {set.weightKg != null ? `${set.weightKg} kg` : "—"}
                </span>
                <span className="font-mono text-surface-300">
                  {set.reps != null ? `${set.reps} reps` : "—"}
                </span>
                <span className="text-surface-500">
                  {set.rir != null ? `RIR ${set.rir}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const DAY_KEYS: WeeklyPlanDay["day"][] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_PT: Record<string, string> = {
  Mon: "segunda", Tue: "terça", Wed: "quarta", Thu: "quinta",
  Fri: "sexta", Sat: "sábado", Sun: "domingo",
};

/**
 * Log what was actually lifted — and edit the session while doing it.
 *
 * The gym does not follow the plan: a machine is taken, a movement hurts that
 * day, something else looked better. Forcing the athlete to log a session they
 * did not do makes the record useless, and the record is what the whole load
 * progression stands on.
 *
 * So the list is editable here, and what they save becomes the day's roster
 * from the next week on — the plan converges on their real gym instead of
 * re-proposing the same substitution forever.
 */
export function StrengthLogger({
  session, date, onClose, onRosterChange,
}: {
  session: StrengthSession;
  date: string;
  onClose: () => void;
  /** Fired when the day's exercise list was carried forward. */
  onRosterChange?: () => void;
}) {
  const [rows, setRows]       = useState<Row[]>([]);
  const [entries, setEntries] = useState<Record<string, SetEntry[]>>({});
  const [history, setHistory] = useState<Record<string, HistoryEntry>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(true);
  const [keepForNextWeeks, setKeep] = useState(true);
  const [picking, setPicking]  = useState(false);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const dayKey = DAY_KEYS[new Date(`${date}T12:00:00`).getDay()];

  // Seed from the prescription; everything after this is the athlete's edit.
  useEffect(() => {
    const seedRows: Row[] = session.exercises.map(ex => ({
      exerciseId: ex.exerciseId, name: ex.name, reps: ex.reps,
      rir: ex.rir, timeBased: !!ex.timeBased, prescribed: true,
      image: exerciseById(ex.exerciseId)?.image,
    }));
    setRows(seedRows);

    const seed: Record<string, SetEntry[]> = {};
    for (const ex of session.exercises) {
      seed[ex.exerciseId] = Array.from({ length: ex.sets }, () => ({ weightKg: "", reps: "", rir: "" }));
    }
    setEntries(seed);

    let cancelled = false;
    fetch(`/api/strength/log?exercises=${seedRows.map(r => r.exerciseId).join(",")}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return;
        setHistory(d.history ?? {});
        setStorageReady(d.storageReady !== false);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const edited = useMemo(() => {
    const original = session.exercises.map(e => e.exerciseId).join(",");
    return rows.map(r => r.exerciseId).join(",") !== original;
  }, [rows, session.exercises]);

  function update(exId: string, idx: number, field: keyof SetEntry, value: string) {
    setEntries(prev => {
      const list = [...(prev[exId] ?? [])];
      list[idx] = { ...list[idx], [field]: value };
      return { ...prev, [exId]: list };
    });
  }

  /** Copying the first set down is how people actually log straight sets. */
  function fillDown(exId: string) {
    setEntries(prev => {
      const list = prev[exId] ?? [];
      if (list.length === 0) return prev;
      return { ...prev, [exId]: list.map(() => ({ ...list[0] })) };
    });
  }

  function addSet(exId: string) {
    setEntries(prev => {
      const list = prev[exId] ?? [];
      const lastRow = list[list.length - 1];
      // A new set almost always repeats the last one — start it there.
      return { ...prev, [exId]: [...list, lastRow ? { ...lastRow } : { weightKg: "", reps: "", rir: "" }] };
    });
  }

  function removeSet(exId: string) {
    setEntries(prev => {
      const list = prev[exId] ?? [];
      return list.length <= 1 ? prev : { ...prev, [exId]: list.slice(0, -1) };
    });
  }

  function removeExercise(exId: string) {
    setRows(prev => prev.filter(r => r.exerciseId !== exId));
    setEntries(prev => {
      const next = { ...prev };
      delete next[exId];
      return next;
    });
  }

  function addExercise(id: string) {
    const ex = exerciseById(id);
    if (!ex || rows.some(r => r.exerciseId === id)) return;

    setRows(prev => [...prev, {
      exerciseId: ex.id, name: ex.name, reps: ex.reps,
      rir: 2, timeBased: ex.reps[1] > 30, prescribed: false,
      image: ex.image,
    }]);
    setEntries(prev => ({
      ...prev,
      [ex.id]: Array.from({ length: 3 }, () => ({ weightKg: "", reps: "", rir: "" })),
    }));
    setPicking(false);

    // Load its history so the suggestion shows up like any other exercise.
    fetch(`/api/strength/log?exercises=${ex.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.history) setHistory(prev => ({ ...prev, ...d.history })); })
      .catch(() => {});
  }

  const taken = useMemo(() => rows.map(r => r.exerciseId), [rows]);

  /**
   * Load a past session straight into the inputs.
   *
   * Someone running a pyramid is repeating a structure, not a number — and
   * retyping 40/45/50 every week is exactly the friction that stops people
   * logging at all. Editable afterwards, so it is a starting point, not a lock.
   */
  function copyFromHistory(exId: string, sets: SessionSummary["detail"]) {
    if (sets.length === 0) return;
    setEntries(prev => ({
      ...prev,
      [exId]: sets.map(s => ({
        weightKg: s.weightKg != null ? String(s.weightKg) : "",
        reps:     s.reps     != null ? String(s.reps)     : "",
        rir:      s.rir      != null ? String(s.rir)      : "",
      })),
    }));
    setOpenHistory(null);
  }

  async function save() {
    setSaving(true);
    setError(null);

    const sets = rows.flatMap(row =>
      (entries[row.exerciseId] ?? []).map((r, i) => ({
        exerciseId: row.exerciseId, setIndex: i + 1,
        weightKg: r.weightKg === "" ? null : Number(r.weightKg.replace(",", ".")),
        reps:     r.reps === "" ? null : Number(r.reps),
        rir:      r.rir === "" ? null : Number(r.rir),
      })).filter(s => s.reps != null || s.weightKg != null),
    );

    if (sets.length === 0) { setError("Preencha ao menos uma série."); setSaving(false); return; }

    try {
      const res = await fetch("/api/strength/log", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date, sets, dayKey,
          exercises: rows.map(r => r.exerciseId),
          keep: keepForNextWeeks,
        }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok) {
        setSaved(true);
        if (d?.rosterUpdated) onRosterChange?.();
        setTimeout(onClose, 1200);
      } else {
        setError(d?.error ?? "Não foi possível salvar.");
      }
    } catch {
      setError("Falha na conexão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm overlay-safe">
      <div className="card w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-surface-100">Registrar treino</h2>
            <p className="text-xs text-surface-500">
              Ajuste para o que você realmente fez — é daqui que sai a progressão de carga.
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-surface-500 hover:text-surface-300 p-1 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!storageReady && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-surface-300">
              O registro ainda não pode ser salvo — falta criar a tabela <code>strength_logs</code> no banco.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-surface-500" /></div>
        ) : (
          <div className="space-y-4">
            {rows.map(ex => {
              const advice = history[ex.exerciseId]?.advice;
              const last = advice?.last;
              const setRows = entries[ex.exerciseId] ?? [];

              return (
                <div key={ex.exerciseId} className={`rounded-xl p-3 ${
                  ex.prescribed ? "bg-surface-700/30" : "bg-brand-500/[0.06] border border-brand-500/20"
                }`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <ExerciseImage
                        exercise={{ name: ex.name, image: ex.image, exerciseId: ex.exerciseId }}
                        size="sm"
                        zoomable
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-surface-100">
                          {ex.name}
                          {!ex.prescribed && (
                            <span className="text-[10px] text-brand-400 font-normal"> · adicionado</span>
                          )}
                        </p>
                        <p className="text-[10px] text-surface-500">
                          Alvo: {setRows.length} × {ex.timeBased ? `${ex.reps[0]}-${ex.reps[1]}s` : `${ex.reps[0]}-${ex.reps[1]}`} · RIR {ex.rir}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => fillDown(ex.exerciseId)}
                        className="text-[10px] text-brand-400 hover:text-brand-300">
                        repetir 1ª
                      </button>
                      <button onClick={() => removeExercise(ex.exerciseId)}
                        aria-label={`Remover ${ex.name}`}
                        className="text-surface-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Coaching context: what happened last time, what to do now */}
                  {advice && (
                    <div className="space-y-1 mb-2">
                      {last && (
                        <button
                          type="button"
                          onClick={() => setOpenHistory(h => h === ex.exerciseId ? null : ex.exerciseId)}
                          className="w-full text-left text-[10px] text-surface-500 hover:text-surface-300 flex items-start gap-1.5 transition-colors"
                        >
                          <History className="w-3 h-3 shrink-0 mt-0.5" />
                          <span className="flex-1">
                            Última ({last.date}): {last.topWeight != null ? `${last.topWeight} kg · ` : ""}
                            {last.sets} séries · {last.totalReps} reps
                            {last.avgRir != null && ` · RIR ${last.avgRir}`}
                          </span>
                          <ChevronDown className={`w-3 h-3 shrink-0 mt-0.5 transition-transform ${
                            openHistory === ex.exerciseId ? "rotate-180" : ""
                          }`} />
                        </button>
                      )}

                      {/*
                        The summary reports a top weight, which erases pyramids:
                        40×12 / 45×10 / 50×8 and 50×8 three times both top out at
                        50 kg. Repeating a progression needs the sequence.
                      */}
                      {openHistory === ex.exerciseId && (
                        <SetHistory
                          sessions={history[ex.exerciseId]?.sessions ?? []}
                          onCopy={sets => copyFromHistory(ex.exerciseId, sets)}
                        />
                      )}
                      <p className={`text-[10px] flex items-start gap-1.5 ${
                        advice.stalled ? "text-yellow-400" : "text-brand-400"
                      }`}>
                        <TrendingUp className="w-3 h-3 shrink-0 mt-0.5" />
                        {advice.weightKg != null && <strong className="mr-1">{advice.weightKg} kg —</strong>}
                        {advice.reason}
                      </p>
                    </div>
                  )}

                  {/* Set rows */}
                  <div className="space-y-1">
                    <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr] gap-1.5 text-[10px] text-surface-500 uppercase">
                      <span></span><span>Carga (kg)</span><span>{ex.timeBased ? "Seg." : "Reps"}</span><span>RIR</span>
                    </div>
                    {setRows.map((row, i) => (
                      <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_1fr] gap-1.5 items-center">
                        <span className="text-[10px] text-surface-500 text-center">{i + 1}</span>
                        <input inputMode="decimal" value={row.weightKg}
                          onChange={e => update(ex.exerciseId, i, "weightKg", e.target.value)}
                          placeholder={advice?.weightKg != null ? String(advice.weightKg) : "—"}
                          className="bg-surface-800 border border-surface-700 rounded-lg px-2 py-1.5 text-xs text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500" />
                        <input inputMode="numeric" value={row.reps}
                          onChange={e => update(ex.exerciseId, i, "reps", e.target.value)}
                          placeholder={String(ex.reps[1])}
                          className="bg-surface-800 border border-surface-700 rounded-lg px-2 py-1.5 text-xs text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500" />
                        <input inputMode="numeric" value={row.rir}
                          onChange={e => update(ex.exerciseId, i, "rir", e.target.value)}
                          placeholder={String(ex.rir)}
                          className="bg-surface-800 border border-surface-700 rounded-lg px-2 py-1.5 text-xs text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500" />
                      </div>
                    ))}

                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => addSet(ex.exerciseId)}
                        className="text-[10px] text-surface-400 hover:text-brand-300 inline-flex items-center gap-1">
                        <Plus className="w-3 h-3" /> série
                      </button>
                      {setRows.length > 1 && (
                        <button onClick={() => removeSet(ex.exerciseId)}
                          className="text-[10px] text-surface-500 hover:text-surface-300 inline-flex items-center gap-1">
                          <Minus className="w-3 h-3" /> série
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* ── Add an exercise the plan didn't ask for ──────────────────── */}
            {picking ? (
              <ExercisePicker
                onPick={addExercise}
                onCancel={() => setPicking(false)}
                exclude={taken}
              />
            ) : (
              <button
                onClick={() => setPicking(true)}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold rounded-xl py-2.5 bg-surface-700/40 text-surface-300 hover:text-brand-300 hover:bg-surface-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar exercício
              </button>
            )}
          </div>
        )}

        {/* ── Carry the edit forward ───────────────────────────────────────── */}
        {edited && (
          <label className="flex items-start gap-2.5 bg-brand-500/[0.06] border border-brand-500/20 rounded-lg p-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={keepForNextWeeks}
              onChange={e => setKeep(e.target.checked)}
              className="mt-0.5 accent-brand-500"
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-surface-200">
                Manter nas próximas semanas
              </span>
              <span className="block text-[10px] text-surface-500 leading-relaxed mt-0.5">
                O treino de {DAY_PT[dayKey]} passa a usar estes exercícios.
                Desmarque se hoje foi exceção.
              </span>
            </span>
          </label>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button onClick={save} disabled={saving || saved || rows.length === 0}
          className="btn-primary w-full justify-center disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" />
            : saved ? <><Check className="w-4 h-4" /> Registrado!</>
            : "Salvar treino"}
        </button>
      </div>
    </div>
  );
}
