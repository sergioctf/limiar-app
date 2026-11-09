"use client";

/**
 * O dia aberto: um card por sessão.
 *
 * O dia era um bloco de texto com controles pendurados embaixo. Agora é o que
 * ele realmente é — uma ou duas sessões, cada uma com a sua ação principal e as
 * suas ações secundárias no mesmo lugar.
 *
 * No computador este painel fica ao lado da agenda e acompanha a rolagem, então
 * a semana nunca sai da vista enquanto se explora um treino.
 */
import { Moon } from "lucide-react";
import { dateOfWeekDay } from "@/lib/week";
import { stripStrengthTail } from "@/lib/day-description";
import { DayState } from "@/components/coach/week/DayState";
import { RunCard } from "@/components/coach/week/RunCard";
import type { MeasureBy } from "@/lib/measure";
import { StrengthCard } from "@/components/coach/week/StrengthCard";
import type { DayProgress } from "@/lib/day-progress";
import { adaptationApplies, type DayStatus } from "@/lib/day-status";
import { LinkActivityControl } from "@/components/coach/week/LinkActivityControl";
import type { PlannedTest } from "@/lib/planned-test";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const km = (n: number) => `${Number(n.toFixed(1)).toString().replace(".", ",")} km`;

export function DayPanel({
  day, week, isToday, canAdapt, progress, status, plannedTest, onPlanChanged, onDayChanged, onAsk,
  onTestChanged, measureBy = "km",
}: {
  day: WeeklyPlanDay | null;
  week: string;
  isToday: boolean;
  canAdapt: boolean;
  progress: DayProgress | null;
  /** Tudo que foi registrado nesse dia, previsto ou não. */
  status: DayStatus | null;
  onPlanChanged: (plan: WeeklyPlanData) => void;
  onDayChanged: (day: WeeklyPlanDay) => void;
  onAsk: (session: WeeklyPlanDay) => void;
  /** O teste de 3 km marcado, quando cai neste dia. */
  plannedTest?: PlannedTest | null;
  onTestChanged?: (test: PlannedTest | null) => void;
  /** Km ou minutos: a unidade em que este atleta lê o plano. */
  measureBy?: MeasureBy;
}) {
  if (!day) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-surface-700 px-4 text-center">
        <p className="text-sm text-surface-500">Toque num dia para ver o treino.</p>
      </div>
    );
  }

  /** O treino do dia que não é a musculação. */
  const displayDay = status && day.adaptation?.when === "after" && !adaptationApplies(day, status)
    ? { ...day, adaptation: undefined } : day;
  const main = day.type !== "rest" && day.type !== "strength" && day.sport !== "musculacao" ? displayDay : null;

  const done = status?.done ?? [];
  const sessions = status?.sessions ?? [];
  const doneFor = (sport: string) => done.find(d => d.planned && d.sport === sport) ?? null;
  const unresolved = (sport: string) => sessions.some(s => s.sport === sport && s.unresolved);
  const extras = done.filter(d => !d.planned && (!d.sport || !unresolved(d.sport)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-surface-500">
          {day.dayPt} {dateOfWeekDay(week, day.day) ?? ""}
        </p>
        {isToday && (
          <span className="rounded bg-brand-500/20 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand-300">
            hoje
          </span>
        )}
        {progress && <DayState progress={progress} />}
      </div>

      {status && sessions.filter(session => session.unresolved || session.explicitlyLinked).map(session => (
        <LinkActivityControl key={session.sport} date={status.date} session={session} candidates={done.filter(item => item.sport === session.sport && item.kind === (session.sport === "corrida" ? "run" : "activity"))} />
      ))}

      {main && (
        <RunCard
          session={main}
          week={week}
          canAdapt={canAdapt && !unresolved(main.sport ?? "corrida")}
          done={doneFor(main.sport ?? "corrida")}
          plannedTest={plannedTest}
          onPlanChanged={onPlanChanged}
          onDayChanged={onDayChanged}
          onAsk={onAsk}
          onTestChanged={onTestChanged}
          measureBy={measureBy}
        />
      )}

      {day.strength && (
        <StrengthCard
          day={day}
          week={week}
          sharesDayWithRun={!!main}
          done={doneFor("musculacao")}
          awaitingLink={unresolved("musculacao")}
          onPlanChanged={onPlanChanged}
          onAsk={onAsk}
        />
      )}

      {/* Um dia sem sessão também é parte do plano — e diz por quê. */}
      {!main && !day.strength && (
        <div className="rounded-2xl border border-surface-700/60 bg-surface-800/40 p-4">
          <p className="flex items-center gap-1.5 text-[15px] font-semibold text-surface-200">
            <Moon className="h-4 w-4 text-surface-500" /> {day.label}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-surface-400">
            {stripStrengthTail(day.description ?? "")}
          </p>
        </div>
      )}

      {/*
        O que foi feito e o plano não pediu.

        Uma pelada no domingo, a caminhada com o cachorro, o pedal que entrou no
        lugar de nada. Aparece como registro, não como erro: a semana é do
        atleta, e o plano é uma proposta dentro dela.
      */}
      {extras.length > 0 && (
        <div className="rounded-2xl border border-surface-700/60 bg-surface-800/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
            Também registrado neste dia
          </p>
          <ul className="mt-1.5 space-y-1">
            {extras.map((d, i) => (
              <li key={d.id ?? i} className="flex flex-wrap items-baseline gap-x-2 text-sm text-surface-300">
                <span>{d.recordName || d.label}</span>
                {d.km != null && <span className="text-xs tabular-nums text-surface-400">{km(d.km)}</span>}
                {d.minutes > 0 && <span className="text-xs tabular-nums text-surface-400">{d.minutes} min</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
