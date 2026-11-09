"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight, ChevronLeft, Check, Loader2, X, User, CalendarRange, Link2, FlaskConical,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LimiarMark } from "@/components/LimiarMark";
import { ALL_SPORTS, SPORTS, CATEGORY_LABEL, type SportKey, type SportCategory } from "@/lib/sports";
import type { DayKey } from "@/types";

const DAYS: Array<{ key: DayKey; short: string }> = [
  { key: "Mon", short: "Seg" }, { key: "Tue", short: "Ter" }, { key: "Wed", short: "Qua" },
  { key: "Thu", short: "Qui" }, { key: "Fri", short: "Sex" }, { key: "Sat", short: "Sáb" },
  { key: "Sun", short: "Dom" },
];

interface Props {
  initialName?: string | null;
  initialUsername?: string | null;
  onClose: () => void;
}

/**
 * First-run setup. Unlike a slideshow, every step here writes real
 * configuration — by the end the athlete has a plan built from their own
 * choices instead of defaults.
 */
export function SetupWizard({ initialName, initialUsername, onClose }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — identity
  const [name, setName] = useState(initialName ?? "");
  const [username, setUsername] = useState(initialUsername ?? "");

  // Step 2 — sports
  const [sports, setSports] = useState<SportKey[]>(["corrida", "musculacao"]);

  // Step 3 — weekly layout
  const [runDays, setRunDays] = useState<DayKey[]>(["Tue", "Thu", "Sat"]);
  const [strengthDays, setStrengthDays] = useState<DayKey[]>(["Mon", "Wed", "Fri"]);
  const [longRunDay, setLongRunDay] = useState<DayKey | null>(null);

  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter(x => x !== v) : [...list, v];

  const groups: Array<{ category: SportCategory; list: SportKey[] }> = [
    { category: "cardio", list: ALL_SPORTS.filter(s => SPORTS[s].category === "cardio") },
    { category: "forca",  list: ALL_SPORTS.filter(s => SPORTS[s].category === "forca") },
  ];

  const TOTAL = 4;

  async function saveIdentity(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sessão expirada. Entre novamente."); return false; }

    const { error: err } = await supabase.from("profiles").update({
      name: name.trim() || null,
      username: username.trim().toLowerCase() || null,
    }).eq("id", user.id);

    if (err) {
      setError(/duplicate|unique|23505/i.test(err.message ?? "")
        ? "Esse @username já está em uso. Escolha outro."
        : "Não foi possível salvar seu perfil.");
      return false;
    }
    return true;
  }

  async function saveSports(): Promise<boolean> {
    const res = await fetch("/api/coach/sports", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sports }),
    });
    if (!res.ok) { setError("Não foi possível salvar os esportes."); return false; }
    return true;
  }

  async function saveWeek(): Promise<boolean> {
    const res = await fetch("/api/coach/training-prefs", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      // The athlete saw and confirmed this screen, so the days are a choice.
      body: JSON.stringify({ runDays, strengthDays, longRunDay, qualityPerWeek: 1, runDaysConfirmed: true }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Não foi possível salvar sua semana.");
      return false;
    }
    return true;
  }

  async function next() {
    setError(null);

    // Validate before persisting so a bad step never silently passes.
    if (step === 0) {
      if (!name.trim())     { setError("Como podemos te chamar?"); return; }
      if (!username.trim()) { setError("Escolha um @username para seus amigos te acharem."); return; }
      if (!/^[a-z0-9_.]{3,20}$/i.test(username.trim())) {
        setError("Username: 3 a 20 caracteres, apenas letras, números, ponto e _"); return;
      }
    }
    if (step === 1 && sports.length === 0) { setError("Escolha ao menos um esporte."); return; }
    if (step === 2 && sports.includes("corrida") && runDays.length === 0) {
      setError("Escolha ao menos um dia de corrida."); return;
    }

    setSaving(true);
    try {
      const ok = step === 0 ? await saveIdentity()
        : step === 1 ? await saveSports()
        : step === 2 ? await saveWeek()
        : true;
      if (!ok) return;

      if (step === TOTAL - 1) { finish(); return; }
      setStep(s => s + 1);
    } finally {
      setSaving(false);
    }
  }

  function finish() {
    onClose();
    router.refresh();
  }

  const runsSelected = sports.includes("corrida");

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm overlay-safe">
      <div className="card w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header + progress */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <LimiarMark size={28} />
            <div>
              <p className="font-bold text-surface-100 text-sm">Vamos configurar seu treinador</p>
              <p className="text-[11px] text-surface-500">Passo {step + 1} de {TOTAL}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-surface-500 hover:text-surface-300 p-1 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-brand-500" : "bg-surface-700"}`} />
          ))}
        </div>

        {/* ── Step 1: identity ─────────────────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-3">
            <StepTitle icon={<User className="w-4 h-4 text-brand-400" />} title="Quem é você?"
              subtitle="Seu nome aparece no app; o @username é como amigos te encontram." />
            <div>
              <label className="label">Nome</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Como quer ser chamado" className="input" autoFocus />
            </div>
            <div>
              <label className="label">Username</label>
              <div className="flex items-center gap-1.5">
                <span className="text-surface-500">@</span>
                <input value={username}
                  onChange={e => setUsername(e.target.value.replace(/\s/g, "").toLowerCase())}
                  placeholder="seu_username" className="input flex-1" />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: sports ───────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-3">
            <StepTitle icon={<span aria-hidden>🏃</span>} title="O que você pratica?"
              subtitle="O plano só programa os esportes que você marcar." />
            {groups.map(({ category, list }) => (
              <div key={category} className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold">
                  {CATEGORY_LABEL[category]}
                </p>
                <div className="flex flex-wrap gap-2">
                  {list.map(s => {
                    const on = sports.includes(s);
                    return (
                      <button key={s} onClick={() => setSports(toggle(sports, s))}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                          on ? "bg-brand-500 border-brand-400 text-white"
                             : "bg-surface-700/40 border-surface-700 text-surface-400 hover:text-surface-200"
                        }`}>
                        <span aria-hidden>{SPORTS[s].emoji}</span>{SPORTS[s].label}
                        {on && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 3: weekly layout ────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-3">
            <StepTitle icon={<CalendarRange className="w-4 h-4 text-brand-400" />} title="Como é sua semana?"
              subtitle="Escolha os dias. Nada é fixo — dá para mudar quando quiser." />

            {runsSelected && (
              <>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1.5">
                    Dias de corrida ({runDays.length})
                  </p>
                  <DayPicker days={runDays} onToggle={d => setRunDays(toggle(runDays, d))} color="bg-brand-500" />
                </div>
                {runDays.length > 1 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1.5">
                      Qual é o longão?
                    </p>
                    <div className="flex gap-1 flex-wrap">
                      {DAYS.filter(d => runDays.includes(d.key)).map(d => (
                        <button key={d.key} onClick={() => setLongRunDay(d.key)}
                          className={`px-3 min-h-[44px] py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                            (longRunDay ?? runDays[runDays.length - 1]) === d.key
                              ? "bg-purple-500 text-white" : "bg-surface-700/50 text-surface-400"
                          }`}>{d.short}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {sports.includes("musculacao") && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1.5">
                  Dias de musculação ({strengthDays.length})
                </p>
                <DayPicker days={strengthDays} onToggle={d => setStrengthDays(toggle(strengthDays, d))} color="bg-blue-500" />
              </div>
            )}

            <p className="text-[11px] text-surface-500">
              As sessões são distribuídas como leve → forte → longão nos dias que você escolher.
            </p>
          </div>
        )}

        {/* ── Step 4: bring data in ────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-3">
            <StepTitle icon={<Link2 className="w-4 h-4 text-brand-400" />} title="Últimos passos"
              subtitle="Isso pode ficar para depois — o app já funciona." />

            <a href="/settings" className="card-hover p-3 flex items-start gap-3">
              <span className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
                <Link2 className="w-4 h-4 text-brand-400" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-surface-100">Conectar o Strava</p>
                <p className="text-xs text-surface-500">Suas corridas entram sozinhas, com pace, FC e GPS.</p>
              </div>
            </a>

            <a href="/coach" className="card-hover p-3 flex items-start gap-3">
              <span className="w-8 h-8 rounded-lg bg-pink-500/15 flex items-center justify-center shrink-0">
                <FlaskConical className="w-4 h-4 text-pink-400" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-surface-100">Teste de 3 km</p>
                <p className="text-xs text-surface-500">
                  Define seus ritmos e zonas de FC. Sem ele, o app estima pelas suas corridas.
                </p>
              </div>
            </a>

            <p className="text-[11px] text-surface-500">
              Ao concluir, seu plano da semana é gerado com o que você escolheu aqui.
            </p>
          </div>
        )}

        {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

        {/* Nav */}
        <div className="flex items-center gap-2 pt-1">
          {step > 0 && (
            <button onClick={() => { setStep(s => s - 1); setError(null); }} disabled={saving}
              className="btn-secondary text-xs py-2 px-3">
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
          )}
          <button onClick={next} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" />
              : step === TOTAL - 1 ? <>Concluir <Check className="w-4 h-4" /></>
              : <>Continuar <ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>

        {step < TOTAL - 1 && (
          <button onClick={onClose} className="text-[11px] text-surface-500 hover:text-surface-400 w-full">
            Configurar depois
          </button>
        )}
      </div>
    </div>
  );
}

function StepTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div>
      <p className="font-bold text-surface-100 flex items-center gap-2">{icon}{title}</p>
      <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

function DayPicker({ days, onToggle, color }: {
  days: DayKey[]; onToggle: (d: DayKey) => void; color: string;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {DAYS.map(d => {
        const on = days.includes(d.key);
        return (
          <button key={d.key} onClick={() => onToggle(d.key)} aria-pressed={on}
            className={`py-2 rounded-lg text-[11px] font-bold transition-colors ${
              on ? `${color} text-white` : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
            }`}>
            {d.short}
          </button>
        );
      })}
    </div>
  );
}
