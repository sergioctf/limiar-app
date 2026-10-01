"use client";

/**
 * A musculação tem card próprio, sempre.
 *
 * Duas sessões num dia são dois treinos, não um rodapé dentro da corrida —
 * enterrada no detalhe dela, o atleta não via que existia.
 *
 * A cor vem de `session-colors` como a de qualquer sessão: azul. Este card já
 * foi roxo, pintado à mão, que é a cor do longão — duas coisas diferentes com
 * a mesma cor na mesma tela (Sérgio, 26/09).
 */
import { MessageCircle } from "lucide-react";
import { SPORTS } from "@/lib/sports";
import { sessionTone } from "@/lib/session-colors";
import { strengthSummary } from "@/lib/day-description";
import { Disclosure } from "@/components/ui/Disclosure";
import { StrengthSessionView } from "@/components/coach/StrengthSessionView";
import { MoveSessionControl } from "@/components/coach/MoveSessionControl";
import { AdaptStrengthControl } from "@/components/coach/week/AdaptStrengthControl";
import type { DoneItem } from "@/lib/day-status";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

export function StrengthCard({
  day, week, sharesDayWithRun, done, onPlanChanged, onAsk,
}: {
  day: WeeklyPlanDay;
  week: string;
  /** Há uma corrida no mesmo dia: vale dizer a ordem e o intervalo. */
  sharesDayWithRun: boolean;
  done: DoneItem | null;
  onPlanChanged: (plan: WeeklyPlanData) => void;
  onAsk: (session: WeeklyPlanDay) => void;
}) {
  const session = day.strength;
  if (!session) return null;
  const tone = sessionTone("strength");

  return (
    <div className="space-y-3 rounded-2xl border border-surface-700 bg-surface-800/60 p-4">
      <div className="min-w-0">
        <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${tone.text}`}>
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden />
          <span aria-hidden>{SPORTS.musculacao.emoji}</span> Musculação
          {session.deloaded && (
            <span className="rounded bg-surface-700 px-1.5 py-px text-[10px] font-semibold text-surface-300">
              mais leve
            </span>
          )}
        </p>
        {/* "peito, costas · 4 exercícios · ~51 min" — o que é a sessão, em uma linha. */}
        <p className="mt-1 text-[15px] font-semibold text-surface-100">{strengthSummary(session)}</p>
      </div>

      {done && (
        <div className="rounded-xl bg-surface-700/30 px-3 py-2">
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-surface-400">
            <span className="font-semibold text-green-400">Registrado</span>
            {done.minutes > 0 && <span className="tabular-nums text-surface-300">{done.minutes} min</span>}
          </p>
        </div>
      )}

      {sharesDayWithRun && (
        <p className="text-xs leading-relaxed text-surface-400">
          Segunda sessão do dia. Corra primeiro e levante depois, com ~6 h entre as duas.
        </p>
      )}

      <Disclosure
        title="Ver os exercícios"
        summary={`${session.exercises.length} exercícios · registrar as séries`}
      >
        <StrengthSessionView session={session} day={day.day} weekStart={week} />
      </Disclosure>

      {/* As mesmas três decisões da corrida, no mesmo desenho: mexer no dia,
          mexer na sessão, perguntar. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-surface-700/50 pt-2.5">
        <MoveSessionControl
          week={week}
          day={day.day}
          session="musculacao"
          label="Musculação"
          onMoved={onPlanChanged}
        />
        <AdaptStrengthControl session={session} week={week} day={day.day} onChanged={onPlanChanged} />
        <button
          type="button"
          onClick={() => onAsk(day)}
          className="inline-flex min-h-[44px] items-center gap-1.5 px-1 text-xs text-surface-400 transition-colors hover:text-brand-300"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Perguntar
        </button>
      </div>
    </div>
  );
}
