"use client";

import { useEffect, useState } from "react";
import { Watch, PencilLine } from "lucide-react";
import type { Readiness } from "@/lib/readiness";

const WHY: Record<string, string> = {
  body_battery: "a estimativa de energia do próprio relógio",
  sleep:        "quanto e quão bem você dormiu",
  sleep_history: "a média das últimas noites — débito de sono se acumula",
  hrv:          "variabilidade cardíaca contra a sua média",
  rhr:          "batimento em repouso contra a sua média",
  tsb:          "fadiga acumulada dos treinos recentes",
  soreness:     "dor muscular que você informou",
  rpe:          "o esforço que o treino de ontem custou",
};

/**
 * What the score is made of, and how much each part weighs.
 *
 * A score the athlete cannot take apart is a score they cannot argue with or
 * learn from. Showing the weights also answers the question every athlete asks
 * the first bad morning: "but I feel fine — why is it low?"
 */
/** `bare`: no frame of its own, for when it sits inside a Disclosure. */
export function ContributorsCard({ readiness, bare = false }: { readiness: Readiness; bare?: boolean }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Signals the watch did not send today still hold their weight, at neutral.
  const MISSING_WEIGHT: Record<string, number> = { sleep: 0.25, sleep_history: 0.10, hrv: 0.20, rhr: 0.10 };
  const MISSING_LABEL: Record<string, string> = { sleep: "sono", sleep_history: "sono das últimas noites", hrv: "HRV", rhr: "FC de repouso" };
  const missing = readiness.coverage?.missing ?? [];
  const total = readiness.components.reduce((s, c) => s + c.weight, 0)
    + missing.reduce((s, key) => s + (MISSING_WEIGHT[key] ?? 0), 0) || 1;
  const parts = [...readiness.components].sort((a, b) => b.weight - a.weight);

  if (parts.length === 0) {
    return (
      <p className="rounded-2xl border border-surface-700 bg-surface-800 p-4 text-sm text-surface-500">
        Nada para compor o score ainda — nem treinos recentes, nem leituras do relógio.
      </p>
    );
  }

  return (
    <div className={bare ? "space-y-3.5 pt-2" : "space-y-3.5 rounded-2xl border border-surface-700 bg-surface-800 p-4"}>
      {parts.map((c, i) => {
        const bar = c.score >= 70 ? "bg-emerald-500" : c.score >= 45 ? "bg-amber-500" : "bg-red-500";
        return (
          <div key={c.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-surface-200">
                {c.auto ? <Watch className="w-3.5 h-3.5 shrink-0 text-surface-500" /> : <PencilLine className="w-3.5 h-3.5 shrink-0 text-surface-500" />}
                <span className="truncate">{c.label}</span>
                <span className="shrink-0 text-[11px] font-normal text-surface-500">peso {Math.round((c.weight / total) * 100)}%</span>
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-surface-100">{c.score}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-700">
              <div
                className={`h-full rounded-full ${bar} transition-[width] duration-700 ease-smooth`}
                style={{ width: grown ? `${c.score}%` : "0%", transitionDelay: `${i * 70}ms` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-surface-500">{WHY[c.key]}</p>
          </div>
        );
      })}
      {missing.length > 0 && (
        <p className="border-t border-surface-700/60 pt-3 text-[11px] text-surface-500">
          Sem leitura hoje, contando como neutro: {missing.map(key => MISSING_LABEL[key] ?? key).join(", ")}.
        </p>
      )}
      {readiness.cap && (
        <p className="text-[11px] text-surface-400">{readiness.cap.reason}</p>
      )}
    </div>
  );
}
