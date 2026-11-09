"use client";

import { useEffect, useState } from "react";
import {
  Dumbbell, Loader2, Check, Info, ChevronDown, ChevronUp, Plus, X, AlertCircle,
} from "lucide-react";
import {
  GOAL_LABEL, EXPERIENCE_LABEL, SPLIT_TEMPLATES,
  type StrengthPrefs, type StrengthGoal, type Experience,
  type StylePreference, type CardioMachine, type StrengthDayPlan,
} from "@/lib/strength-prefs";
import {
  MUSCLE_LABEL, EQUIPMENT_LABEL, exerciseById,
  type MuscleGroup, type Equipment,
} from "@/lib/exercises";
import { CARDIO_INTENSITY_LABEL } from "@/lib/cardio-builder";
import { ExercisePicker } from "@/components/coach/ExercisePicker";
import type { DayKey } from "@/types";

const DAYS: Array<{ key: DayKey; short: string }> = [
  { key: "Mon", short: "Seg" }, { key: "Tue", short: "Ter" }, { key: "Wed", short: "Qua" },
  { key: "Thu", short: "Qui" }, { key: "Fri", short: "Sex" }, { key: "Sat", short: "Sáb" },
  { key: "Sun", short: "Dom" },
];

const MUSCLES: MuscleGroup[] = [
  "peito", "costas", "ombro", "biceps", "triceps",
  "quadriceps", "posterior", "gluteo", "panturrilha", "core",
];

const CARDIO: Array<{ key: CardioMachine; label: string }> = [
  { key: "nenhum", label: "Nenhum" }, { key: "esteira", label: "Esteira" },
  { key: "escada", label: "Escada" }, { key: "bike", label: "Bike" },
];

/**
 * Strength configuration. The athlete decides everything here — days, muscles,
 * equipment, cardio add-ons, exercises they like and want to avoid. The coach
 * reads this and suggests refinements later; it never overrides these choices.
 */
