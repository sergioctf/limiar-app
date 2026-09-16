"use client";

import { Brain, Award, AlertTriangle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buildCycleSummary } from "@/lib/cycle-summary";
import type { Run, PerformanceTest } from "@/types";

/**
 * The last three months, computed from the runs already on the page.
 *
 * The card this replaces read the newest row of `coach_reports` — a table that
 * mostly holds weekly plans — and landed on a hand-written cycle report dated
 * two years in the future. It had been showing a block from 2024 for months,
 * and no code path existed that could ever have replaced it.
 *
 * Nothing is stored here. A summary that is recomputed on every render cannot
 * go stale, cannot disagree with the numbers below it on the same screen, and
 * needs no cron on a plan that allows one a day.
 */
export function CycleSummaryCard({
  runs, tests, activities,
}: {
  runs: Run[];
  tests: PerformanceTest[];
  activities: Array<{ date: string; sport_type: string }>;
}) {
  const summary = buildCycleSummary({ runs, tests, activities });

  // Under a handful of runs there is no trend, only noise.
  if (!summary.ready) return null;

  return (
    <div className="card p-5 border-brand-500/30">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4 text-brand-400" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-surface-100">Resumo do Treinador</h2>
          <p className="text-xs text-surface-500">
            Últimos 3 meses · {ptBR(summary.from)} a {ptBR(summary.to)}
          </p>
        </div>
      </div>

      <p className="text-sm text-surface-300 leading-relaxed mb-4">{summary.headline}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {summary.stats.map(s => (
          <div key={s.label} className="bg-surface-700/30 rounded-xl p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-surface-500 font-medium">{s.label}</p>
            <p className="text-sm font-bold text-surface-100 tabular-nums">{s.value}</p>
            {s.delta && (
              <p className={`text-[10px] tabular-nums ${s.delta.better ? "text-green-400" : "text-yellow-400"}`}>
                {s.delta.pct > 0 ? "+" : ""}{s.delta.pct}% vs trimestre anterior
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {summary.strengths.length > 0 && (
          <Findings
            tone="good"
            label="Pontos fortes"
            icon={<Award className="w-3.5 h-3.5 text-green-400" />}
            items={summary.strengths}
          />
        )}
        {summary.attention.length > 0 && (
          <Findings
            tone="warn"
            label="Atenção"
            icon={<AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />}
            items={summary.attention}
          />
        )}
      </div>

      <Link href="/coach" className="btn-ghost mt-3 text-brand-400 hover:text-brand-300">
        Ver o plano da semana <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

/**
 * Each finding shows its evidence, not just its verdict.
 *
 * The old card truncated a numbered list into "1. Evolução rápida de volume:
 * 5-6 km para quase 18 km. 2. Capacidade de terminar forte…" and cut mid-word.
 * Six half-sentences say less than three whole ones.
 */
function Findings({
  tone, label, icon, items,
}: {
  tone: "good" | "warn";
  label: string;
  icon: React.ReactNode;
  items: Array<{ title: string; detail: string }>;
}) {
  const skin = tone === "good"
    ? "bg-green-500/10 border-green-500/20"
    : "bg-yellow-500/10 border-yellow-500/20";
  const text = tone === "good" ? "text-green-400" : "text-yellow-400";

  return (
    <div className={`rounded-xl p-3 border ${skin}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className={`text-xs font-semibold uppercase tracking-wide ${text}`}>{label}</span>
      </div>
      <ul className="space-y-2">
        {items.map(f => (
          <li key={f.title}>
            <p className="text-xs font-semibold text-surface-200">{f.title}</p>
            <p className="text-[11px] text-surface-400 leading-relaxed">{f.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ptBR(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
