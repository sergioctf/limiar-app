"use client";

/**
 * A ação do teste de 3 km — uma só, em qualquer tela.
 *
 * Tinha virado um labirinto (Sérgio, 01/10): no dia do teste o app continuava
 * oferecendo **"Marcar teste de 3 km"** em três lugares, enquanto o botão para
 * *registrar* o que ele acabara de correr estava no fim da página de
 * Calibração. E o "marcar", fora do Treinador, levava para o Treinador — onde
 * era preciso achar e tocar no mesmo botão outra vez.
 *
 * Aqui a pergunta é uma só: **qual é o próximo passo do teste?**
 *
 *   • nada marcado → *Marcar teste de 3 km*, abrindo o calendário ali mesmo;
 *   • marcado para hoje → *Registrar teste de 3 km*, direto no formulário;
 *   • marcado para outro dia → a data, com *Remarcar* ao lado;
 *   • já registrado → *Marcar*, porque o próximo passo do teste é o próximo
 *     teste. Quem mostra isto é o aviso de teste vencendo, e ele só aparece
 *     quando o último teste envelhece — nenhuma tela convida a repetir um
 *     teste feito ontem.
 *
 * O estado vem do servidor numa chamada só, e o componente não renderiza nada
 * enquanto não sabe — um botão que troca de rótulo depois de aparecer é pior do
 * que um que demora meio segundo.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, FlaskConical } from "lucide-react";
import { ScheduleTestSheet, formatTestDate } from "@/components/coach/ScheduleTestSheet";
import type { PlannedTest } from "@/lib/planned-test";
import { localDateStr } from "@/lib/week";

export function TestAction({
  variant = "primary", className = "",
}: {
  /** `primary` é botão cheio; `inline` é discreto, para dentro de um aviso. */
  variant?: "primary" | "inline";
  className?: string;
}) {
  const [test, setTest] = useState<PlannedTest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/planned-test", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) { setTest((d?.test as PlannedTest | null) ?? null); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  if (!loaded) return null;

  const today = localDateStr(new Date());
  const isToday = test?.status === "scheduled" && test.date === today;
  const sheet = open ? (
    <ScheduleTestSheet current={test} onClose={() => setOpen(false)} onSaved={setTest} />
  ) : null;

  /*
    Hoje é dia de teste: a ação é registrar, e ela leva direto ao formulário.
    `?registrar=1` abre o formulário já no topo da Calibração — o atleta acabou
    de correr, não veio ler sobre VDOT.
  */
  if (isToday) {
    return (
      <>
        <Link
          href="/coach/calibracao?registrar=1"
          className={variant === "primary"
            ? `btn-primary min-h-[48px] w-full justify-center ${className}`
            : `inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-brand-300 hover:text-brand-200 ${className}`}
        >
          <FlaskConical className="h-4 w-4" /> Registrar teste de 3 km
        </Link>
        {sheet}
      </>
    );
  }

  if (test?.status === "scheduled") {
    return (
      <>
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
          <p className="flex items-center gap-1.5 text-xs font-medium text-surface-200">
            <CalendarCheck className="h-3.5 w-3.5 text-brand-400" />
            Teste marcado para {formatTestDate(test.date)}
          </p>
          <button
            onClick={() => setOpen(true)}
            className="min-h-[44px] text-xs font-medium text-surface-400 transition-colors hover:text-brand-300"
          >
            Remarcar
          </button>
        </div>
        {sheet}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={variant === "primary"
          ? `btn-primary min-h-[48px] w-full justify-center ${className}`
          : `inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-surface-600 px-3 text-xs font-medium text-surface-300 transition-colors hover:border-brand-500/60 hover:text-brand-300 ${className}`}
      >
        <FlaskConical className="h-4 w-4" /> Marcar teste de 3 km
      </button>
      {sheet}
    </>
  );
}