export function StrengthPrefsCard() {
  const [prefs, setPrefs] = useState<StrengthPrefs | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exercisePicker, setExercisePicker] = useState<"favorites" | "avoid" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/strength-prefs")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.prefs) return;
        setPrefs(d.prefs);
        setWarnings(d.warnings ?? []);
        setStorageReady(d.storageReady !== false);
        if (d.prefs.days.length === 0) setOpen(true);   // nothing set up yet
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function save(next: StrengthPrefs) {
    setPrefs(next);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/coach/strength-prefs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
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
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando musculação…
      </div>
    );
  }

  const dayFor = (d: DayKey) => prefs.days.find(x => x.day === d) ?? null;

  function toggleDay(day: DayKey) {
    const existing = dayFor(day);
    const days = existing
      ? prefs!.days.filter(x => x.day !== day)
      : [...prefs!.days, { day, muscles: [] as MuscleGroup[], cardio: null }];
    setPrefs({ ...prefs!, days });   // local only — saved once muscles are picked
  }

  function toggleMuscle(day: DayKey, muscle: MuscleGroup) {
    const days = prefs!.days.map(d =>
      d.day !== day ? d
        : { ...d, muscles: d.muscles.includes(muscle)
            ? d.muscles.filter(m => m !== muscle)
            : [...d.muscles, muscle] });
    save({ ...prefs!, days });
  }

  function setCardio(day: DayKey, patch: Partial<NonNullable<StrengthDayPlan["cardio"]>>) {
    const days = prefs!.days.map(d => {
      if (d.day !== day) return d;
      const base = d.cardio ?? { machine: "esteira" as CardioMachine, minutes: 15, position: "depois" as const };
      const merged = { ...base, ...patch };
      return { ...d, cardio: merged.machine === "nenhum" ? null : merged };
    });
    save({ ...prefs!, days });
  }

  function applyTemplate(templateId: string) {
    const tpl = SPLIT_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;
    const chosen = prefs!.days.map(d => d.day);
    const base = chosen.length > 0 ? chosen : (["Mon", "Wed", "Fri"] as DayKey[]);
    save({ ...prefs!, days: tpl.build(base) });
  }

  return (
    <div className="card p-4 space-y-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-blue-400" />
          <div className="text-left">
            <h3 className="font-bold text-surface-100 text-sm">Musculação</h3>
            <p className="text-[11px] text-surface-500">
              {prefs.days.length > 0
                ? `${prefs.days.length} dia(s) · ${GOAL_LABEL[prefs.goal].label}`
                : "Ainda não configurada"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin text-surface-500" />
            : saved ? <Check className="w-4 h-4 text-green-400" /> : null}
          {open ? <ChevronUp className="w-4 h-4 text-surface-500" /> : <ChevronDown className="w-4 h-4 text-surface-500" />}
        </div>
      </button>

      {open && (
        <div className="space-y-5">
          {!storageReady && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-surface-300">
                As escolhas ainda não podem ser salvas — falta criar a coluna <code>strength_prefs</code> no banco.
              </p>
            </div>
          )}

          {/* ── Goal ─────────────────────────────────────────────────────── */}
          <Section title="Qual é o seu objetivo?" hint="Muda volume, faixa de repetições e duração da sessão.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(GOAL_LABEL) as StrengthGoal[]).map(g => (
                <button key={g} onClick={() => save({ ...prefs, goal: g })}
                  className={`text-left rounded-xl border p-2.5 transition-colors ${
                    prefs.goal === g ? "bg-brand-500/15 border-brand-500/40" : "bg-surface-700/30 border-surface-700 hover:border-surface-600"
                  }`}>
                  <p className={`text-xs font-semibold ${prefs.goal === g ? "text-brand-300" : "text-surface-200"}`}>
                    {GOAL_LABEL[g].label}
                  </p>
                  <p className="text-[10px] text-surface-500 mt-0.5 leading-snug">{GOAL_LABEL[g].hint}</p>
                </button>
              ))}
            </div>
          </Section>

          {/* ── Experience ───────────────────────────────────────────────── */}
          <Section title="Há quanto tempo você treina?" hint="Define complexidade dos exercícios e progressão.">
            <div className="flex gap-1.5">
              {(Object.keys(EXPERIENCE_LABEL) as Experience[]).map(e => (
                <button key={e} onClick={() => save({ ...prefs, experience: e })}
                  className={`flex-1 rounded-lg py-2 px-2 text-[11px] font-semibold transition-colors ${
                    prefs.experience === e ? "bg-brand-500 text-white" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
                  }`}>
                  {EXPERIENCE_LABEL[e].label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-surface-500 mt-1">{EXPERIENCE_LABEL[prefs.experience].hint}</p>
          </Section>

          {/* ── Equipment ────────────────────────────────────────────────── */}
          <Section title="O que você tem disponível?" hint="Só entram exercícios que você consegue executar.">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map(eq => {
                const on = prefs.equipment.includes(eq);
                return (
                  <button key={eq}
                    onClick={() => save({
                      ...prefs,
                      equipment: on ? prefs.equipment.filter(x => x !== eq) : [...prefs.equipment, eq],
                    })}
                    className={`rounded-lg min-h-[44px] py-1.5 px-2.5 text-[11px] font-semibold transition-colors ${
                      on ? "bg-blue-500 text-white" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
                    }`}>
                    {EQUIPMENT_LABEL[eq]}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ── Session length + style ───────────────────────────────────── */}
          <Section title="Quanto tempo por sessão?" hint="Define quantos exercícios cabem.">
            <div className="flex gap-1.5">
              {[30, 45, 60, 75, 90].map(m => (
                <button key={m} onClick={() => save({ ...prefs, sessionMinutes: m })}
                  className={`flex-1 rounded-lg py-2 text-[11px] font-semibold transition-colors ${
                    prefs.sessionMinutes === m ? "bg-brand-500 text-white" : "bg-surface-700/50 text-surface-400"
                  }`}>{m}min</button>
              ))}
            </div>
            <div className="flex gap-1.5 mt-2">
              {(["barra", "halter", "maquina", "misto"] as StylePreference[]).map(s => (
                <button key={s} onClick={() => save({ ...prefs, style: s })}
                  className={`flex-1 rounded-lg min-h-[44px] py-1.5 text-[11px] font-semibold capitalize transition-colors ${
                    prefs.style === s ? "bg-surface-600 text-surface-100" : "bg-surface-700/50 text-surface-500"
                  }`}>{s}</button>
              ))}
            </div>
          </Section>

          {/* ── Days & muscles ──────────────────────────────────────────── */}
          <Section title="Quais dias e quais músculos?" hint="Toque no dia para ativar, depois escolha os grupos.">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS.map(d => {
                const on = !!dayFor(d.key);
                return (
                  <button key={d.key} onClick={() => toggleDay(d.key)}
                    className={`min-h-[44px] rounded-lg text-xs font-bold transition-colors ${
                      on ? "bg-blue-500 text-white" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
                    }`}>{d.short}</button>
                );
              })}
            </div>

            {prefs.days.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="text-[10px] text-surface-500 self-center mr-1">Divisão pronta:</span>
                {SPLIT_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => applyTemplate(t.id)} title={t.hint}
                    className="rounded-lg min-h-[44px] py-1 px-2 text-[10px] font-semibold bg-surface-700/50 text-surface-400 hover:text-surface-200">
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2.5">
              {DAYS.filter(d => dayFor(d.key)).map(d => {
                const plan = dayFor(d.key)!;
                return (
                  <div key={d.key} className="bg-surface-700/30 rounded-xl p-2.5">
                    <p className="text-[11px] font-bold text-surface-200 mb-1.5">{d.short}</p>
                    <div className="flex flex-wrap gap-1">
                      {MUSCLES.map(m => {
                        const on = plan.muscles.includes(m);
                        return (
                          <button key={m} onClick={() => toggleMuscle(d.key, m)}
                            className={`rounded-md min-h-[44px] py-1 px-2 text-[10px] font-semibold transition-colors ${
                              on ? "bg-brand-500 text-white" : "bg-surface-800 text-surface-500 hover:text-surface-300"
                            }`}>{MUSCLE_LABEL[m]}</button>
                        );
                      })}
                    </div>

                    {/* Cardio add-on */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-surface-700/50">
                      <span className="text-[10px] text-surface-500">Cardio junto:</span>
                      {CARDIO.map(c => {
                        const on = (plan.cardio?.machine ?? "nenhum") === c.key;
                        return (
                          <button key={c.key} onClick={() => setCardio(d.key, { machine: c.key })}
                            className={`rounded-md min-h-[44px] py-1 px-2 text-[10px] font-semibold transition-colors ${
                              on ? "bg-brand-500 text-white" : "bg-surface-800 text-surface-500 hover:text-surface-300"
                            }`}>{c.label}</button>
                        );
                      })}
                      {plan.cardio && (
                        <>
                          <select
                            value={plan.cardio.minutes}
                            onChange={e => setCardio(d.key, { minutes: Number(e.target.value) })}
                            className="bg-surface-800 border border-surface-700 rounded-md text-[10px] text-surface-300 px-1.5 py-1"
                          >
                            {[10, 15, 20, 30, 40].map(m => <option key={m} value={m}>{m} min</option>)}
                          </select>
                          <select
                            value={plan.cardio.position}
                            onChange={e => setCardio(d.key, { position: e.target.value as "antes" | "depois" })}
                            className="bg-surface-800 border border-surface-700 rounded-md text-[10px] text-surface-300 px-1.5 py-1"
                          >
                            <option value="depois">depois</option>
                            <option value="antes">antes</option>
                          </select>
                          <select
                            value={plan.cardio.intensity ?? "aerobico"}
                            onChange={e => setCardio(d.key, {
                              intensity: e.target.value as NonNullable<StrengthDayPlan["cardio"]>["intensity"],
                            })}
                            title="Intensidade do cardio"
                            className="bg-surface-800 border border-surface-700 rounded-md text-[10px] text-surface-300 px-1.5 py-1"
                          >
                            {(Object.keys(CARDIO_INTENSITY_LABEL) as Array<keyof typeof CARDIO_INTENSITY_LABEL>)
                              .map(k => (
                                <option key={k} value={k}>{CARDIO_INTENSITY_LABEL[k].label}</option>
                              ))}
                          </select>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ── Exercise preferences ────────────────────────────────────── */}
          <Section title="Exercícios que você gosta ou quer evitar"
                   hint="Favoritos entram sempre que fizerem sentido; evitados nunca aparecem.">
            {(["favorites", "avoid"] as const).map(kind => (
              <div key={kind} className="mb-2">
                <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1">
                  {kind === "favorites" ? "Favoritos" : "Evitar"}
                </p>
                <div className="flex flex-wrap gap-1">
                  {prefs[kind].map(id => {
                    const ex = exerciseById(id);
                    return (
                      <button key={id}
                        onClick={() => save({ ...prefs, [kind]: prefs[kind].filter(x => x !== id) })}
                        className={`flex items-center gap-1 rounded-md min-h-[44px] py-1 px-2 text-[10px] font-medium ${
                          kind === "favorites" ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"
                        }`}>
                        {ex?.name ?? id} <X className="w-2.5 h-2.5" />
                      </button>
                    );
                  })}
                  <button onClick={() => setExercisePicker(exercisePicker === kind ? null : kind)}
                    className="flex items-center gap-1 rounded-md min-h-[44px] py-1 px-2 text-[10px] font-semibold bg-surface-700/50 text-surface-400 hover:text-surface-200">
                    <Plus className="w-2.5 h-2.5" /> adicionar
                  </button>
                </div>
              </div>
            ))}

            {exercisePicker && (
              <ExercisePicker
                onPick={id => {
                  save({ ...prefs, [exercisePicker]: [...prefs[exercisePicker], id] });
                  setExercisePicker(null);
                }}
                onCancel={() => setExercisePicker(null)}
                exclude={[...prefs.favorites, ...prefs.avoid]}
              />
            )}
          </Section>

          {/* ── Limitations ─────────────────────────────────────────────── */}
          <Section title="Alguma lesão ou limitação?" hint="Usado para evitar exercícios que te machucam.">
            <textarea
              value={prefs.limitations}
              onChange={e => setPrefs({ ...prefs, limitations: e.target.value })}
              onBlur={() => save(prefs)}
              rows={2}
              placeholder="Ex: dor no ombro direito em supino; joelho sensível a agachamento profundo"
              className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2 text-xs text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
            />
          </Section>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {warnings.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-surface-700/50">
              {warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-surface-500 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-surface-500" />{w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, hint, children }: {
  title: string; hint: string; children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-surface-200">{title}</p>
      <p className="text-[10px] text-surface-500 mb-2">{hint}</p>
      {children}
    </div>
  );
}
