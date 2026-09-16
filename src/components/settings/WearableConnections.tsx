"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Watch, Activity, Smartphone, Check, Clock, Loader2, ExternalLink } from "lucide-react";

/**
 * Every source of health data, in one place, with its real state.
 *
 * They were scattered: Strava in settings, Apple Health and Whoop under Saúde,
 * and Garmin nowhere at all. Someone with a Garmin had no way to find out
 * whether the app could read it — the honest answer being "not yet, and here is
 * why" rather than a button that goes nowhere.
 *
 * A dead button is worse than an explanation. Each row says what the source
 * brings, whether it can be connected today, and what is in the way when it
 * cannot.
 */

type State = "conectado" | "disponivel" | "nao_configurado" | "requer_aprovacao";

interface Source {
  key:      string;
  name:     string;
  brings:   string;
  icon:     React.ReactNode;
  tint:     string;
  state:    State;
  action?:  { label: string; href: string; external?: boolean };
  note?:    string;
}

const BADGE: Record<State, { label: string; className: string; icon: React.ReactNode }> = {
  conectado:        { label: "Conectado",       className: "text-green-400 bg-green-500/10",   icon: <Check className="w-3 h-3" /> },
  disponivel:       { label: "Disponível",      className: "text-brand-400 bg-brand-500/10",   icon: null },
  nao_configurado:  { label: "Não configurado", className: "text-surface-400 bg-surface-700",  icon: null },
  requer_aprovacao: { label: "Requer aprovação", className: "text-yellow-400 bg-yellow-500/10", icon: <Clock className="w-3 h-3" /> },
};

export function WearableConnections() {
  const [whoop, setWhoop] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [health, setHealth] = useState<{ connected: boolean; energy?: unknown } | null>(null);
  const [garmin, setGarmin] = useState<{ available: boolean; connected: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/whoop/sync").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/health/wellness-status").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/integrations/intervals").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([w, h, g]) => {
      if (cancelled) return;
      setWhoop(w ?? { configured: false, connected: false });
      setHealth(h ?? { connected: false });
      setGarmin(g ?? { available: false, connected: false });
    });
    return () => { cancelled = true; };
  }, []);

  if (!whoop || !health || !garmin) {
    return (
      <div className="card p-5 flex items-center gap-2 text-surface-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando conexões…
      </div>
    );
  }

  const sources: Source[] = [
    {
      key: "garmin",
      name: "Garmin",
      brings: "HRV, FC de repouso e sono de qualquer Garmin — inclusive o CIRQA.",
      icon: <Watch className="w-4 h-4 text-blue-400" />,
      tint: "bg-blue-500/15",
      state: garmin.connected ? "conectado" : garmin.available ? "disponivel" : "nao_configurado",
      action: garmin.connected
        ? undefined
        : { label: "Conectar pelo intervals.icu", href: "/health" },
      note: garmin.connected
        ? "Via intervals.icu. Sincroniza ao abrir o app e toda manhã."
        : "A Garmin pausou o acesso de apps novos à API em 2026. O intervals.icu é parceiro antigo " +
          "e continua recebendo tudo, então a conexão passa por ele.",
    },
    {
      key: "whoop",
      name: "Whoop",
      brings: "Recuperação, HRV, FC de repouso e estágios de sono, todo dia.",
      icon: <Activity className="w-4 h-4 text-red-400" />,
      tint: "bg-red-500/15",
      state: whoop.connected ? "conectado" : whoop.configured ? "disponivel" : "nao_configurado",
      action: whoop.configured && !whoop.connected
        ? { label: "Conectar Whoop", href: "/api/whoop/authorize" }
        : undefined,
      note: whoop.configured
        ? undefined
        : "Integração pronta, faltam as credenciais do app no servidor.",
    },
    {
      key: "apple",
      name: "Apple Saúde",
      brings: "Calorias do dia medidas pelo relógio — e sono e HRV de quem usa Apple Watch.",
      icon: <Smartphone className="w-4 h-4 text-surface-300" />,
      tint: "bg-surface-700",
      // Energy is the only thing a Garmin wearer gets from Apple Health, so it
      // is what "connected" means here — not any wellness row, which intervals.icu
      // may have written on its own.
      state: health.energy ? "conectado" : "disponivel",
      action: { label: health.energy ? "Ver configuração" : "Configurar", href: "/health" },
      note: health.energy
        ? undefined
        : "Um Atalho do iPhone com duas somas — uns 5 minutos para montar.",
    },
  ];

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
          <Watch className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <h2 className="section-title">Relógios e anéis</h2>
          <p className="text-xs text-surface-500">De onde vêm sono, recuperação e HRV</p>
        </div>
      </div>

      <div className="space-y-2">
        {sources.map(s => {
          const badge = BADGE[s.state];
          return (
            <div key={s.key} className="rounded-xl bg-surface-700/30 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className={`w-8 h-8 rounded-lg ${s.tint} flex items-center justify-center shrink-0`}>
                    {s.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-surface-200">{s.name}</p>
                    <p className="text-[11px] text-surface-500 leading-relaxed">{s.brings}</p>
                  </div>
                </div>
                <span className={`badge shrink-0 flex items-center gap-1 ${badge.className}`}>
                  {badge.icon}{badge.label}
                </span>
              </div>

              {s.note && (
                <p className="text-[11px] text-surface-500 leading-relaxed pl-[2.625rem]">{s.note}</p>
              )}

              {s.action && (
                s.action.external ? (
                  <a
                    href={s.action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost text-xs text-surface-400 hover:text-surface-200 w-full justify-center"
                  >
                    {s.action.label} <ExternalLink className="w-3 h-3" />
                  </a>
                ) : s.action.href.startsWith("/api/") ? (
                  <a href={s.action.href} className="btn-primary w-full text-xs">{s.action.label}</a>
                ) : (
                  <Link href={s.action.href} className="btn-secondary w-full text-xs">{s.action.label}</Link>
                )
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-surface-500 leading-relaxed">
        Corridas e pedaladas chegam pelo Strava, logo acima — estas conexões são para
        o que o Strava não carrega: como o corpo estava antes do treino.
      </p>
    </div>
  );
}
