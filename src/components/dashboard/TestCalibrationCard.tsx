"use client";

import Link from "next/link";
import { useState } from "react";
import { FlaskConical, ChevronRight, ChevronDown, Check, Lock } from "lucide-react";
import { testStatus, TEST_BENEFITS, TEST_PROTOCOL } from "@/lib/test-status";
import type { PerformanceTest } from "@/types";

/**
 * The dashboard's calibration prompt.
 *
 * Runners who never do the test end up with a plan that looks complete but has
 * no intensities in it — and they have no way to notice, because nothing on
 * screen looks broken. So the home screen says it out loud, once, until it's
 * done, and again when the test goes out of date.
 */
export function TestCalibrationCard({ tests }: { tests: PerformanceTest[] | PerformanceTest | null }) {
  const [open, setOpen] = useState(false);
  const status = testStatus(tests);

  if (status.nudge === "none") return null;

  const missing = status.state === "missing";
  const strong  = status.nudge === "strong";

  return (
    <div className={`card p-4 border ${
      strong ? "border-brand-500/25 bg-brand-500/[0.04]" : "border-yellow-500/20 bg-yellow-500/[0.03]"
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          strong ? "bg-brand-500/15" : "bg-yellow-500/10"
        }`}>
          {missing
            ? <Lock className={`w-4 h-4 ${strong ? "text-brand-400" : "text-yellow-400"}`} />
            : <FlaskConical className={`w-4 h-4 ${strong ? "text-brand-400" : "text-yellow-400"}`} />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-bold text-surface-100 text-sm">{status.headline}</p>
          {status.detail && <p className="text-xs text-surface-400 mt-1 leading-relaxed">{status.detail}</p>}

          {missing && (
            <>
              <button
                onClick={() => setOpen(o => !o)}
                className="text-[11px] text-surface-500 hover:text-brand-300 mt-2 flex items-center gap-1 transition-colors"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
                O que ele destrava e como fazer
              </button>

              {open && (
                <div className="mt-2.5 space-y-3">
                  <div className="space-y-1.5">
                    {TEST_BENEFITS.map(b => (
                      <div key={b.title} className="flex items-start gap-2">
                        <Check className="w-3 h-3 text-brand-400 shrink-0 mt-1" />
                        <p className="text-[11px] text-surface-300 leading-relaxed">
                          <span className="font-semibold text-surface-200">{b.title}.</span>{" "}
                          <span className="text-surface-500">{b.detail}</span>
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-surface-800/60 border border-surface-700 rounded-lg p-2.5">
                    <p className="text-[10px] text-surface-500 uppercase tracking-wide mb-1.5">
                      Como fazer — 15 minutos
                    </p>
                    <ol className="space-y-1">
                      {TEST_PROTOCOL.map((s, i) => (
                        <li key={i} className="flex gap-2 text-[11px] text-surface-400 leading-relaxed">
                          <span className="font-mono text-surface-500 shrink-0">{i + 1}.</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </>
          )}

          <Link
            href="/coach"
            className="btn-primary mt-3 text-xs py-1.5 px-3 inline-flex"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            {missing ? "Fazer o teste de 3 km" : "Marcar teste de 3 km"}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
