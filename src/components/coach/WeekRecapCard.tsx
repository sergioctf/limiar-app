import { CalendarCheck } from "lucide-react";
import type { WeekRecap } from "@/lib/week-recap";

/**
 * The week that just closed, in three questions.
 *
 * Deliberately not a card that sits at the top of the dashboard forever: it
 * lives next to the plan it explains, and disappears on its own when there is
 * nothing to close (see `weekRecap`).
 */
export function WeekRecapCard({ recap }: { recap: WeekRecap | null }) {
  if (!recap) return null;

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarCheck className="w-4 h-4 text-brand-400" />
        <h2 className="section-title">Sua semana</h2>
        <span className="text-xs text-surface-500">{recap.range}</span>
      </div>

      {[recap.went, recap.understood, recap.next].map(section => (
        <div key={section.question} className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-surface-500">{section.question}</p>
          <p className="text-sm font-semibold text-surface-100">{section.headline}</p>
          {section.lines.length > 0 && (
            <ul className="space-y-0.5">
              {section.lines.map(line => (
                <li key={line} className="text-xs text-surface-400 leading-relaxed">{line}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
