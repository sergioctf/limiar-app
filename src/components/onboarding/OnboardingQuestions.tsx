"use client";

import { useState } from "react";
import { Loader2, Check, Link2, Bell, Trophy } from "lucide-react";
import { MUSCLE_LABEL, type MuscleGroup } from "@/lib/exercises";
import type { QuestionField } from "@/lib/onboarding-flow";
import { testDateOptions } from "@/lib/planned-test";
import { formatTestDate } from "@/components/coach/ScheduleTestSheet";
import { localDateStr } from "@/lib/week";
import type { DayKey } from "@/types";
import type { MeasureBy } from "@/lib/measure";

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
    case "measureBy": return <MeasureQuestion onSaved={onSaved} />;
    case "strength": return <StrengthQuestion onSaved={onSaved} />;
    case "strava":   return <StravaQuestion />;
    case "test":     return <TestQuestion onSaved={onSaved} />;
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

/**
 * Quilômetros ou minutos.
 *
 * Não é uma pergunta de configuração: é a unidade em que a pessoa vai ler o
 * próprio treino todo dia. Por isso vem logo depois dos dias de corrida, e por
 * isso cada opção diz o que acontece, não só o nome dela.
 *
 * O padrão sugerido é quilômetro — a escolha do Sérgio para quem começa, porque
 * é o número que aparece na prova e na conversa com os amigos (15/10).
 */
function MeasureQuestion({ onSaved }: { onSaved: () => void }) {
  const [escolha, setEscolha] = useState<MeasureBy>("km");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/coach/training-prefs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measureBy: escolha }),
      });
      if (res.ok) { setSaved(true); setTimeout(onSaved, 600); }
    } catch { /* pulável por desenho */ }
    finally { setSaving(false); }
  }

  const opcoes: Array<{ key: MeasureBy; titulo: string; detalhe: string }> = [
    { key: "km",   titulo: "Quilômetros", detalhe: '"Corra 8 km hoje" — recomendado para quem está começando.' },
    { key: "time", titulo: "Minutos",     detalhe: '"Corra 45 minutos hoje" — o esforço fica igual nos dias ruins.' },
  ];

  return (
    <div className="space-y-2">
      {opcoes.map(o => {
        const on = escolha === o.key;
        return (
          <button
            key={o.key}
            onClick={() => setEscolha(o.key)}
            aria-pressed={on}
            className={`w-full rounded-xl border p-3 text-left transition-colors ${
              on ? "border-brand-500/60 bg-brand-500/10" : "border-surface-700 hover:border-surface-600"
            }`}
          >
            <p className={`text-sm font-bold ${on ? "text-brand-300" : "text-surface-200"}`}>{o.titulo}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-surface-500">{o.detalhe}</p>
          </button>
        );
      })}
      <SaveButton saving={saving} saved={saved} onClick={save} />
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

/**
 * Marcar o teste de 3 km já no primeiro acesso.
 *
 * É a pergunta que fecha o fluxo porque é a que dá ritmo ao plano — e porque
 * agora dá para responder: desde 29/09 o teste pode ser **marcado** para um
 * dia, em vez de só registrado depois de feito (ver `lib/planned-test.ts`).
 *
 * Sem modal: uma fileira de dias e pronto. Um calendário dentro de um fluxo
 * que já é uma tela cheia é uma camada a mais para quem está se cadastrando.
 */
function TestQuestion({ onSaved }: { onSaved: () => void }) {
  const [date, setDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const options = testDateOptions(localDateStr(new Date())).slice(0, 6);

  async function save() {
    if (!date) return;
    setSaving(true);
    try {
      const res = await fetch("/api/coach/planned-test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (res.ok) { setSaved(true); setTimeout(onSaved, 600); }
    } catch { /* skippable by design */ }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {options.map(d => (
          <button
            key={d}
            onClick={() => setDate(d)}
            className={`min-h-[44px] rounded-xl border px-2 text-xs font-semibold transition-colors ${
              date === d
                ? "border-brand-500/60 bg-brand-500/15 text-brand-200"
                : "border-surface-700 bg-surface-800 text-surface-400"
            }`}
          >
            {formatTestDate(d)}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-surface-500">
        6 km no dia: 2 de aquecimento, 3 no limite e 1 de volta à calma. Dá para remarcar depois.
      </p>
      <SaveButton saving={saving} saved={saved} onClick={save} disabled={!date} label="Marcar o teste" />
    </div>
  );
}
