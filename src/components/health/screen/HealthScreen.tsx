"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HeartPulse, Watch, Flame, Activity, Loader2, RefreshCw } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { Section, Reveal } from "@/components/ui/Surface";
import { Disclosure } from "@/components/ui/Disclosure";
import { RecoveryHero } from "./RecoveryHero";
import { GarminReadinessField } from "./GarminReadinessField";
import { VitalTiles } from "./VitalTiles";
import { LoadRecoveryChart } from "./LoadRecoveryChart";
import { SleepCard } from "./SleepCard";
import { ContributorsCard } from "./ContributorsCard";
import { MonitorCard } from "./MonitorCard";
import { EnergyCard } from "./EnergyCard";
import { CheckinSheet } from "./CheckinSheet";
import { CheckinPanel } from "./CheckinPanel";
import { IntervalsCard } from "@/components/health/IntervalsCard";
import { AppleHealthSyncCard } from "@/components/health/AppleHealthSyncCard";
import { WhoopCard } from "@/components/health/WhoopCard";
import { BodyCompositionCard } from "@/components/health/BodyCompositionCard";
import { SupplementsCard } from "@/components/health/SupplementsCard";
import { NativeHealthSync } from "@/components/health/NativeHealthSync";
import { AutoWellnessSync } from "@/components/dashboard/AutoWellnessSync";
import type { RecoveryToday } from "@/lib/recovery-today";
import type { DayRecovery, MonitorItem, SleepWeek, Vital } from "@/lib/health-view";
import type { NutritionSummary } from "@/components/health/NutritionCard";
import type { BodyMeasurement, HealthCheckin, Supplement } from "@/types";

export interface HealthScreenData {
  today: string;
  /** "watch" when a device measures the night; "checkin" when the athlete's answers are all there is. */
  mode: "watch" | "checkin";
  recovery: RecoveryToday;
  trend: { avg: number; change: number | null } | null;
  history: DayRecovery[];
  vitals: Vital[];
  sleep: SleepWeek;
  monitor: MonitorItem[];
  checkin: HealthCheckin | null;
  /** The last two weeks of check-ins, for the athlete without a watch. */
  checkins: HealthCheckin[];
  nutrition: NutritionSummary;
  /** Optional: the Training Readiness the athlete typed from their Garmin today. */
  garminReadiness: number | null;
  /** False until the column exists (migration 031). */
  garminReadinessAvailable: boolean;
  devices: {
    garmin: { connected: boolean; nights: number; lastSyncAt?: string | null; lastError?: string | null };
    energyDate: string | null;
  };
}

const LONG_DATE = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}

/**
 * Saúde, rebuilt around one morning decision.
 *
 * The order is the order of the questions an athlete asks on waking: am I
 * recovered, and what does that mean for today's session → which signals say so
 * → how did my training get me here → how did I sleep → what is the score made
 * of → what should I eat → the rest of what the watch knows → my body over time.
 * Devices sit at the bottom because they are set up once and then forgotten,
 * which is exactly how a connection should feel.
 */
