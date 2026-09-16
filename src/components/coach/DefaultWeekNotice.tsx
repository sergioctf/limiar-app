"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ChevronRight } from "lucide-react";
import type { TrainingPrefs } from "@/types";

const DAY_PT: Record<string, string> = {
  Mon: "seg", Tue: "ter", Wed: "qua", Thu: "qui", Fri: "sex", Sat: "sáb", Sun: "dom",
};

/**
 * Says out loud when the plan is running on default days.
 *
 * The whole premise of the coach is that it adapts to the athlete, and a plan
 * built on days nobody chose looks exactly like a plan built on days they did.
 * Nothing on screen distinguishes them — so the app has to.
 *
 * Sits on the weekly plan rather than only in the setup checklist, because the
 * checklist is dismissible and this is where the consequence is visible.
 */
export function DefaultWeekNotice({ onConfigure }: { onConfigure?: () => void }) {
  const [prefs, setPrefs] = useState<TrainingPrefs | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/training-prefs")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d?.prefs) setPrefs(d.prefs); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!prefs || prefs.runDaysConfirmed) return null;

  // Only nag someone still on the template. Days that already differ were a
  // choice, whether or not they predate the confirmation flag.
  const isTemplate =
    prefs.runDays.length === 3
    && prefs.runDays[0] === "Tue" && prefs.runDays[1] === "Thu" && prefs.runDays[2] === "Sat";
  if (!isTemplate) return null;

  return (
    <div className="card p-3.5 border border-brand-500/25 bg-brand-500/[0.04]">
      <div className="flex items-start gap-3">
        <CalendarClock className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-surface-100">
            Este plano está nos dias padrão
          </p>
          <p className="text-xs text-surface-400 mt-1 leading-relaxed">
            Ele foi montado para {prefs.runDays.map(d => DAY_PT[d]).join(" · ")} — que é o
            template, não a sua escolha. Diga em quais dias você corre de verdade e o plano
            se remonta em cima deles.
          </p>
          {onConfigure && (
            <button onClick={onConfigure} className="btn-primary mt-2.5 text-xs min-h-[44px] py-1.5 px-3">
              Escolher meus dias <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
