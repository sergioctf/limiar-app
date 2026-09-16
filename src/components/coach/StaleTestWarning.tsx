"use client";

import { FlaskConical, AlertTriangle } from "lucide-react";
import { testStatus } from "@/lib/test-status";
import type { PerformanceTest } from "@/types";

/**
 * Every pace and heart-rate zone in the plan derives from the latest test.
 * An outdated VDOT is worse than no VDOT: the plan looks precise while
 * prescribing the wrong intensities, and nothing about it looks broken.
 *
 * The ageing rules live in test-status.ts — this warning, the dashboard card
 * and the reminder push all have to agree on when a test has gone stale.
 */
export function StaleTestWarning({
  latestTest, onAddTest,
}: {
  latestTest: PerformanceTest | null;
  onAddTest: () => void;
}) {
  const status = testStatus(latestTest);

  // No test at all is handled elsewhere (the coach shows a first-test CTA).
  if (status.state === "missing" || status.nudge === "none") return null;

  const severe = status.state === "stale";

  return (
    <div className={`card p-4 border ${severe ? "border-red-500/25 bg-red-500/5" : "border-yellow-500/20 bg-yellow-500/5"}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`w-4.5 h-4.5 shrink-0 mt-0.5 ${severe ? "text-red-400" : "text-yellow-400"}`} />
        <div className="min-w-0">
          <p className="font-bold text-surface-100 text-sm">{status.headline}</p>
          <p className="text-xs text-surface-400 mt-0.5 leading-relaxed">{status.detail}</p>
          <button onClick={onAddTest} className="btn-primary mt-2.5 text-xs min-h-[44px] py-1.5 px-3">
            <FlaskConical className="w-3.5 h-3.5" /> Registrar novo teste
          </button>
        </div>
      </div>
    </div>
  );
}