export function HealthScreen({
  data, initialBody, initialSupplements,
}: {
  data: HealthScreenData;
  initialBody: BodyMeasurement[];
  initialSupplements: Supplement[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { recovery, devices } = data;
  const readiness = recovery.readiness;

  // Arriving from the dashboard's or the notification's "check-in" link opens it
  // straight away — the athlete tapped to answer, not to find a button.
  useEffect(() => {
    if (params.get("checkin") === "1") setCheckinOpen(true);
  }, [params]);

  async function refreshNow() {
    setRefreshing(true);
    try {
      await fetch("/api/integrations/intervals/sync?force=1", { method: "POST" });
      haptic("tap");
    } finally {
      // Refresh either way: even with nothing new, the "updated" time moves.
      router.refresh();
      setRefreshing(false);
    }
  }

  const watchMode = data.mode === "watch";
  const anyVital = data.vitals.some(v => v.value != null || v.series.some(p => p.value != null));
  const watchHasSleep = data.vitals.find(v => v.key === "sleep")?.valueDate === data.today;
  const garmin = devices.garmin;
  const waitingForGarmin = garmin.connected && garmin.nights === 0;

  const dateLabel = LONG_DATE.format(new Date(`${data.today}T12:00:00Z`));

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <NativeHealthSync />
      <AutoWellnessSync />

      <header className="flex items-end justify-between gap-3 animate-fade-in">
        <div>
          <p className="text-xs font-medium text-surface-500 first-letter:uppercase">{dateLabel}</p>
          <h1 className="mt-0.5 flex items-center gap-2 text-3xl font-black tracking-tight text-surface-100">
            <HeartPulse className="w-7 h-7 text-brand-400" /> Saúde
          </h1>
        </div>
        {/*
          How fresh the numbers are, always visible. "Is this live?" was the first
          question asked of this screen — the answer belongs on it, with the
          button that makes it so one tap away.
        */}
        {garmin.connected && (
          <button
            onClick={refreshNow}
            disabled={refreshing}
            suppressHydrationWarning
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-surface-700 px-3 text-xs text-surface-400 transition-all hover:border-surface-600 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-brand-400" : "text-emerald-400"}`} />
            {refreshing ? "Buscando…" : garmin.lastSyncAt ? `Garmin · ${ago(garmin.lastSyncAt)}` : "Garmin"}
          </button>
        )}
      </header>

      <Reveal className="space-y-6">
        <RecoveryHero
          recovery={recovery}
          trend={data.trend}
          checkedIn={data.checkin != null}
          onCheckin={() => setCheckinOpen(true)}
        />

        {/* Optional reference from the Garmin — only for athletes whose watch sends data. */}
        {watchMode && data.garminReadinessAvailable && <GarminReadinessField value={data.garminReadiness} />}

        {!watchMode && (
          <CheckinPanel today={data.today} checkin={data.checkin} checkins={data.checkins} onOpen={() => setCheckinOpen(true)} />
        )}

        {/*
          The one state worth a banner: connected, nothing arrived yet. Without it
          an athlete who just set everything up sees dashes and assumes it broke.
        */}
        {waitingForGarmin && (
          <div className="flex items-start gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4">
            <Loader2 className="mt-0.5 w-4 h-4 shrink-0 animate-spin text-brand-400" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-surface-100">Garmin conectado — esperando as primeiras noites</p>
              <p className="mt-0.5 text-xs leading-relaxed text-surface-400">
                O histórico do último ano foi pedido à Garmin e chega aos poucos. As noites novas entram
                depois que o relógio sincronizar com o celular. O Limiar busca sozinho.
              </p>
            </div>
          </div>
        )}

        {watchMode && (
          <Section title="Sinais vitais" subtitle={anyVital ? "Toque para ver os 30 dias contra a sua média" : undefined}>
            <VitalTiles vitals={data.vitals} />
          </Section>
        )}

        <Section title="Carga × recuperação" subtitle="Últimos 14 dias">
          <LoadRecoveryChart history={data.history} />
        </Section>

        <Section title="Sono" subtitle={watchMode ? undefined : "Pelo que você informou nos check-ins"}>
          <SleepCard week={data.sleep} />
        </Section>

        <Section title="O que compõe o score">
          <ContributorsCard readiness={readiness} />
        </Section>

        <Section title="Energia">
          <EnergyCard data={data.nutrition} />
        </Section>

        {data.monitor.length > 0 && (
          <Section title="Monitor do relógio" subtitle="Fora do score — só para você acompanhar">
            <MonitorCard items={data.monitor} />
          </Section>
        )}

        <Section title="Corpo">
          <div className="space-y-2.5">
            <BodyCompositionCard initial={initialBody} />
            <SupplementsCard initial={initialSupplements} />
          </div>
        </Section>

        {/*
          Without a watch, the invitation to connect one sits just above the
          devices list — visible, but after everything the screen can already do,
          rather than a setup form pushed on top of the athlete's morning.
        */}
        {!watchMode && (
          <p className="px-0.5 text-xs leading-relaxed text-surface-500">
            Tem Garmin, Whoop ou Apple Watch? Conectando, sono, HRV e FC de repouso entram sozinhos e o check-in vira opcional.
          </p>
        )}

        <Section title="Dispositivos">
          <div className="space-y-2">
            <Disclosure
              title="Garmin"
              icon={<Watch className="w-4 h-4" />}
              summary={
                !garmin.connected ? "Não conectado — HRV, FC de repouso e sono"
                : garmin.lastError ? garmin.lastError
                : garmin.nights > 0 ? `Conectado · ${garmin.nights} noites nos últimos 60 dias`
                : "Conectado · aguardando as primeiras noites"
              }
            >
              <IntervalsCard />
            </Disclosure>
            <Disclosure
              title="Calorias do iPhone"
              icon={<Flame className="w-4 h-4" />}
              summary={devices.energyDate ? `Recebendo · último em ${devices.energyDate.slice(8, 10)}/${devices.energyDate.slice(5, 7)}` : "Não configurado — gasto real do dia"}
            >
              <AppleHealthSyncCard />
            </Disclosure>
            <Disclosure title="Whoop" icon={<Activity className="w-4 h-4" />} summary="Recuperação, HRV e sono">
              <WhoopCard />
            </Disclosure>
          </div>
        </Section>
      </Reveal>

      {checkinOpen && (
        <CheckinSheet
          today={data.today}
          initial={data.checkin}
          watchHasSleep={watchHasSleep}
          onClose={() => setCheckinOpen(false)}
        />
      )}
    </div>
  );
}
