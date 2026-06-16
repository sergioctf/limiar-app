"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, Watch, Loader2, Power, Lock } from "lucide-react";
import type { BodyMeasurement, Supplement } from "@/types";
import { BodyCompositionCard } from "@/components/health/BodyCompositionCard";
import { NutritionCard, type NutritionSummary } from "@/components/health/NutritionCard";
import { ReadinessCard } from "@/components/health/ReadinessCard";
import { NativeHealthSync } from "@/components/health/NativeHealthSync";
import { AppleHealthSyncCard } from "@/components/health/AppleHealthSyncCard";
import { SupplementsCard } from "@/components/health/SupplementsCard";
import type { Readiness } from "@/lib/readiness";

interface Props {
  initialBody?: BodyMeasurement[];
  initialSupplements?: Supplement[];
  nutrition?: NutritionSummary;
  readiness?: Readiness;
  healthConnected: boolean;
}

export function HealthContent({
  initialBody = [], initialSupplements = [], nutrition, readiness, healthConnected,
}: Props) {
  const router = useRouter();
  const [connected, setConnected] = useState(healthConnected);
  const [busy, setBusy] = useState(false);

  async function setConnection(value: boolean) {
    setBusy(true);
    try {
      await fetch("/api/health/connection", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connected: value }),
      });
      setConnected(value);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header flex items-center gap-2"><HeartPulse className="w-6 h-6 text-brand-400" /> Saúde</h1>
          <p className="text-surface-500 text-sm">Prontidão, composição corporal, nutrição e suplementação.</p>
        </div>
        {connected && (
          <button onClick={() => setConnection(false)} disabled={busy}
            className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1.5 hover:bg-green-500/15 transition-colors">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Watch className="w-3.5 h-3.5" />}
            Conectado · desativar
          </button>
        )}
      </div>

      <NativeHealthSync />

      {connected ? (
        <>
          {/* Full wellness view */}
          {readiness && <ReadinessCard readiness={readiness} />}
          {nutrition && <NutritionCard data={nutrition} />}
          <BodyCompositionCard initial={initialBody} />
          <SupplementsCard initial={initialSupplements} />
          <AppleHealthSyncCard />
        </>
      ) : (
        <>
          {/* Locked: connect prompt, then only scale + supplements */}
          <div className="card p-5 border-brand-500/25">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-brand-400" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-surface-100">Conecte seu relógio para a prontidão</h2>
                <p className="text-xs text-surface-400 mt-1 leading-relaxed">
                  O <strong className="text-surface-200">Limiar Score</strong> e os insights de nutrição usam sono, HRV e FC de
                  repouso do seu Garmin (via Apple Saúde). Configure o envio automático abaixo e ative.
                  Sem conexão, você ainda usa a <strong className="text-surface-200">balança</strong> e a <strong className="text-surface-200">suplementação</strong>.
                </p>
                <button onClick={() => setConnection(true)} disabled={busy} className="btn-primary mt-3">
                  {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Ativando…</> : <><Power className="w-4 h-4" /> Já configurei — ativar prontidão</>}
                </button>
              </div>
            </div>
          </div>

          <AppleHealthSyncCard />
          <BodyCompositionCard initial={initialBody} />
          <SupplementsCard initial={initialSupplements} />
        </>
      )}
    </div>
  );
}
