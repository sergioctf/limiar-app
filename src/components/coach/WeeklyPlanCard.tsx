"use client";

/**
 * A semana do atleta: carregar, escolher um dia, ajustar, conversar.
 *
 * Este arquivo é o **dono do plano** — quem busca, guarda, troca de semana e
 * grava. Ele não desenha sessão nenhuma: cabeçalho, agenda, painel do dia,
 * cards e conversa moram em `components/coach/week/`, cada um com uma
 * responsabilidade, e recebem o plano por propriedade.
 *
 * A divisão veio depois de o arquivo chegar a mil linhas fazendo seis coisas ao
 * mesmo tempo. A regra que a divisão não pode quebrar: **o plano continua
 * tendo uma fonte só**. Dividir arquivos não pode produzir duas cópias do mesmo
 * treino, uma delas desatualizada — por isso o estado ficou todo aqui, e o que
 * desce são dados e funções de retorno.
 *
 * O desenho está contado em `docs/treinador-redesenho.md`.
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { CalendarDays, Loader2, Sparkles, WifiOff, X } from "lucide-react";
import type { WeeklyPlanData, WeeklyPlanDay, PlanChatMessage } from "@/types";
import { isRunSession } from "@/lib/sports";
import { savePlanOffline, loadPlanOffline } from "@/lib/offline-store";
import { isLegacyPlanShape } from "@/lib/workout-builder";
import { localMondayStr, localNextMondayStr, localDateStr } from "@/lib/week";
import { weekSummaryLine } from "@/lib/week-agenda";
import { applyPlannedTest, type PlannedTest } from "@/lib/planned-test";
import { dayProgress, dayDone, type DayProgress } from "@/lib/day-progress";
import type { DayActivity, DayRun, DoneItem } from "@/lib/day-status";
import { WeekFitControl } from "@/components/coach/WeekFitControl";
import { WeekHeader } from "@/components/coach/week/WeekHeader";
import { WeekFocus } from "@/components/coach/week/WeekFocus";
import { WeekAgenda } from "@/components/coach/week/WeekAgenda";
import { DayPanel } from "@/components/coach/week/DayPanel";
import type { MeasureBy } from "@/lib/measure";
import { WeekChat, type PendingProposal } from "@/components/coach/week/WeekChat";
import { WeekSkeleton } from "@/components/coach/week/WeekSkeleton";
import { formatWeekRange } from "@/components/coach/week/tone";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getCurrentMondayStr = localMondayStr;
const getNextMondayStr    = localNextMondayStr;

const DAY_ORDER: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getTodayDayKey(): WeeklyPlanDay["day"] {
  const keys: WeeklyPlanDay["day"][] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return keys[new Date().getDay()];
}

/** A data de um dia da semana, "YYYY-MM-DD" — é por ela que plano e registro se encontram. */
function dateOf(weekStart: string, day: WeeklyPlanDay["day"]): string {
  const d = new Date(`${weekStart}T12:00:00`);
  d.setDate(d.getDate() + DAY_ORDER.indexOf(day));
  return localDateStr(d);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialPlan:  WeeklyPlanData | null;
  initialReportId?: string | null;
  paces?:       { easy?: string; threshold?: string; long?: string; interval?: string } | null;
  /** Corridas e atividades das últimas semanas — o que a agenda mostra como feito. */
  doneRuns?: DayRun[];
  doneActivities?: DayActivity[];
  /** O teste de 3 km marcado: entra na semana por cima do plano guardado. */
  plannedTest?: PlannedTest | null;
  onTestChanged?: (test: PlannedTest | null) => void;
  /** Km ou minutos: a unidade em que este atleta lê o plano. */
  measureBy?: MeasureBy;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WeeklyPlanCard({
  initialPlan, initialReportId, paces, doneRuns = [], doneActivities = [], plannedTest = null,
  onTestChanged, measureBy = "km",
}: Props) {
  const currentMonday = getCurrentMondayStr();
  const nextMonday    = getNextMondayStr();

  // Only use initialPlan if it's from the current week
  const seedPlan = initialPlan?.week_start === currentMonday ? initialPlan : null;

  // The coach shows two weeks; each is cached by its Monday once fetched.
  const [activeWeek, setActiveWeek] = useState<string>(currentMonday);
  const [plans, setPlans] = useState<Record<string, WeeklyPlanData | null>>(
    seedPlan ? { [currentMonday]: seedPlan } : {}
  );
  const [reportIds, setReportIds] = useState<Record<string, string | null>>(
    seedPlan ? { [currentMonday]: initialReportId ?? null } : {}
  );
  const [loadingWeek, setLoadingWeek] = useState(false);
  /** Week whose plan came from the offline copy rather than the network. */
  const [offlineWeek, setOfflineWeek] = useState<string | null>(null);

  /*
    O teste marcado é uma camada por cima do plano guardado, não uma alteração
    dele: o motor não roda de novo e o volume não é recalculado. Por isso ele
    aparece no mesmo instante em que é marcado — ver .
  */
  const stored   = plans[activeWeek] ?? null;
  /*
    Memorizado porque o efeito que escolhe o dia de hoje depende de `plan`:
    sem isto, cada render criava um objeto novo, o efeito rodava de novo e a
    seleção voltava para hoje — tocar em outro dia não fazia nada.
  */
  const plan     = useMemo(
    () => (stored ? applyPlannedTest(stored, plannedTest) : null),
    [stored, plannedTest],
  );
  const reportId = reportIds[activeWeek] ?? null;
  const isNextWeek = activeWeek === nextMonday;

  const setPlan = (p: WeeklyPlanData | null) =>
    setPlans(prev => ({ ...prev, [activeWeek]: p }));

  const [selectedDay,  setSelectedDay]  = useState<WeeklyPlanDay | null>(null);
  const [generating,   setGenerating]   = useState(false);
  const [genError,     setGenError]     = useState<string | null>(null);
  const [showChat,     setShowChat]     = useState(false);
  const [chatMessages, setChatMessages] = useState<PlanChatMessage[]>([]);
  /** A proposta do chat esperando confirmação — nada gravado até "Aplicar". */
  const [pending, setPending] = useState<PendingProposal | null>(null);
  const [chatInput,    setChatInput]    = useState("");
  const [chatLoading,  setChatLoading]  = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  /** O painel do dia — no celular ele entra na tela quando um dia é tocado. */
  const dayPanelRef = useRef<HTMLDivElement>(null);

  // Fetch a week's stored plan the first time it's opened (no AI cost).
  // If the network is unavailable, fall back to the offline copy so the
  // workout is still readable without signal.
  useEffect(() => {
    if (activeWeek in plans) return;
    let cancelled = false;
    setLoadingWeek(true);
    setGenError(null);   // switching weeks clears a stale error from another one

    const useOfflineCopy = () => {
      const stored = loadPlanOffline(activeWeek);
      setPlans(prev => ({ ...prev, [activeWeek]: stored?.plan ?? null }));
      if (stored) setOfflineWeek(activeWeek);
    };

    fetch(`/api/coach/weekly-plan?week=${activeWeek}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("offline")))
      .then(d => {
        if (cancelled) return;
        setPlans(prev => ({ ...prev, [activeWeek]: d?.plan ?? null }));
        setReportIds(prev => ({ ...prev, [activeWeek]: d?.reportId ?? null }));
        setOfflineWeek(null);
        if (d?.plan) savePlanOffline(activeWeek, d.plan);
      })
      .catch(() => { if (!cancelled) useOfflineCopy(); })
      .finally(() => { if (!cancelled) setLoadingWeek(false); });
    return () => { cancelled = true; };
  }, [activeWeek, plans]);

  // Keep the offline copy fresh whenever a plan is on screen (including the
  // server-rendered one, which never passes through the fetch above).
  useEffect(() => {
    const current = plans[activeWeek];
    if (current && offlineWeek !== activeWeek) savePlanOffline(activeWeek, current);
  }, [plans, activeWeek, offlineWeek]);

  // Plans made by the old text generator have no paces, heart-rate ranges or
  // km-by-km detail. Rebuild them once, silently, so every athlete ends up on
  // the current model without having to know any of this happened.
  const [upgrading, setUpgrading] = useState(false);
  useEffect(() => {
    const current = plans[activeWeek];
    if (!current || upgrading || offlineWeek === activeWeek) return;
    if (!isLegacyPlanShape(current)) return;

    setUpgrading(true);
    fetch("/api/coach/weekly-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paces, force: true, week: activeWeek }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.plan) {
          setPlans(prev => ({ ...prev, [activeWeek]: d.plan as WeeklyPlanData }));
          setReportIds(prev => ({ ...prev, [activeWeek]: d.reportId ?? null }));
        }
      })
      .catch(() => {})
      .finally(() => setUpgrading(false));
  }, [plans, activeWeek, offlineWeek, upgrading, paces]);

  // Auto-select TODAY's day when the current week loads; for next week, the
  // first training day (there is no "today" to highlight there).
  useEffect(() => {
    if (!plan?.days) { setSelectedDay(null); return; }
    const fallback = plan.days.find(d => d.type !== "rest") ?? plan.days[0] ?? null;
    if (isNextWeek) { setSelectedDay(fallback); return; }
    const todayKey = getTodayDayKey();
    setSelectedDay(plan.days.find(d => d.day === todayKey) ?? fallback);
  }, [plan, isNextWeek]);

  // Load chat history from DB when reportId is available
  useEffect(() => {
    if (!reportId || historyLoaded) return;
    setHistoryLoaded(true);
    fetch(`/api/coach/chat-messages?reportId=${reportId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          const loaded: PlanChatMessage[] = data.messages.map(
            (m: { role: string; content: string; created_at: string }) => ({
              role:      m.role as "user" | "assistant",
              content:   m.content,
              timestamp: m.created_at,
            })
          );
          setChatMessages(loaded);
        }
      })
      .catch(() => {});
  }, [reportId, historyLoaded]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleGenerate(force = false) {
    setGenerating(true);
    setGenError(null);
    try {
      const res  = await fetch("/api/coach/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paces, force, week: activeWeek }),
      });
      const data = await res.json();
      if (res.ok && data.frozen) {
        /*
         * The week had already started, so the server left it exactly as it was.
         * That is the correct outcome, not a failure — say so, and point at the
         * week the improvement will actually land in.
         */
        setGenError(data.notice ?? "Esta semana já está em andamento.");
        if (data.suggestWeek && data.suggestWeek !== activeWeek) setActiveWeek(data.suggestWeek);
      } else if (res.ok && data.plan) {
        setPlans(prev => ({ ...prev, [activeWeek]: data.plan as WeeklyPlanData }));
        setReportIds(prev => ({ ...prev, [activeWeek]: data.reportId ?? null }));
        setChatMessages([]);
      } else {
        setGenError(data.error ?? "Erro ao gerar plano.");
      }
    } catch {
      setGenError("Falha na conexão. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  }

  /** Aplica a proposta que está na tela. O servidor refaz a conta. */
  async function applyPending() {
    if (!pending || chatLoading) return;
    setChatLoading(true);
    try {
      const res = await fetch("/api/coach/weekly-plan/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true, week: activeWeek, edits: pending.edits }),
      });
      const data = await res.json();
      setPending(null);
      setChatMessages(prev => [...prev, {
        role: "assistant" as const,
        content: (data.assistantMessage ?? data.error ?? "Não consegui aplicar.") as string,
        timestamp: new Date().toISOString(),
      }]);
      if (data.updatedPlan) setPlan(data.updatedPlan as WeeklyPlanData);
    } catch {
      setChatMessages(prev => [...prev, {
        role: "assistant" as const,
        content: "Erro de conexão. Tente novamente.",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleSendMessage() {
    const msg = chatInput.trim();
    if (!msg || !plan || chatLoading) return;

    const userMsg: PlanChatMessage = {
      role: "user", content: msg, timestamp: new Date().toISOString(),
    };
    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    setChatInput("");
    setChatLoading(true);

    try {
      const res  = await fetch("/api/coach/weekly-plan/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:     msg,
          currentPlan: plan,
          chatHistory: newHistory,
          reportId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setChatMessages(prev => [...prev, {
          role: "assistant" as const,
          content: data.assistantMessage as string,
          timestamp: new Date().toISOString(),
        }]);
        /*
         * A resposta é uma PROPOSTA: nada foi gravado. Fica pendente até o
         * atleta tocar em "Aplicar" — e aí o servidor refaz as mesmas edições
         * sobre o plano guardado (ADR-05).
         */
        const edits = (data.edits ?? []) as unknown[];
        setPending(edits.length > 0 ? { edits, changes: (data.changes ?? []) as string[] } : null);
      } else {
        setChatMessages(prev => [...prev, {
          role: "assistant" as const,
          content: data.error ?? "Erro ao processar.",
          timestamp: new Date().toISOString(),
        }]);
      }
    } catch {
      setChatMessages(prev => [...prev, {
        role: "assistant" as const,
        content: "Erro de conexão. Tente novamente.",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setChatLoading(false);
    }
  }

  /** Uma sessão mudou de dia: o plano inteiro volta, e o dia aberto segue junto. */
  const onPlanChanged = (p: WeeklyPlanData) => {
    setPlans(prev => ({ ...prev, [activeWeek]: p }));
    setSelectedDay(p.days.find(x => x.day === selectedDay?.day) ?? null);
  };

  /** Um dia mudou (adaptação): troca só ele, no plano que está na tela. */
  const onDayChanged = (next: WeeklyPlanDay) => {
    if (!plan) return;
    setPlans(prev => ({
      ...prev,
      [activeWeek]: { ...plan, days: plan.days.map(d => d.day === next.day ? next : d) },
    }));
    setSelectedDay(next);
  };

  /** A conversa, com o assunto já posto. */
  const onAsk = (session: WeeklyPlanDay) => {
    setChatInput(`Sobre o treino de ${session.dayPt.toLowerCase()} (${session.label}): `);
    setShowChat(true);
    setTimeout(() => chatInputRef.current?.focus(), 50);
  };

  // ── O que já aconteceu nesta semana ──────────────────────────────────────
  //
  // Uma leitura só, memorizada: a agenda pergunta sete vezes (uma por linha) e
  // o painel do dia mais uma.

  const todayStr = localDateStr(new Date());
  const progressByDay = useMemo(() => {
    const out: Record<string, DayProgress> = {};
    if (!plan?.days) return out;
    for (const day of plan.days) {
      if (!day?.day) continue;
      out[day.day] = dayProgress({
        day, date: dateOf(activeWeek, day.day), today: todayStr,
        runs: doneRuns, activities: doneActivities,
      });
    }
    return out;
  }, [plan, activeWeek, todayStr, doneRuns, doneActivities]);

  const selectedDone: DoneItem[] = useMemo(() => {
    if (!selectedDay) return [];
    return dayDone({
      day: selectedDay, date: dateOf(activeWeek, selectedDay.day),
      runs: doneRuns, activities: doneActivities,
    });
  }, [selectedDay, activeWeek, doneRuns, doneActivities]);

  /*
    Um controle de navegação, não o protagonista da tela: ocupa o que precisa e
    fica no canto do cabeçalho, onde se procura uma troca de contexto.
  */
  const weekTabs = (
    <div className="inline-flex gap-0.5 rounded-xl bg-surface-800 p-0.5">
      {[
        { key: currentMonday, label: "Esta semana" },
        { key: nextMonday,    label: "Próxima" },
      ].map(w => (
        <button
          key={w.key}
          onClick={() => setActiveWeek(w.key)}
          className={`min-h-[40px] rounded-[10px] px-3 text-xs font-semibold transition-colors duration-100 ${
            activeWeek === w.key
              ? "bg-surface-600 text-surface-100 shadow-sm"
              : "text-surface-400 hover:text-surface-200"
          }`}
        >
          {w.label}
        </button>
      ))}
    </div>
  );

  /* A rotina de sempre é outra conversa — acesso secundário, não concorrente. */
  const defaultDaysLink = (
    <button
      onClick={() => document.getElementById("training-prefs")?.scrollIntoView({ behavior: "smooth", block: "center" })}
      className="flex min-h-[44px] items-center gap-1.5 text-xs text-surface-500 transition-colors hover:text-brand-300"
    >
      <CalendarDays className="h-3.5 w-3.5" /> Meus dias de sempre
    </button>
  );

  // ── Carregando ───────────────────────────────────────────────────────────

  if (!plan && loadingWeek) return <WeekSkeleton week={activeWeek} tabs={weekTabs} />;

  // ── Sem plano para a semana escolhida ────────────────────────────────────

  if (!plan) {
    return (
      <div className="card space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/20">
            <CalendarDays className="h-5 w-5 text-brand-400" />
          </div>
          <div>
            {/* O plano é do motor (Daniels/Friel); a IA só escreve o recado. */}
            <h2 className="font-bold text-surface-100">Sua semana</h2>
            <p className="text-xs text-surface-500">{formatWeekRange(activeWeek)}</p>
          </div>
        </div>

        {weekTabs}

        {/*
          A agenda é dado de planejamento: dada antes de a semana existir, a
          semana nasce em cima dela. É aqui que ela importa mais — quem não tem
          plano está prestes a gerar um, e os dias em que ele cai são
          exatamente o que essa pessoa veio resolver.
        */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <WeekFitControl
            key={`fit-empty-${activeWeek}`}
            week={activeWeek}
            plan={null}
            isNextWeek={isNextWeek}
            todayKey={getTodayDayKey()}
            onChanged={() => {}}
          />
          {defaultDaysLink}
        </div>

        {genError && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
            <p className="text-sm text-red-400">{genError}</p>
          </div>
        )}

        <div className="space-y-4 py-6 text-center">
          <div className="text-surface-500">
            <CalendarDays className="mx-auto mb-3 h-8 w-8 opacity-30" />
            <p className="text-sm">
              {isNextWeek ? "Semana que vem — sem plano ainda" : "Nova semana — sem plano gerado ainda"}
            </p>
            <p className="mt-1 text-xs text-surface-500">
              Gerado automaticamente toda segunda · ajuste via chat depois
            </p>
          </div>
          <button onClick={() => handleGenerate(false)} disabled={generating} className="btn-primary mx-auto">
            {generating ? (
              <><Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />Gerando…</>
            ) : (
              <><Sparkles className="mr-1.5 inline h-3.5 w-3.5" />
                {isNextWeek ? "Gerar plano da próxima semana" : "Gerar plano desta semana"}</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── A semana ─────────────────────────────────────────────────────────────

  const todayKey = isNextWeek ? null : getTodayDayKey();
  const dayIndex = (d: WeeklyPlanDay["day"]) => DAY_ORDER.indexOf(d);

  /** Adaptar vale para a semana que está sendo vivida, de hoje em diante. */
  const canAdapt = !!selectedDay && isRunSession(selectedDay) && !isNextWeek
    && !!todayKey && dayIndex(selectedDay.day) >= dayIndex(todayKey);

  return (
    /*
      Sem a caixa grande em volta de tudo: o card envolvia cabeçalho, abas,
      avisos, agenda, cards do dia e conversa — e dentro dele quase tudo era
      outra caixa. O espaço entre os blocos hierarquiza melhor do que uma borda
      por agrupamento.
    */
    <div className="space-y-5">

      <WeekHeader
        weekStart={plan.week_start}
        cycle={plan.cycle ?? null}
        summary={weekSummaryLine(plan.days ?? [])}
        tabs={weekTabs}
        canRegenerate={isNextWeek}
        generating={generating}
        onRegenerate={() => {
          if (!confirm(
            "Refazer a semana do zero?\n\nO plano atual é descartado — adaptações, trocas de dia e a agenda desta semana se perdem.",
          )) return;
          handleGenerate(true);
        }}
      />

      {offlineWeek === activeWeek && (
        <div className="flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2">
          <WifiOff className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
          <p className="text-[11px] text-yellow-300">
            Plano salvo no aparelho — sem conexão, alterações não serão salvas agora.
          </p>
        </div>
      )}

      {/* Erros ficam junto da ação que os causou. */}
      {genError && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-sm text-red-400">{genError}</p>
          <button onClick={() => setGenError(null)} aria-label="Dispensar" className="shrink-0 text-red-400/70 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/*
        A semana anterior ficou curta. Fica em destaque, e não dentro de
        "Entender o planejamento", porque muda o que se espera desta aqui.
      */}
      {plan.week_reading && plan.week_reading.status === "short" && (
        <div className="rounded-xl border border-surface-700 px-4 py-3">
          <p className="text-sm font-medium text-surface-200">{plan.week_reading.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-surface-400">{plan.week_reading.detail}</p>
        </div>
      )}

      <WeekFocus plan={plan} />

      {/* "Esta semana só consigo terça, quinta e sábado" — a semana reorganizada,
          explicada, confirmada. Ao lado, os dias de sempre, que valem para todas. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <WeekFitControl
          key={`fit-${activeWeek}-${plan.rearrangement?.at ?? "none"}`}
          week={activeWeek}
          plan={plan}
          isNextWeek={isNextWeek}
          todayKey={todayKey ?? "Mon"}
          onChanged={(next) => {
            if (!next) return;
            setPlans(prev => ({ ...prev, [activeWeek]: next }));
            setSelectedDay(null);
          }}
        />
        {defaultDaysLink}
      </div>

      {/*
        A agenda tem largura fixa (~330 px): é uma lista de sete linhas curtas, e
        esticá-la só afasta o nome do treino da sua distância. O que sobra fica
        com o dia, que é quem tem texto, séries e exercícios para mostrar.
      */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)] xl:gap-8">
        {/* Uma superfície discreta segura a lista; as linhas não têm borda cada uma. */}
        <div className="rounded-2xl bg-surface-800/40 p-1.5">
          <WeekAgenda
            days={plan.days.filter((d): d is WeeklyPlanDay => !!d && !!d.day)}
            weekStart={activeWeek}
            todayKey={todayKey}
            selectedDay={selectedDay}
            progressOf={(d) => progressByDay[d.day] ?? null}
            onSelect={(d) => {
              /*
                Tocar no dia aberto fecha o dia (Sérgio, 26/09).

                Ficou um tempo sem fechar, para o painel nunca aparecer vazio.
                Mas quem quer ver a semana inteira precisa de uma saída, e
                tocar de novo no que está aberto é onde a mão procura.
              */
              if (selectedDay?.day === d.day) { setSelectedDay(null); return; }
              setSelectedDay(d);
              /*
                No celular a lista e o dia são empilhados: sem rolar, o treino
                nasce abaixo da dobra e parece que nada aconteceu. Rola só o
                necessário para o painel aparecer — `scrollIntoView` levava o
                topo dele ao topo da tela, o que no celular passava direto pelo
                começo do treino. No computador o dia já está ao lado.
              */
              if (typeof window !== "undefined" && window.innerWidth < 1024) {
                setTimeout(() => {
                  // `block: "nearest"` rola o mínimo para o treino aparecer.
                  // Com `"start"` a página descia até o topo do painel ficar no
                  // topo da tela, e no celular isso passava do começo do treino
                  // (Sérgio, 26/09). O respiro vem do `scroll-mt-20` no painel.
                  dayPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }, 60);
              }
            }}
          />
        </div>

        <div ref={dayPanelRef} className="scroll-mt-20">
          {/* No computador o dia acompanha a rolagem: a semana nunca sai da vista. */}
          <div className="lg:sticky lg:top-24">
            <DayPanel
              day={selectedDay}
              week={activeWeek}
              isToday={!!selectedDay && selectedDay.day === todayKey}
              canAdapt={canAdapt}
              progress={selectedDay ? progressByDay[selectedDay.day] ?? null : null}
              done={selectedDone}
              plannedTest={plannedTest}
              onPlanChanged={onPlanChanged}
              onDayChanged={onDayChanged}
              onAsk={onAsk}
              onTestChanged={onTestChanged}
              measureBy={measureBy}
            />
          </div>
        </div>
      </div>

      <WeekChat
        ref={chatInputRef}
        open={showChat}
        onToggle={() => setShowChat(v => !v)}
        messages={chatMessages}
        loading={chatLoading}
        input={chatInput}
        onInput={setChatInput}
        onSend={handleSendMessage}
        pending={pending}
        onApply={applyPending}
        onDismiss={() => setPending(null)}
        endRef={chatEndRef}
      />
    </div>
  );
}
