"use client";

import { useEffect, useState } from "react";
import { UserPlus, Users, Sparkles, Loader2, Check, RefreshCw } from "lucide-react";

interface Suggestion {
  userId:   string;
  name:     string | null;
  username: string | null;
  kind:     "amigos_em_comum" | "novo_no_app" | "perfil_parecido" | "descobrir";
  reason:   string;
  mutuals:  number;
}

const ICON = {
  amigos_em_comum: Users,
  novo_no_app:     Sparkles,
  perfil_parecido: RefreshCw,
  descobrir:       UserPlus,
} as const;

const TINT = {
  amigos_em_comum: "text-brand-400",
  novo_no_app:     "text-green-400",
  perfil_parecido: "text-blue-400",
  descobrir:       "text-surface-500",
} as const;

/**
 * People the athlete might know.
 *
 * The reason under each name is the whole point. "Talvez você conheça" is a
 * shrug; "2 amigos em comum" is something you can act on — so every card
 * carries a computed fact rather than a generic label.
 */
export function SuggestionsCard({ onAdded }: { onAdded?: () => void }) {
  const [items, setItems]   = useState<Suggestion[]>([]);
  const [note, setNote]     = useState<string | null>(null);
  const [loading, setLoad]  = useState(true);
  const [sending, setSend]  = useState<string | null>(null);
  const [sent, setSent]     = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/friends/suggestions")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return;
        setItems(d.suggestions ?? []);
        setNote(d.note ?? null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoad(false); });
    return () => { cancelled = true; };
  }, []);

  async function add(s: Suggestion) {
    setSend(s.userId);
    try {
      const res = await fetch("/api/friends", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: s.userId }),
      });
      if (res.ok) {
        setSent(prev => new Set(prev).add(s.userId));
        onAdded?.();
      }
    } catch {
      // A failed request leaves the button ready to try again — no error state
      // for something the athlete can simply tap once more.
    } finally {
      setSend(null);
    }
  }

  if (loading) {
    return (
      <div className="card p-4 flex items-center gap-2 text-surface-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Procurando pessoas…
      </div>
    );
  }

  if (items.length === 0 && !note) return null;

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h3 className="font-bold text-surface-100 text-sm flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-brand-400" /> Pessoas que você pode conhecer
        </h3>
        <p className="text-[11px] text-surface-500 mt-0.5">
          A lista muda toda segunda-feira.
        </p>
      </div>

      <div className="space-y-1.5">
        {items.map(s => {
          const Icon = ICON[s.kind];
          const done = sent.has(s.userId);
          return (
            <div key={s.userId}
              className="flex items-center gap-3 rounded-xl bg-surface-700/30 p-2.5">
              <span className="w-9 h-9 rounded-full bg-surface-700 grid place-items-center shrink-0 text-xs font-bold text-surface-300">
                {(s.name ?? s.username ?? "?").slice(0, 1).toUpperCase()}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-surface-100 truncate">
                  {s.name ?? s.username ?? "Atleta"}
                </p>
                <p className={`text-[10px] flex items-center gap-1 ${TINT[s.kind]}`}>
                  <Icon className="w-2.5 h-2.5 shrink-0" /> {s.reason}
                </p>
              </div>

              <button
                onClick={() => add(s)}
                disabled={done || sending === s.userId}
                className={`shrink-0 text-[11px] font-semibold rounded-lg px-3 min-h-[44px] py-1.5 transition-colors ${
                  done
                    ? "bg-green-500/15 text-green-300"
                    : "bg-brand-500/15 text-brand-300 hover:bg-brand-500/25"
                }`}
              >
                {sending === s.userId ? <Loader2 className="w-3 h-3 animate-spin" />
                  : done ? <span className="flex items-center gap-1"><Check className="w-3 h-3" /> enviado</span>
                  : "Adicionar"}
              </button>
            </div>
          );
        })}
      </div>

      {note && <p className="text-[10px] text-surface-500 leading-relaxed">{note}</p>}
    </div>
  );
}
