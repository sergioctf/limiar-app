"use client";

/**
 * A sessão principal do dia — corrida, pedal, natação, o que for.
 *
 * A ordem é a das perguntas que se faz olhando o card: **o que é → quanto e em
 * que ritmo → por quê → a estrutura → o tênis → o que dá para fazer com isso**.
 * A descrição vinha antes dos números e ocupava mais espaço que eles.
 *
 * A cor é etiqueta, não fundo. Verde já quer dizer "rodagem" aqui; desde que a
 * agenda passou a mostrar o realizado, verde também quer dizer "registrado" —
 * e uma cor que significa duas coisas não significa nenhuma.
 */
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { SPORTS, isRunSession } from "@/lib/sports";
import { typeStyle, structureTitle, structureSummary } from "@/components/coach/week/tone";
import { stripStrengthTail } from "@/lib/day-description";
import { Disclosure } from "@/components/ui/Disclosure";
import { WorkoutStepsView } from "@/components/coach/WorkoutStepsView";
import { MoveSessionControl } from "@/components/coach/MoveSessionControl";
import { AdaptSessionControl } from "@/components/today/AdaptSession";
import { ShoeHint } from "@/components/coach/ShoeHint";
import type { DoneItem } from "@/lib/day-status";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

const km = (n: number) => `${Number(n.toFixed(1)).toString().replace(".", ",")} km`;

export function RunCard({
  session, week, canAdapt, done, onPlanChanged, onDayChanged, onAsk,
}: {
  session: WeeklyPlanDay;
  week: string;
  /** Adaptar vale para a semana em andamento, de hoje em diante. */
  canAdapt: boolean;
  /** O que foi registrado e conta para esta sessão. */
  done: DoneItem | null;
  onPlanChanged: (plan: WeeklyPlanData) => void;
  onDayChanged: (day: WeeklyPlanDay) => void;
  onAsk: (session: WeeklyPlanDay) => void;
}) {
  const tone = typeStyle(session.type);

  return (
    <div className="space-y-3 rounded-2xl border border-surface-700 bg-surface-800/60 p-4">
      <div>
        <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${tone.text}`}>
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden />
          {session.sport ? <span aria-hidden>{SPORTS[session.sport].emoji}</span> : tone.icon}
          {tone.label}
          {/* Adaptado é característica, não estado: continua previsto ou realizado. */}
          {session.adaptation && (
            <span className="rounded bg-surface-700 px-1.5 py-px text-[10px] font-semibold text-surface-300">
              adaptado
            </span>
          )}
        </p>
        <h3 className="mt-1 text-lg font-bold leading-tight text-surface-100">{session.label}</h3>
        {/* Os números que o atleta procura primeiro, numa linha só. */}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-surface-300">
          {session.distance_km != null && (
            <span className="font-semibold tabular-nums text-surface-100">{session.distance_km} km</span>
          )}
          {session.duration_min != null && (
            <span className="font-semibold tabular-nums text-surface-100">{session.duration_min} min</span>
          )}
          {session.pace && (
            <><span className="text-surface-600">·</span><span className="tabular-nums">{session.pace}</span></>
          )}
        </p>
      </div>

      {/*
        O que foi feito, ao lado do que foi pedido.

        Sem julgamento: 11,7 km num longão de 12 não é uma falha, e a tela não
        vai dizer que é. A comparação existe para o atleta ver a própria semana,
        não para receber nota — quem avalia cumprimento é o motor, que olha
        objetivo e contexto, não a existência de uma corrida.
      */}
      {done && (
        <div className="rounded-xl bg-surface-700/30 px-3 py-2">
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-surface-400">
            <span className="font-semibold text-green-400">Registrado</span>
            <span className="text-surface-300">{done.label}</span>
            {done.km != null && <span className="tabular-nums">{km(done.km)}</span>}
            {done.minutes > 0 && <span className="tabular-nums">{done.minutes} min</span>}
          </p>
          {done.kind === "run" && done.id && (
            <Link href={`/runs/${done.id}`} className="mt-0.5 inline-block text-xs font-medium text-brand-400 hover:text-brand-300">
              Ver a atividade
            </Link>
          )}
        </div>
      )}

      {/* Derivado do dia, nunca o texto cru: ver day-description.ts.
          A musculação sai daqui — ela tem card próprio logo abaixo. */}
      <p className="text-sm leading-relaxed text-surface-400">
        {stripStrengthTail(session.description ?? "")}
      </p>

      {/*
        A estrutura fica atrás de um toque (Sérgio, 23/09): aberta, um treino de
        tiros empurrava o resto da semana para longe.
      */}
      {session.structure && session.structure.blocks.length > 0 && (
        <Disclosure
          title={structureTitle(session.type)}
          summary={structureSummary(session.structure.blocks.length)}
        >
          <WorkoutStepsView
            structure={session.structure}
            label={session.label}
            sport={session.sport}
          />
        </Disclosure>
      )}

      <ShoeHint day={session} compact />

      {/*
        As três coisas que se pode fazer com um treino, juntas e com o escopo no
        nome: mudar de dia, trocar por outro, perguntar. Antes estavam
        espalhadas em alturas diferentes conforme o dia.
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-surface-700/50 pt-2.5">
        {/* Só uma corrida pode ser movida como "a corrida". */}
        {isRunSession(session) && (
          <MoveSessionControl
            week={week}
            day={session.day}
            session="corrida"
            label={session.label}
            onMoved={onPlanChanged}
          />
        )}
        {canAdapt && <AdaptSessionControl day={session} onChanged={onDayChanged} />}
        {/*
          A mesma conversa, com o assunto já posto. "Uma identidade, várias
          portas": o treinador é um só, e cada porta diz o que acontece ao
          abri-la.
        */}
        <button
          type="button"
          onClick={() => onAsk(session)}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs text-surface-400 transition-colors hover:text-brand-300"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Perguntar sobre este treino
        </button>
      </div>
    </div>
  );
}
