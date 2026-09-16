"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shuffle, ArrowRight, Loader2, Check, X, TrendingUp, TrendingDown } from "lucide-react";
import { MUSCLE_LABEL, type MuscleGroup } from "@/lib/exercises";
import type { DayKey } from "@/types";

interface SplitDay { day: DayKey; muscles: MuscleGroup[] }
interface FrequencyChange { muscle: MuscleGroup; label: string; before: number; after: number }
interface Proposal {
  worthIt:   boolean;
  before:    SplitDay[];
  after:     SplitDay[];
  frequency: FrequencyChange[];
  summary:   string;
  reason?:   string;
}

const DAY_PT: Record<DayKey, string> = {
  Mon: "Seg", Tue: "Ter", Wed: "Qua", Thu: "Qui", Fri: "Sex", Sat: "Sáb", Sun: "Dom",
};

/**
 * "Here is what your week would become." Then, and only then, a button.
 *
 * The advisor could see that a split trained every muscle once a week but
 * deliberately offered no action, because rewriting somebody's whole week
 * behind one tap is not a decision to make quietly. The result was that the
 * most useful observation was the only one you could not act on.
 *
 * Showing both weeks side by side resolves that: the athlete sees exactly what
 * changes, including what gets worse, and decides. A proposal that does not fit
 * their life is supposed to be refusable.
 */
export function SplitRebalanceCard() {
  const router = useRouter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/split-proposal")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setProposal(d ?? { worthIt: false } as Proposal); })
      .catch(() => { if (!cancelled) setProposal({ worthIt: false } as Proposal); });
    return () => { cancelled = true; };
  }, []);

  // Silent when there is nothing to propose — a card that always says "your
  // split is fine" is a card people learn to scroll past.
  if (!proposal?.worthIt) return null;

  if (done) {
    return (
      <div className="card p-4 flex items-start gap-2 border-green-500/30 bg-green-500/[0.06]">
        <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
        <p className="text-sm text-surface-300">
          Split reorganizado e plano da semana refeito. Os exercícios de cada dia
          foram escolhidos de novo para os músculos novos.
        </p>
      </div>
    );
  }

  async function apply() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/split-proposal", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Não foi possível aplicar.");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Falha na conexão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4 space-y-3 border-brand-500/30 bg-brand-500/[0.04]">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
          <Shuffle className="w-4 h-4 text-brand-400" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-surface-100 text-sm">Dá para reorganizar seu split</h3>
          <p className="text-[11px] text-surface-400 leading-relaxed mt-0.5">{proposal.summary}</p>
        </div>
      </div>

      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-secondary w-full text-xs">
          Ver como ficaria
        </button>
      ) : (
        <>
          {/* Day by day, both weeks visible at once. */}
          <div className="space-y-1">
            <div className="grid grid-cols-[2rem_1fr_1rem_1fr] gap-2 text-[10px] uppercase tracking-wide text-surface-500 font-semibold px-1">
              <span />
              <span>Hoje</span>
              <span />
              <span>Proposto</span>
            </div>
            {proposal.before.map((d, i) => {
              const after = proposal.after[i];
              const mudou = d.muscles.join() !== after.muscles.join();
              return (
                <div
                  key={d.day}
                  className={`grid grid-cols-[2rem_1fr_1rem_1fr] gap-2 items-center rounded-lg px-1 py-1.5 ${
                    mudou ? "bg-surface-700/40" : ""
                  }`}
                >
                  <span className="text-[11px] font-bold text-surface-400">{DAY_PT[d.day]}</span>
                  <span className="text-[11px] text-surface-500 leading-snug">
                    {d.muscles.map(m => MUSCLE_LABEL[m]).join(", ") || "—"}
                  </span>
                  <ArrowRight className={`w-3 h-3 ${mudou ? "text-brand-400" : "text-surface-700"}`} />
                  <span className={`text-[11px] leading-snug ${mudou ? "text-surface-200 font-medium" : "text-surface-500"}`}>
                    {after.muscles.map(m => MUSCLE_LABEL[m]).join(", ") || "—"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* What each muscle gains or loses — including the losses. */}
          <div className="rounded-xl bg-surface-700/30 p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1">
              Vezes por semana
            </p>
            {proposal.frequency.map(f => {
              const delta = f.after - f.before;
              return (
                <div key={f.muscle} className="flex items-center justify-between text-[11px]">
                  <span className="text-surface-400">{f.label}</span>
                  <span className={`tabular-nums flex items-center gap-1 ${
                    delta > 0 ? "text-green-400" : delta < 0 ? "text-yellow-400" : "text-surface-500"
                  }`}>
                    {f.before}× → {f.after}×
                    {delta > 0 && <TrendingUp className="w-3 h-3" />}
                    {delta < 0 && <TrendingDown className="w-3 h-3" />}
                  </span>
                </div>
              );
            })}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button onClick={apply} disabled={saving} className="btn-primary flex-1 text-xs">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Aplicar este split
            </button>
            <button
              onClick={() => setOpen(false)}
              disabled={saving}
              className="btn-secondary text-xs"
            >
              <X className="w-4 h-4" /> Manter o meu
            </button>
          </div>

          <p className="text-[10px] text-surface-500 leading-relaxed">
            Seus dias de academia continuam os mesmos — muda só o que treina em cada um.
            O plano da semana é refeito na hora, e você pode voltar atrás editando a
            musculação abaixo.
          </p>
        </>
      )}
    </div>
  );
}
