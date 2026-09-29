"use client";

/**
 * Every pace and heart-rate zone in the plan derives from the latest test.
 * An outdated VDOT is worse than no VDOT: the plan looks precise while
 * prescribing the wrong intensities, and nothing about it looks broken.
 *
 * The ageing rules live in test-status.ts — this warning, the dashboard card
 * and the reminder push all have to agree on when a test has gone stale.
 *
 * O botão **marca** o teste, não registra: registrar é o que se faz depois de
 * correr, e entre o aviso e a corrida não havia nada (Sérgio, 29/09). Quando um
 * teste já está marcado, o aviso diz o dia em vez de insistir.
 */
import { useState } from "react";
import { AlertTriangle, CalendarCheck, FlaskConical } from "lucide-react";
import { testStatus } from "@/lib/test-status";
import { ScheduleTestSheet, formatTestDate } from "@/components/coach/ScheduleTestSheet";
import type { PlannedTest } from "@/lib/planned-test";
import type { PerformanceTest } from "@/types";

export function StaleTestWarning({
  latestTest, plannedTest, onScheduled,
}: {
  latestTest: PerformanceTest | null;
  /** O teste já marcado, quando existe. */
  plannedTest?: PlannedTest | null;
  onScheduled?: (test: PlannedTest | null) => void;
}) {
  const [open, setOpen] = useState(false);
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
          {status.detail && <p className="text-xs text-surface-400 mt-0.5 leading-relaxed">{status.detail}</p>}

          {plannedTest ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="flex items-center gap-1.5 text-xs font-medium text-surface-200">
                <CalendarCheck className="h-3.5 w-3.5 text-brand-400" />
                Marcado para {formatTestDate(plannedTest.date)}
              </p>
              <button
                onClick={() => setOpen(true)}
                className="min-h-[44px] text-xs font-medium text-surface-400 transition-colors hover:text-brand-300"
              >
                Remarcar
              </button>
            </div>
          ) : (
            <button onClick={() => setOpen(true)} className="btn-primary mt-2.5 text-xs min-h-[44px] py-1.5 px-3">
              <FlaskConical className="w-3.5 h-3.5" /> Marcar teste de 3 km
            </button>
          )}
        </div>
      </div>

      {open && (
        <ScheduleTestSheet
          current={plannedTest ?? null}
          onClose={() => setOpen(false)}
          onSaved={t => onScheduled?.(t)}
        />
      )}
    </div>
  );
}
