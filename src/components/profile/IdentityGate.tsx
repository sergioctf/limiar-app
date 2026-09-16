"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, UserCircle2 } from "lucide-react";

interface Problems { firstName?: string; lastName?: string; username?: string }

/**
 * Asks for the athlete's name, surname and handle when the profile is missing
 * one of them.
 *
 * It blocks rather than nags. These three fields are what every other person in
 * the app sees — a leaderboard row reading "pedro" with no surname, or a friend
 * search that cannot resolve a handle, is a worse experience for everyone else
 * than one interruption is for the athlete.
 *
 * Deliberately not dismissible, and deliberately shown once: after saving, it
 * never appears again.
 */
export function IdentityGate() {
  const [open, setOpen]       = useState(false);
  const [first, setFirst]     = useState("");
  const [last, setLast]       = useState("");
  const [username, setUser]   = useState("");
  const [ideas, setIdeas]     = useState<string[]>([]);
  const [problems, setProbs]  = useState<Problems>({});
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/identity")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.needsIdentity) return;
        setFirst(d.firstName ?? "");
        setLast(d.lastName ?? "");
        setUser(d.username ?? "");
        setIdeas(d.suggestions ?? []);
        setOpen(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setSaving(true);
    setProbs({});
    try {
      const res = await fetch("/api/profile/identity", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: first, lastName: last, username }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setOpen(false), 900);
      } else {
        setProbs(d?.problems ?? { username: d?.error ?? "Não foi possível salvar." });
      }
    } catch {
      setProbs({ username: "Falha na conexão." });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-sm overlay-safe">
      <div className="card w-full max-w-sm p-5 space-y-4">
        <div className="flex items-start gap-3">
          <UserCircle2 className="w-6 h-6 text-brand-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-surface-100 text-sm">Complete seu perfil</h2>
            <p className="text-[11px] text-surface-500 leading-relaxed mt-0.5">
              É como seus amigos te encontram e te reconhecem no ranking.
            </p>
          </div>
        </div>

        <Field label="Nome" value={first} onChange={setFirst} problem={problems.firstName}
               placeholder="Sérgio" autoFocus />
        <Field label="Sobrenome" value={last} onChange={setLast} problem={problems.lastName}
               placeholder="Carmelo" />
        <Field label="@username" value={username} onChange={setUser} problem={problems.username}
               placeholder="sergiocarmelo" />

        {ideas.length > 0 && !username && (
          <div className="flex flex-wrap gap-1.5">
            {ideas.map(i => (
              <button key={i} onClick={() => setUser(i)}
                className="text-[10px] px-2 min-h-[44px] py-1 rounded-full bg-surface-700/60 text-surface-300 hover:text-brand-300">
                @{i}
              </button>
            ))}
          </div>
        )}

        <button onClick={save} disabled={saving || saved}
          className="btn-primary w-full justify-center disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" />
            : saved ? <><Check className="w-4 h-4" /> Pronto!</>
            : "Salvar"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, problem, placeholder, autoFocus,
}: {
  label: string; value: string; onChange: (v: string) => void;
  problem?: string; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="stat-label mb-1 block">{label}</label>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-surface-700 border rounded-xl px-3 py-2 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none ${
          problem ? "border-red-500/50 focus:border-red-500" : "border-surface-600 focus:border-brand-500"
        }`}
      />
      {problem && <p className="text-[10px] text-red-400 mt-1">{problem}</p>}
    </div>
  );
}
