"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Rocket, X } from "lucide-react";
import { SetupWizard } from "@/components/onboarding/SetupWizard";

interface Step {
  key: string; label: string; hint: string; href: string; done: boolean; core: boolean;
  /** "Marcado para sex, 3 de out" — quando o passo já tem data, deixa de cobrar. */
  note?: string | null;
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
 * O que falta configurar — **um passo de cada vez**.
 *
 * Nasceu substituindo o "você ainda não tem corridas", que sumia assim que uma
 * corrida era importada e escondia a configuração justamente de quem não tinha
 * configurado nada. Esta versão fica até o essencial estar pronto.
 *
 * O que mudou em 01/10: ele mostrava os seis passos de uma vez, com barra de
 * progresso e um botão de assistente. Para quem está perdido — o caso que
 * originou a revisão —, seis caminhos simultâneos é a mesma confusão da tela
 * cheia, em miniatura. Agora o card mostra **o próximo passo** e um jeito de
 * ver os outros, para quem quiser.
 */
export function SetupChecklist({ name, username }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [wizard, setWizard] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
  const next = status?.steps.find(s => !s.done) ?? null;
  const rest = status?.steps.filter(s => s !== next) ?? [];
  const faltam = status ? status.total - status.done : 0;

  return (
    <>
      {showCard && status && next && (
      <div className="card relative border-brand-500/25 bg-brand-500/5 p-4">
        <button
          onClick={snooze}
          aria-label="Lembrar depois"
          title="Lembrar depois"
          className="absolute right-3 top-3 p-1 text-surface-500 hover:text-surface-300"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── O próximo passo, e só ele ─────────────────────────────────── */}
        <div className="flex items-start gap-3 pr-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/20">
            <Rocket className="h-4.5 w-4.5 text-brand-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-300">
              Próximo passo
            </p>
            <p className="mt-0.5 text-sm font-bold text-surface-100">{next.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-surface-400">{next.hint}</p>
          </div>
        </div>

        <Link
          href={next.href}
          className="btn-primary mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-xs"
        >
          {next.label} <ArrowRight className="h-3.5 w-3.5" />
        </Link>

        {/*
          O resto existe, mas não disputa a tela. Quem quer ver a lista inteira
          abre; quem está perdido tem uma coisa para fazer.
        */}
        {rest.length > 0 && (
          <>
            <button
              onClick={() => setExpanded(v => !v)}
              className="mt-2 flex min-h-[40px] w-full items-center justify-center gap-1 text-[11px] text-surface-500 transition-colors hover:text-surface-300"
            >
              {expanded ? "Esconder" : `Ver os outros ${faltam > 1 ? `(${faltam - 1} faltando)` : ""}`}
              <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>

            {expanded && (
              <div className="mt-1 space-y-1">
                {rest.map(s => (
                  <Link
                    key={s.key}
                    href={s.href}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                      s.done ? "opacity-50" : "hover:bg-surface-700/40"
                    }`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      s.done ? "bg-green-500/20" : "border border-surface-600"
                    }`}>
                      {s.done && <Check className="h-2.5 w-2.5 text-green-400" />}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-xs ${s.done ? "text-surface-500 line-through" : "text-surface-300"}`}>
                      {s.label}
                      {s.note && <span className="text-surface-500"> · {s.note}</span>}
                      {!s.core && !s.note && <span className="text-surface-500"> · opcional</span>}
                    </span>
                  </Link>
                ))}
                <button
                  onClick={() => setWizard(true)}
                  className="mt-1 min-h-[40px] w-full text-[11px] text-surface-400 transition-colors hover:text-brand-300"
                >
                  Responder tudo de uma vez
                </button>
              </div>
            )}
          </>
        )}
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
