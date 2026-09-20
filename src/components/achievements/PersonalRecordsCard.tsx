"use client";

/**
 * Recordes pessoais.
 *
 * Redesenhado em 20/09 a pedido do Sérgio. O que estava errado não era o dado,
 * era a hierarquia: distância, tempo, pace, data, mês passado e tendência
 * ocupavam tamanhos quase iguais, com uma emoji de lâmpada no rodapé dizendo
 * "baseado em suas 4 distância(s)". Um recorde é uma coisa só — **o tempo** —,
 * e os outros números existem para explicá-lo.
 *
 * Agora: a distância vira uma medalha à esquerda, o tempo é o número grande, e
 * pace, data e origem viram uma linha de legenda. A comparação com o mês
 * passado só aparece quando existe, do lado direito, onde o olho já está
 * acostumado a procurar variação.
 */
import { Trophy, TrendingDown, TrendingUp } from "lucide-react";
import { Card, Section } from "@/components/ui/Surface";
import type { DistanceRecord } from "@/lib/historical-comparison";

/**
 * A medalha de cada distância.
 *
 * "Meia-maratona" e "Maratona" viram 21K e 42K aqui: a medalha tem 48 px e o
 * nome inteiro não cabe sem encolher a ponto de não se ler. O nome completo
 * continua sendo o da leitura — esta é só a etiqueta.
 */
const BADGE: Record<string, { short: string; style: string }> = {
  "5K":            { short: "5K",  style: "bg-green-500/10 text-green-300 border-green-500/25" },
  "10K":           { short: "10K", style: "bg-sky-500/10 text-sky-300 border-sky-500/25" },
  "Meia-maratona": { short: "21K", style: "bg-purple-500/10 text-purple-300 border-purple-500/25" },
  "Maratona":      { short: "42K", style: "bg-brand-500/15 text-brand-300 border-brand-500/30" },
};

export function PersonalRecordsCard({ records }: { records: DistanceRecord[] }) {
  const withRecords = records.filter(r => r.personalBest);

  if (withRecords.length === 0) {
    return (
      <Section title="Recordes pessoais">
        <Card>
          <p className="py-2 text-center text-sm text-surface-500">
            Seus recordes aparecem aqui conforme você completa cada distância.
          </p>
        </Card>
      </Section>
    );
  }

  return (
    <Section title="Recordes pessoais">
      <Card density="tight">
        <ul className="divide-y divide-surface-700/50">
          {withRecords.map(record => {
            const pb = record.personalBest!;
            const badge = BADGE[record.label]
              ?? { short: record.label, style: "bg-surface-700/50 text-surface-300 border-surface-600" };
            return (
              <li key={record.label} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                <span
                  title={record.label}
                  className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border text-[11px] font-bold ${badge.style}`}
                >
                  <Trophy className="mb-0.5 h-3 w-3 opacity-70" />
                  {badge.short}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-black leading-none tabular-nums text-surface-100">{pb.time}</p>
                  <p className="mt-1 truncate text-xs text-surface-500">
                    {pb.pace}/km · {pb.date}
                    {pb.fromInsideRun && pb.activityKm != null
                      ? ` · dentro de ${pb.activityKm.toFixed(1).replace(".", ",")} km`
                      : ""}
                  </p>
                </div>

                {/* Só quando há com o que comparar — um espaço vazio não é informação. */}
                {record.improvement && record.trend && record.trend !== "same" && (
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                      record.trend === "up"
                        ? "bg-green-500/10 text-green-300"
                        : "bg-yellow-500/10 text-yellow-300"
                    }`}
                    title={record.lastMonth ? `Mês passado: ${record.lastMonth.pace}/km` : undefined}
                  >
                    {record.trend === "up"
                      ? <TrendingDown className="h-3 w-3" />
                      : <TrendingUp className="h-3 w-3" />}
                    {record.improvement}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </Section>
  );
}
