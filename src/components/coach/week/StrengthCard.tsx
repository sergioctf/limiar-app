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
import { useEffect, useState } from "react";
import { useDeviceAccount } from "@/components/layout/DeviceAccount";
import { parseStoredRunner, runnerProgress, runnerStorageKey } from "@/lib/session-runner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, MessageCircle, PlayCircle, Watch } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { SPORTS } from "@/lib/sports";
import { SessionRunner } from "@/components/coach/SessionRunner";
import { isoDateOfWeekDay, localDateStr } from "@/lib/week";
import { sessionTone } from "@/lib/session-colors";
import { strengthSummary } from "@/lib/day-description";
import { Disclosure } from "@/components/ui/Disclosure";
import { StrengthSessionView } from "@/components/coach/StrengthSessionView";
import { MoveSessionControl } from "@/components/coach/MoveSessionControl";
import { AdaptStrengthControl } from "@/components/coach/week/AdaptStrengthControl";
import type { DoneItem } from "@/lib/day-status";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

export function StrengthCard({
  day, week, sharesDayWithRun, done, awaitingLink = false, onPlanChanged, onAsk,
}: {
  day: WeeklyPlanDay;
  week: string;
  /** Há uma corrida no mesmo dia: vale dizer a ordem e o intervalo. */
  sharesDayWithRun: boolean;
  done: DoneItem | null;
  awaitingLink?: boolean;
  onPlanChanged: (plan: WeeklyPlanData) => void;
  onAsk: (session: WeeklyPlanDay) => void;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const account = useDeviceAccount();
  const session = day.strength;

  /*
    "Começar treino" só no dia.

    O modo de execução grava séries com data. Oferecê-lo na quinta para a
    sessão de sábado seria convidar o atleta a registrar um treino que ainda
    não aconteceu — e a progressão de carga é calculada exatamente a partir
    dessas linhas.
  */
  const date = isoDateOfWeekDay(week, day.day);
  const isToday = date === localDateStr(new Date());

  useEffect(() => {
    if (!date || !account || running) return;
    try {
      const draft = parseStoredRunner(localStorage.getItem(runnerStorageKey(account, date)), date);
      setHasDraft(Boolean(draft && runnerProgress(draft).done > 0));
    } catch { setHasDraft(false); }
  }, [date, account, running]);

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
            {done.recordName && done.recordName !== done.label && <span>{done.recordName}</span>}
            {done.minutes > 0 && <span className="tabular-nums text-surface-300">{done.minutes} min</span>}
          </p>
        </div>
      )}

      {sharesDayWithRun && (
        <p className="text-xs leading-relaxed text-surface-400">
          Segunda sessão do dia. Corra primeiro e levante depois, com ~6 h entre as duas.
        </p>
      )}

      {/*
        A ação principal do dia da musculação é fazer o treino.

        Até aqui o card oferecia "Ver os exercícios" e, dentro dele, "Registrar
        treino" — as duas coisas que se faz *antes* e *depois*. No meio, que é
        onde o atleta passa cinquenta minutos, não havia nada (Sérgio, item 3).
      */}
      {isToday && !done && !awaitingLink && (
        <button
          type="button"
          onClick={() => setRunning(true)}
          className="btn-primary min-h-[48px] w-full justify-center"
        >
          <PlayCircle className="h-4 w-4" /> {hasDraft ? "Retomar treino" : "Começar treino"}
        </button>
      )}

      {/*
        E o relógio, para quem quiser.

        A musculação não vai sozinha com a semana: o que o motor prescreve ali
        são séries e RIR, que o relógio não conduz, e quem conduz é o modo de
        execução logo acima. Mas ter a sessão no pulso tem valor — o relógio
        sabe que hoje tem academia, quanto tempo dura e o que fazer. Então é
        oferta, não automatismo (Sérgio, 15/10).
      */}
      {!done && !awaitingLink && <PushStrengthButton day={day} week={week} />}
      {done?.id && (
        <Link href={`/activities/${done.id}`} className="btn-primary w-full">Ver atividade</Link>
      )}

      <Disclosure
        title={done ? "Exercícios e séries" : "Ver os exercícios"}
        summary={`${session.exercises.length} exercícios · ${isToday ? "conferir antes" : "e registrar as séries"}`}
      >
        <StrengthSessionView session={session} date={date ?? undefined} day={day.day} weekStart={week} />
      </Disclosure>

      {running && date && (
        <SessionRunner
          session={session}
          date={date}
          onClose={() => setRunning(false)}
          onLogged={() => router.refresh()}
        />
      )}

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

/**
 * "Mandar pro relógio" para a musculação.
 *
 * Discreto de propósito: a ação do dia é fazer o treino, logo acima. Esta é
 * para quem gosta de ver a semana inteira no pulso — a sessão chega com a
 * duração estimada e a lista de exercícios, e quem conduz série a série
 * continua sendo o app.
 */
function PushStrengthButton({ day, week }: { day: WeeklyPlanDay; week: string }) {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [precisaConectar, setPrecisaConectar] = useState(false);

  async function enviar() {
    setEnviando(true); setErro(null); setPrecisaConectar(false);
    try {
      const res = await fetch("/api/workouts/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: week, day: day.day, session: { ...day, sport: "musculacao" } }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setPrecisaConectar(d?.needsConnection === true);
        throw new Error(d?.error ?? "Não consegui enviar.");
      }
      haptic("success");
      setEnviado(true);
      setTimeout(() => setEnviado(false), 4000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui enviar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={enviar}
        disabled={enviando}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 text-[11px] font-medium text-surface-500 transition-colors hover:text-brand-300"
      >
        {enviando ? <><Loader2 className="h-3 w-3 animate-spin" /> Enviando…</>
          : enviado ? <><Check className="h-3 w-3 text-green-400" /> No seu relógio</>
          : <><Watch className="h-3 w-3" /> Mandar pro relógio</>}
      </button>
      {enviado && (
        <p className="text-[10px] leading-relaxed text-surface-500">
          A sessão e a lista de exercícios foram para o calendário. As séries e o descanso
          continuam aqui no app.
        </p>
      )}
      {erro && (
        <p className="text-[11px] leading-relaxed text-red-400">
          {erro}
          {precisaConectar && <> <Link href="/settings" className="underline hover:text-red-300">Abrir Configurações</Link></>}
        </p>
      )}
    </div>
  );
}
