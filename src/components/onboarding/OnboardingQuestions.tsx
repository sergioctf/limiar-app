"use client";

import { useState } from "react";
import { Loader2, Check, Link2, Bell, Trophy } from "lucide-react";
import { MUSCLE_LABEL, type MuscleGroup } from "@/lib/exercises";
import type { QuestionField } from "@/lib/onboarding-flow";
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

/**
 * The forms behind the onboarding questions.
 *
 * Each writes through the same API the settings screens use — no parallel save
 * path, so a value set here and a value set later cannot disagree. Failure is
 * never fatal: the flow is skippable by design, and anything unsaved reappears
 * in the dashboard checklist.
 */
export function OnboardingQuestion({
  field, onSaved,
}: {
  field: QuestionField;
  /** Called after a successful save so the flow can advance. */
  onSaved: () => void;
}) {
  switch (field) {
    case "identity": return <IdentityQuestion onSaved={onSaved} />;
    case "runDays":  return <RunDaysQuestion onSaved={onSaved} />;
    case "strength": return <StrengthQuestion onSaved={onSaved} />;
    case "strava":   return <StravaQuestion />;
    case "push":     return <PushQuestion />;
    case "goal":     return <GoalQuestion />;
  }
}

/* ── shared ──────────────────────────────────────────────────────────────── */

function SaveButton({ saving, saved, onClick, label = "Salvar e continuar", disabled }: {
  saving: boolean; saved: boolean; onClick: () => void; label?: string; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={saving || saved || disabled}
      className="btn-primary w-full justify-center disabled:opacity-50">
      {saving ? <Loader2 className="w-4 h-4 animate-spin" />
        : saved ? <><Check className="w-4 h-4" /> Pronto</>
        : label}
    </button>
  );
}

function DayPicker({ value, onChange }: { value: DayKey[]; onChange: (v: DayKey[]) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {DAYS.map(d => {
        const on = value.includes(d.key);
        return (
          <button key={d.key}
            onClick={() => onChange(on ? value.filter(x => x !== d.key) : [...value, d.key])}
            className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors ${
              on ? "bg-brand-500 text-white" : "bg-surface-700/50 text-surface-400"
            }`}>
            {d.short}
          </button>
        );
      })}
    </div>
  );
}

/* ── questions ───────────────────────────────────────────────────────────── */

function IdentityQuestion({ onSaved }: { onSaved: () => void }) {
  const [first, setFirst] = useState("");
  const [last, setLast]   = useState("");
  const [user, setUser]   = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    setSaving(true); setProblem(null);
    try {
      const res = await fetch("/api/profile/identity", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: first, lastName: last, username: user }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok) { setSaved(true); setTimeout(onSaved, 600); }
      else setProblem(d?.problems?.firstName ?? d?.problems?.lastName ?? d?.problems?.username ?? "Não foi possível salvar.");
    } catch { setProblem("Falha na conexão."); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input value={first} onChange={e => setFirst(e.target.value)} placeholder="Nome" className="input" />
        <input value={last} onChange={e => setLast(e.target.value)} placeholder="Sobrenome" className="input" />
      </div>
      <input value={user} onChange={e => setUser(e.target.value)} placeholder="@username" className="input" />
      {problem && <p className="text-[11px] text-red-400">{problem}</p>}
      <SaveButton saving={saving} saved={saved} onClick={save}
                  disabled={!first.trim() || !last.trim() || !user.trim()} />
    </div>
  );
}

function RunDaysQuestion({ onSaved }: { onSaved: () => void }) {
  const [days, setDays] = useState<DayKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/coach/training-prefs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runDays: days, runDaysConfirmed: true }),
      });
      if (res.ok) { setSaved(true); setTimeout(onSaved, 600); }
    } catch { /* skippable by design */ }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-2">
      <DayPicker value={days} onChange={setDays} />
      <p className="text-[10px] text-surface-500">
        O longão cai no último dia da sequência — dá para mudar depois.
      </p>
      <SaveButton saving={saving} saved={saved} onClick={save} disabled={days.length === 0} />
    </div>
  );
}

function StrengthQuestion({ onSaved }: { onSaved: () => void }) {
  const [days, setDays] = useState<DayKey[]>([]);
  const [muscles, setMuscles] = useState<MuscleGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  async function save() {
    setSaving(true);
    try {
      // Same muscle set on every chosen day is a deliberate starting point:
      // asking someone to design a split before their first session is more
      // than they can answer, and the coach refines it from what they log.
      const res = await fetch("/api/coach/strength-prefs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: days.map(d => ({ day: d, muscles, cardio: null })) }),
      });
      if (res.ok) { setSaved(true); setTimeout(onSaved, 600); }
    } catch { /* skippable by design */ }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-2">
      <DayPicker value={days} onChange={setDays} />
      <div className="flex flex-wrap gap-1">
        {MUSCLES.map(m => {
          const on = muscles.includes(m);
          return (
            <button key={m}
              onClick={() => setMuscles(on ? muscles.filter(x => x !== m) : [...muscles, m])}
              className={`text-xs px-3 min-h-[44px] rounded-full border transition-colors ${
                on ? "bg-brand-500/20 border-brand-500/40 text-surface-100"
                   : "bg-surface-800 border-surface-700 text-surface-400"
              }`}>
              {MUSCLE_LABEL[m]}
            </button>
          );
        })}
      </div>
      <SaveButton saving={saving} saved={saved} onClick={save}
                  disabled={days.length === 0 || muscles.length === 0} />
    </div>
  );
}

function StravaQuestion() {
  return (
    <a href="/api/strava/connect"
       className="btn-primary w-full justify-center">
      <Link2 className="w-4 h-4" /> Conectar o Strava
    </a>
  );
}

function PushQuestion() {
  const [asked, setAsked] = useState(false);
  return (
    <button
      onClick={async () => { setAsked(true); try { await Notification.requestPermission(); } catch { /* negado */ } }}
      disabled={asked}
      className="btn-primary w-full justify-center disabled:opacity-50">
      <Bell className="w-4 h-4" /> {asked ? "Permissão solicitada" : "Ativar avisos"}
    </button>
  );
}

function GoalQuestion() {
  return (
    <a href="/races" className="btn-secondary w-full justify-center">
      <Trophy className="w-4 h-4" /> Cadastrar uma prova
    </a>
  );
}
