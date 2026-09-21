"use client";

/**
 * O topo da Saúde, em categorias.
 *
 * Pedido do Sérgio (20/09, adiado até 21/09): *"em saúde, reorganizar o topo em
 * categorias — energia/alimentação, sono, forma e carga, recuperação."*
 *
 * A tela respondia bem a uma pergunta ("estou recuperado?") e depois virava uma
 * rolagem plana de nove seções do mesmo tamanho — vitais, carga, forma, sono, o
 * que compõe o score, energia, monitor, corpo, dispositivos. Quem abre a Saúde
 * às 6h30 não quer nove respostas iguais; quer saber **qual das quatro** merece
 * atenção hoje.
 *
 * Então: quatro números, um por categoria, cada um levando à sua seção. É um
 * índice, não um resumo — nenhum número novo é inventado aqui, todos vêm do
 * mesmo lugar que a seção abaixo mostra.
 */
import { Flame, HeartPulse, Moon, TrendingUp, type LucideIcon } from "lucide-react";
import { TONE, toneForTsb, type Tone } from "@/components/ui/tone";
import type { DailyLoad } from "@/lib/training-load";
import type { RecoveryToday } from "@/lib/recovery-today";
import type { SleepWeek } from "@/lib/health-view";
import type { NutritionSummary } from "@/components/health/NutritionCard";

export const HEALTH_SECTIONS = {
  recuperacao: "saude-recuperacao",
  sono: "saude-sono",
  forma: "saude-forma",
  energia: "saude-energia",
} as const;

interface Tile {
  href: string;
  label: string;
  icon: LucideIcon;
  value: string;
  unit?: string;
  detail: string;
  tone: Tone;
}

const num = (n: number) => Number(n.toFixed(1)).toString().replace(".", ",");

const VERDICT_TONE: Record<string, Tone> = { alta: "good", moderada: "warn", baixa: "alert" };

/** Sono: a régua da própria tela de sono — 7 h é o alvo. */
function sleepTone(hours: number | null): Tone {
  if (hours == null) return "neutral";
  if (hours >= 7) return "good";
  if (hours >= 6) return "warn";
  return "alert";
}

export function HealthOverview({
  recovery, sleep, fitness, nutrition,
}: {
  recovery: RecoveryToday;
  sleep: SleepWeek;
  fitness: DailyLoad[];
  nutrition: NutritionSummary;
}) {
  const last = fitness[fitness.length - 1] ?? null;
  const tsb = last?.tsb ?? null;

  const tiles: Tile[] = [
    {
      href: `#${HEALTH_SECTIONS.recuperacao}`,
      label: "Recuperação",
      icon: HeartPulse,
      value: recovery.score != null ? String(recovery.score) : "—",
      unit: recovery.score != null ? "/100" : undefined,
      detail: recovery.score != null ? recovery.short : "Sem dados hoje",
      tone: recovery.score != null ? VERDICT_TONE[recovery.verdict ?? "moderada"] : "neutral",
    },
    {
      href: `#${HEALTH_SECTIONS.sono}`,
      label: "Sono",
      icon: Moon,
      value: sleep.avgHours != null ? num(sleep.avgHours) : "—",
      unit: sleep.avgHours != null ? " h" : undefined,
      detail: sleep.measured > 0
        ? `média de ${sleep.measured} ${sleep.measured === 1 ? "noite" : "noites"}`
        : "nenhuma noite medida",
      tone: sleepTone(sleep.avgHours),
    },
    {
      href: `#${HEALTH_SECTIONS.forma}`,
      label: "Forma",
      icon: TrendingUp,
      value: tsb != null ? `${tsb > 0 ? "+" : ""}${Math.round(tsb)}` : "—",
      detail: tsb == null ? "sem carga registrada"
        : tsb > 5 ? "descansado"
        : tsb < -20 ? "bem carregado"
        : tsb < -10 ? "carregado"
        : "equilibrado",
      tone: toneForTsb(tsb),
    },
    {
      href: `#${HEALTH_SECTIONS.energia}`,
      label: "Energia",
      icon: Flame,
      value: nutrition.target != null ? nutrition.target.toLocaleString("pt-BR") : "—",
      unit: nutrition.target != null ? " kcal" : undefined,
      detail: nutrition.target != null
        ? `alvo de hoje · ${nutrition.trainingKcal > 0 ? `${nutrition.trainingKcal} kcal em treino` : "sem treino"}`
        : "faltam seus dados",
      tone: "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tiles.map(t => {
        const tone = t.tone !== "neutral" ? TONE[t.tone] : null;
        const Icon = t.icon;
        return (
          <a
            key={t.label}
            href={t.href}
            className={`flex min-h-[96px] flex-col justify-between rounded-2xl border p-3 transition-colors active:scale-[0.98] ${
              tone ? `${tone.bg} ${tone.border}` : "border-surface-700 bg-surface-800 hover:border-surface-600"
            }`}
          >
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-surface-500">
              <Icon className={`h-3.5 w-3.5 ${tone ? tone.text : ""}`} /> {t.label}
            </span>
            <span>
              <span className="block text-2xl font-black leading-none tabular-nums text-surface-100">
                {t.value}
                {t.unit && <span className="text-sm font-bold text-surface-500">{t.unit}</span>}
              </span>
              <span className="mt-1 block truncate text-[11px] text-surface-500">{t.detail}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}
