"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Rocket, X } from "lucide-react";
import { SetupWizard } from "@/components/onboarding/SetupWizard";

interface Step {
  key: string; label: string; hint: string; href: string; done: boolean; core: boolean;
}

interface Status {
  steps: Step[]; done: number; total: number; complete: boolean;
}

const SNOOZE_KEY = "limiar_setup_snoozed_until";
const SNOOZE_DAYS = 3;

interface Props {
  name?: string | null;
  username?: string | null;
}

/**
 * Setup progress, derived from real data.
 *
 * Replaces the old "no runs yet" welcome, which vanished the moment a run was
 * imported — hiding setup from precisely the athletes who had configured
 * nothing. This stays until the essentials are actually done.
 */
export function SetupChecklist({ name, username }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [wizard, setWizard] = useState(false);
  const [snoozed, setSnoozed] = useState(true);   // assume hidden until checked

  useEffect(() => {
    const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    setSnoozed(until > Date.now());

    let cancelled = false;
    fetch("/api/onboarding/status")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.steps) setStatus(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function reload() {
    fetch("/api/onboarding/status")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.steps) setStatus(d); })
      .catch(() => {});
  }

  function snooze() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400_000));
    setSnoozed(true);
  }

  // Nothing to nag about once the essentials are in place — but a wizard the
  // athlete opened stays open until they close it.
  const showCard = !!status && !status.complete && !snoozed;
  const pct = status ? Math.round((status.done / status.total) * 100) : 0;
  const firstUndone = status?.steps.find(s => !s.done);

  return (
    <>
      {showCard && status && (
      <div className="card p-4 border-brand-500/25 bg-brand-500/5 relative">
        <button
          onClick={snooze}
          aria-label="Lembrar depois"
          title="Lembrar depois"
          className="absolute top-3 right-3 text-surface-500 hover:text-surface-300 p-1"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
            <Rocket className="w-4.5 h-4.5 text-brand-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-surface-100 text-sm">
              Configure seu treinador — {status.done} de {status.total}
            </p>
            <p className="text-xs text-surface-400 mt-0.5">
              {firstUndone ? firstUndone.hint : "Quase lá."}
            </p>

            {/* Progress */}
            <div className="h-1.5 rounded-full bg-surface-700 overflow-hidden mt-2.5">
              <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="mt-3 space-y-1">
          {status.steps.map(s => (
            <Link
              key={s.key}
              href={s.href}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                s.done ? "opacity-50" : "hover:bg-surface-700/40"
              }`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                s.done ? "bg-green-500/20" : "border border-surface-600"
              }`}>
                {s.done && <Check className="w-2.5 h-2.5 text-green-400" />}
              </span>
              <span className={`text-xs flex-1 min-w-0 truncate ${s.done ? "text-surface-500 line-through" : "text-surface-300"}`}>
                {s.label}
                {!s.core && <span className="text-surface-500"> · opcional</span>}
              </span>
              {!s.done && <ChevronRight className="w-3.5 h-3.5 text-surface-500 shrink-0" />}
            </Link>
          ))}
        </div>

        <button onClick={() => setWizard(true)} className="btn-primary w-full justify-center mt-3 text-xs py-2">
          Configurar agora (2 min)
        </button>
      </div>
      )}

      {wizard && (
        <SetupWizard
          initialName={name}
          initialUsername={username}
          onClose={() => { setWizard(false); reload(); }}
        />
      )}
    </>
  );
}
