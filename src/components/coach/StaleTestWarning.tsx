"use client";

/**
 * Every pace and heart-rate zone in the plan derives from the latest test.
 * An outdated VDOT is worse than no VDOT: the plan looks precise while
 * prescribing the wrong intensities, and nothing about it looks broken.
 *
 * The ageing rules live in test-status.ts — this warning, the dashboard card
 * and the reminder push all have to agree on when a test has gone stale.
 *
 * A ação fica com o `TestAction`, que é o mesmo botão em toda tela: marcar
 * quando não há nada, **registrar** no dia do teste, e a data com "remarcar"
 * quando ele está marcado para outro dia. Este aviso só diz por que o assunto
 * existe (Sérgio, 29/09 e 01/10).
 */
import { AlertTriangle } from "lucide-react";
import { testStatus } from "@/lib/test-status";
import { TestAction } from "@/components/coach/TestAction";
import type { PerformanceTest } from "@/types";

export function StaleTestWarning({ latestTest }: { latestTest: PerformanceTest | null }) {
  const status = testStatus(latestTest);

  // No test at all is handled elsewhere (the coach shows a first-test CTA).
  if (status.state === "missing" || status.nudge === "none") return null;

  const severe = status.state === "stale";

  return (
    <div className={`card border p-4 ${severe ? "border-red-500/25 bg-red-500/5" : "border-yellow-500/20 bg-yellow-500/5"}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${severe ? "text-red-400" : "text-yellow-400"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-surface-100">{status.headline}</p>
          {status.detail && <p className="mt-0.5 text-xs leading-relaxed text-surface-400">{status.detail}</p>}
          <div className="mt-2"><TestAction variant="inline" /></div>
        </div>
      </div>
    </div>
  );
}
