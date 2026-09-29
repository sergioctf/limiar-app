"use client";

/**
 * Saúde, antes de existir um relógio.
 *
 * A tela media HRV, sono, frequência de repouso e energia. Sem aparelho, tudo
 * isso ficava vazio e sobrava um questionário — uma seção inteira sobre dados
 * que a pessoa não tem. Um usuário novo entrou nesta semana e foi isso que
 * encontrou.
 *
 * Aqui a seção diz o que ela é e o que falta para ligá-la, e nada mais. Sem
 * números inventados, sem check-in pedindo que a pessoa substitua o sensor.
 */
import Link from "next/link";
import { Activity, ArrowRight, HeartPulse, Lock, Moon } from "lucide-react";
import { Card, Section } from "@/components/ui/Surface";
import { HEALTH_DEVICES } from "@/lib/health-access";

const WHAT_YOU_GET = [
  { icon: <Moon className="h-4 w-4" />, text: "Sono e HRV da noite, medidos pelo relógio" },
  { icon: <HeartPulse className="h-4 w-4" />, text: "Recuperação diária cruzando o corpo com a carga de treino" },
  { icon: <Activity className="h-4 w-4" />, text: "Energia gasta e balanço calórico do dia" },
];

export function HealthLocked() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-6 pb-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-700/60">
          <Lock className="h-5 w-5 text-surface-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-surface-100">Saúde</h1>
          <p className="mt-0.5 text-sm text-surface-400">
            Esta seção precisa de um aparelho conectado.
          </p>
        </div>
      </div>

      <Section title="O que ela mostra">
        <Card>
          <ul className="space-y-2.5">
            {WHAT_YOU_GET.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-surface-300">
                <span className="mt-0.5 shrink-0 text-surface-500">{item.icon}</span>
                {item.text}
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section title="Conectar" subtitle="Qualquer um dos três abre a seção">
        <Card density="tight">
          <ul className="divide-y divide-surface-700/50">
            {HEALTH_DEVICES.map(d => (
              <li key={d.key} className="py-3 first:pt-1 last:pb-1">
                <p className="text-sm font-semibold text-surface-100">{d.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-surface-500">{d.detail}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Link
          href="/settings"
          className="mt-3 flex min-h-[52px] items-center justify-between rounded-2xl border border-surface-700 px-4 transition-colors hover:border-brand-500/50"
        >
          <span className="text-sm font-medium text-surface-200">Conectar em Configurações</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-brand-400" />
        </Link>
      </Section>

      {/*
        O treino não depende disto.

        Quem não tem relógio continua com plano, agenda, registro e conselheiro
        — dizer isso evita que a seção bloqueada seja lida como "o app só
        funciona com aparelho".
      */}
      <p className="px-1 text-xs leading-relaxed text-surface-500">
        Seu treino não depende de nenhum aparelho: o plano, a semana e o conselheiro
        funcionam com as corridas que você registra.
      </p>
    </div>
  );
}
