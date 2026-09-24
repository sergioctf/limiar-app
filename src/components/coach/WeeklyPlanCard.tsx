"use client";

import { useState, useRef, useEffect } from "react";
import { WeekFitControl } from "@/components/coach/WeekFitControl";
import {
  CalendarDays, Sparkles, Loader2, Send, RotateCcw,
  MessageCircle, ChevronDown, ChevronUp, X, WifiOff,
  Moon, Wind, Timer, Repeat, Zap, Trophy, FlaskConical, Dumbbell,
} from "lucide-react";
import type { WeeklyPlanData, WeeklyPlanDay, PlanChatMessage } from "@/types";
import { SPORTS, isRunSession } from "@/lib/sports";
import { sessionTone } from "@/lib/session-colors";
import { stripStrengthTail, strengthSummary } from "@/lib/day-description";
import { WeekAgenda } from "@/components/coach/WeekAgenda";
import { weekSummaryLine } from "@/lib/week-agenda";
import { savePlanOffline, loadPlanOffline } from "@/lib/offline-store";
import { isLegacyPlanShape } from "@/lib/workout-builder";
import { WorkoutStepsView } from "@/components/coach/WorkoutStepsView";
import { StrengthSessionView } from "@/components/coach/StrengthSessionView";
import { localMondayStr, localNextMondayStr, dateOfWeekDay } from "@/lib/week";
import { MoveSessionControl } from "@/components/coach/MoveSessionControl";
import { AdaptSessionControl } from "@/components/today/AdaptSession";
import { ShoeHint } from "@/components/coach/ShoeHint";
import { Disclosure } from "@/components/ui/Disclosure";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getCurrentMondayStr = localMondayStr;
const getNextMondayStr    = localNextMondayStr;

function getTodayDayKey(): WeeklyPlanDay["day"] {
  const keys: WeeklyPlanDay["day"][] = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return keys[new Date().getDay()];
}

function formatWeekRange(mondayStr: string): string {
  const mon = new Date(mondayStr + "T12:00:00");
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  if (mon.getMonth() === sun.getMonth()) {
    return `${mon.getDate()} a ${sun.getDate()} de ${months[mon.getMonth()]}`;
  }
  return `${mon.getDate()} ${months[mon.getMonth()]} – ${sun.getDate()} ${months[sun.getMonth()]}`;
}

// ─── Type → visual style ─────────────────────────────────────────────────────
//
// As cores vêm de `session-colors.ts` para a Hoje poder falar a mesma língua
// (rodagem verde, tiro vermelho, longão roxo). Os ícones ficam aqui, porque só
// esta tela usa esse desenho.

interface TypeStyle {
  bg: string; border: string; text: string; dot: string;
  /** Como chamar esse tipo em uma palavra: "Rodagem", "Tiro", "Longão". */
  label: string;
  icon: React.ReactNode;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  rest:      <Moon         className="w-3.5 h-3.5" />,
  easy:      <Wind         className="w-3.5 h-3.5" />,
  recovery:  <Wind         className="w-3.5 h-3.5" />,
  tempo:     <Timer        className="w-3.5 h-3.5" />,
  intervals: <Repeat       className="w-3.5 h-3.5" />,
  long_run:  <Zap          className="w-3.5 h-3.5" />,
  test:      <FlaskConical className="w-3.5 h-3.5" />,
  race:      <Trophy       className="w-3.5 h-3.5" />,
  strength:  <Dumbbell     className="w-3.5 h-3.5" />,
  hiit:      <Dumbbell     className="w-3.5 h-3.5" />,
};

function typeStyle(type: string): TypeStyle {
  const tone = sessionTone(type);
  return { ...tone, icon: TYPE_ICONS[type] ?? TYPE_ICONS.easy };
}

/**
 * O nome do botão que abre o passo a passo, conforme o treino.
 *
 * Um sistema que chama "série" o que é uma rodagem contínua parece inacabado,
 * mesmo quando o conteúdo por trás está certo.
 */
const SERIES_TYPES = new Set(["intervals", "tempo", "hiit", "test", "race"]);

function structureTitle(type: string): string {
  return SERIES_TYPES.has(type) ? "Ver as séries" : "Ver a estrutura";
}

function structureSummary(blocks: number): string {
  return blocks > 1
    ? `${blocks} blocos · exportar para o relógio`
    : "Passo a passo · exportar para o relógio";
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialPlan:  WeeklyPlanData | null;
  initialReportId?: string | null;
  paces?:       { easy?: string; threshold?: string; long?: string; interval?: string } | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WeeklyPlanCard({ initialPlan, initialReportId, paces }: Props) {
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

  const plan     = plans[activeWeek] ?? null;
  const reportId = reportIds[activeWeek] ?? null;
  const isNextWeek = activeWeek === nextMonday;

  const setPlan = (p: WeeklyPlanData | null) =>
    setPlans(prev => ({ ...prev, [activeWeek]: p }));

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

  const [selectedDay,  setSelectedDay]  = useState<WeeklyPlanDay | null>(null);
  const [generating,   setGenerating]   = useState(false);
  const [genError,     setGenError]     = useState<string | null>(null);
  const [showChat,     setShowChat]     = useState(false);
  /** "Entender o planejamento" — a aula sobre o bloco, quando ela é procurada. */
  const [showPlanning, setShowPlanning] = useState(false);
  const [chatMessages, setChatMessages] = useState<PlanChatMessage[]>([]);
  /** A proposta do chat esperando confirmação — nada gravado até "Aplicar". */
  const [pending, setPending] = useState<{ edits: unknown[]; changes: string[] } | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [chatInput,    setChatInput]    = useState("");
  const [chatLoading,  setChatLoading]  = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  /** O painel do dia — no celular ele entra na tela quando um dia é tocado. */
  const dayPanelRef = useRef<HTMLDivElement>(null);

  // Auto-select TODAY's day when the current week loads; for next week, the
  // first training day (there is no "today" to highlight there).
  useEffect(() => {
    if (!plan?.days) { setSelectedDay(null); return; }
    const fallback = plan.days.find(d => d.type !== "rest") ?? plan.days[0] ?? null;
    if (isNextWeek) { setSelectedDay(fallback); return; }
    const DAY_KEYS: WeeklyPlanDay["day"][] = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const todayKey = DAY_KEYS[new Date().getDay()];
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

  // ── Week switcher (this week / next week) ────────────────────────────────

  /*
    Um controle de navegação, não o protagonista da tela.

    Era uma barra da largura inteira do card, do mesmo tamanho visual do plano
    que ela serve para escolher. Agora ocupa o que precisa e fica no canto do
    cabeçalho, onde se procura uma troca de contexto.
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

  /*
    The way out of this card, for the two things people want to change.
    Both already existed — "Sua semana" sits below the advisor, and moving a
    single session is inside a day you have to open first — which meant an
    athlete who simply could not run on Wednesday had to scroll past everything
    to find out either was possible.

    It lives beside `weekTabs` rather than inside the plan, because the empty
    state is where it matters *most*: an athlete with no plan yet is about to
    generate one, and the days it lands on are exactly what they came to fix.
    Shipping it only in the has-plan branch hid it from every new user — which
    is precisely the athlete who has never seen "Sua semana" either.
  */
  const daysShortcut = (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <button
        onClick={() => {
          document.getElementById("training-prefs")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        className="text-surface-400 hover:text-brand-300 transition-colors min-h-[44px] flex items-center gap-1.5"
      >
        <CalendarDays className="w-3.5 h-3.5" /> Meus dias de sempre
      </button>
      <span className="text-surface-600 hidden sm:inline">
        {plan ? "ou toque num dia para movê-lo só desta vez" : "antes de gerar o plano"}
      </span>
    </div>
  );

  /*
    ── Carregando ≠ sem plano ────────────────────────────────────────────────

    Trocar de semana passava pelo estado vazio enquanto a busca acontecia: por
    um instante a tela dizia "sem plano gerado ainda" e "antes de gerar o
    plano", oferecendo um botão de gerar para uma semana que talvez já tivesse
    plano. Agora o espaço da agenda fica reservado, com sete linhas cinzas.
  */
  if (!plan && loadingWeek) {
    return (
      <div className="space-y-5" aria-busy="true">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold leading-tight text-surface-100">Sua semana</h2>
            <p className="mt-1 text-sm text-surface-500">{formatWeekRange(activeWeek)}</p>
          </div>
          {weekTabs}
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)] xl:gap-8">
          <div className="space-y-0.5 rounded-2xl bg-surface-800/40 p-1.5">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
              <div key={d} className="h-[56px] animate-pulse rounded-xl bg-surface-700/30" />
            ))}
          </div>
          <div className="h-40 animate-pulse rounded-2xl bg-surface-800/40" />
        </div>
      </div>
    );
  }

  // ── Empty state (no plan for the selected week) ──────────────────────────

  if (!plan) {
    return (
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            {/* O plano é do motor (Daniels/Friel); a IA só escreve o recado. */}
            <h2 className="font-bold text-surface-100">Sua semana</h2>
            <p className="text-xs text-surface-500">{formatWeekRange(activeWeek)}</p>
          </div>
        </div>

        {weekTabs}
        {daysShortcut}
        {/* The agenda is planning data: given before the week exists, the week is built on it. */}
        <WeekFitControl
          key={`fit-empty-${activeWeek}`}
          week={activeWeek}
          plan={null}
          isNextWeek={isNextWeek}
          todayKey={getTodayDayKey()}
          onChanged={() => {}}
        />

        {genError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <p className="text-sm text-red-400">{genError}</p>
          </div>
        )}

        {(
          <div className="text-center py-6 space-y-4">
            <div className="text-surface-500">
              <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {isNextWeek ? "Semana que vem — sem plano ainda" : "Nova semana — sem plano gerado ainda"}
              </p>
              <p className="text-xs mt-1 text-surface-500">
                Gerado automaticamente toda segunda · ajuste via chat depois
              </p>
            </div>
            <button
              onClick={() => handleGenerate(false)}
              disabled={generating}
              className="btn-primary mx-auto"
            >
              {generating ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />Gerando…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 inline mr-1.5" />
                  {isNextWeek ? "Gerar plano da próxima semana" : "Gerar plano desta semana"}</>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Plan loaded ──────────────────────────────────────────────────────────
  //
  // A semana como agenda, e o dia ao lado dela.
  //
  // Até 24/09 esta tela era uma pilha: sete caixinhas de 40 px com o rótulo
  // cortado, e abaixo delas o dia aberto, os controles, a musculação e o chat —
  // cada um numa altura diferente, todos do mesmo tamanho visual. O Sérgio
  // resumiu: "confuso, não dinâmico, cheio e pouco user friendly".
  //
  // Nada saiu. O que mudou foi onde as coisas moram: a semana à esquerda (e no
  // topo, no celular) com o nome de cada sessão; o dia selecionado à direita,
  // em cards — um por sessão, porque duas sessões num dia são dois treinos; e
  // dentro de cada card, uma ação principal (ver as séries) e as outras abaixo,
  // com o escopo no nome.

  const todayKey = isNextWeek ? null : getTodayDayKey();
  const DAY_ORDER: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayIndex = (d: WeeklyPlanDay["day"]) => DAY_ORDER.indexOf(d);

  /** O treino do dia que não é a musculação — corrida, pedal, natação, o que for. */
  const mainSession = selectedDay
    && selectedDay.type !== "rest"
    && selectedDay.type !== "strength"
    && selectedDay.sport !== "musculacao"
    ? selectedDay : null;
  const mainTone = mainSession ? typeStyle(mainSession.type) : null;

  /** Adaptar vale para a semana que está sendo vivida, de hoje em diante. */
  const canAdapt = !!mainSession && isRunSession(mainSession) && !isNextWeek
    && !!todayKey && dayIndex(mainSession.day) >= dayIndex(todayKey);

  /** "3 corridas · 21 km · 2 sessões de musculação" — o tamanho da semana, de relance. */
  const weekSummary = weekSummaryLine(plan.days ?? []);

  /** Uma sessão mudou de dia: o plano inteiro volta, e o dia aberto segue junto. */
  const onPlanChanged = (p: WeeklyPlanData) => {
    setPlans(prev => ({ ...prev, [activeWeek]: p }));
    setSelectedDay(p.days.find(x => x.day === selectedDay?.day) ?? null);
  };

  return (
    /*
      Sem a caixa grande em volta de tudo.

      O card envolvia cabeçalho, abas, avisos, agenda, cards do dia e conversa
      — e dentro dele quase tudo era outra caixa. Caixa dentro de caixa não
      hierarquiza nada: o espaço entre os blocos faz esse trabalho melhor, e
      sobram bordas só para o que precisa mesmo de destaque (propostas, avisos).
    */
    <div className="space-y-5">

      {/* ── Cabeçalho: diz o tamanho da semana, não só o período ────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {/* "Sua semana": o plano é do motor (Daniels/Friel), a IA só escreve o recado. */}
          <h2 className="text-xl font-bold leading-tight text-surface-100">Sua semana</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-surface-400">
            <span>{formatWeekRange(plan.week_start)}</span>
            {plan.cycle && (
              <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                plan.cycle.isRecovery ? "bg-cyan-500/15 text-cyan-300" : "bg-surface-700 text-surface-300"
              }`}>
                {plan.cycle.isRecovery ? "Recuperação" : `Semana ${plan.cycle.week} de 4`}
              </span>
            )}
          </p>
          {/* Somar sete dias de cabeça para saber se a semana é grande não é trabalho do atleta. */}
          {weekSummary && (
            <p className="mt-1.5 text-sm font-medium text-surface-200">{weekSummary}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {weekTabs}
          {/*
            Refazer do zero é a ação mais destrutiva desta tela, e era a menos
            explicada: chamava-se "Regenerar", tinha só um tooltip, e na semana
            em andamento — que é congelada — ela falha de propósito. Agora diz o
            nome do que faz, avisa o que se perde, e só aparece onde funciona.
          */}
          {isNextWeek && (
            <button
              onClick={() => {
                if (plan && !confirm(
                  "Refazer a semana do zero?\n\nO plano atual é descartado — adaptações, trocas de dia e a agenda desta semana se perdem.",
                )) return;
                handleGenerate(true);
              }}
              disabled={generating}
              title="Refazer do zero"
              className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-xs text-surface-400 transition-colors hover:bg-surface-700/50 hover:text-surface-200"
            >
              {generating
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RotateCcw className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Refazer do zero</span>
            </button>
          )}
        </div>
      </div>

      {/* ── O que esta semana tem de diferente ─────────────────────────── */}
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
          <button
            onClick={() => setGenError(null)}
            aria-label="Dispensar"
            className="shrink-0 text-red-400/70 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/*
        Como a semana anterior entrou nesta. O atleta não deveria ter que
        adivinhar por que o volume mudou — nem por que não mudou, depois de uma
        semana que o trabalho ou a chuva quebraram.
      */}
      {plan.week_reading && plan.week_reading.status === "short" && (
        <div className="rounded-xl border border-surface-700 px-4 py-3">
          <p className="text-sm font-medium text-surface-200">{plan.week_reading.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-surface-400">{plan.week_reading.detail}</p>
        </div>
      )}

      {/*
        O foco da semana: uma frase, sem caixa.

        Era um bloco com borda, fundo, título e dois parágrafos — a explicação
        do bloco de quatro semanas repetida toda segunda-feira, empurrando a
        agenda para baixo. O recado do treinador fica; a aula sobre
        periodização vai para trás de "Entender o planejamento", que é onde se
        procura uma explicação quando se quer uma.
      */}
      {(plan.cycle || plan.ai_message) && (
        <div className="flex items-start gap-2.5">
          {plan.cycle?.isRecovery
            ? <Moon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
            : <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-relaxed text-surface-300">
              {plan.ai_message
                ?? (plan.cycle?.isRecovery
                  ? "Semana mais leve de propósito: é ela que faz as três anteriores virarem ganho."
                  : "Três semanas subindo e uma de recuperação — é assim que o bloco funciona.")}
            </p>
            <button
              type="button"
              onClick={() => setShowPlanning(v => !v)}
              className="mt-1 min-h-[36px] text-xs font-medium text-surface-400 transition-colors hover:text-brand-300"
            >
              {showPlanning ? "Mostrar menos" : "Entender o planejamento"}
            </button>
            {showPlanning && (
              <div className="mt-1 space-y-2 border-l border-surface-700 pl-3 text-xs leading-relaxed text-surface-400">
                <p>
                  {plan.cycle?.isRecovery
                    ? "Esta é a quarta semana do bloco, mais leve de propósito: é quando o corpo absorve as três anteriores. Na próxima, o volume volta a subir."
                    : `O bloco tem quatro semanas: três subindo e uma de recuperação, que é onde o ganho se fixa.${
                        plan.cycle ? ` Esta é a ${plan.cycle.week}ª.` : ""}`}
                </p>
                {/*
                  Como a semana anterior entrou nesta. O atleta não deveria ter
                  que adivinhar por que o volume mudou — nem por que não mudou,
                  depois de uma semana que o trabalho ou a chuva quebraram.
                */}
                {plan.week_reading && plan.week_reading.status !== "short" && (
                  <p>
                    <span className="text-surface-300">{plan.week_reading.headline}</span>{" "}
                    {plan.week_reading.detail}
                  </p>
                )}
                <p>
                  Os ritmos vêm do seu teste de 3 km (VDOT) e as zonas do seu limiar; o volume
                  sobe com teto, e nunca por causa de uma semana só.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mudar a semana inteira ─────────────────────────────────────── */}
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
        {/* A rotina de sempre é outra conversa — acesso secundário, não concorrente. */}
        <button
          onClick={() => document.getElementById("training-prefs")?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="flex min-h-[44px] items-center gap-1.5 text-xs text-surface-500 transition-colors hover:text-brand-300"
        >
          <CalendarDays className="h-3.5 w-3.5" /> Meus dias de sempre
        </button>
      </div>

      {/*
        ── A semana, e o dia aberto ao lado dela ─────────────────────────

        A agenda tem largura fixa (~330 px): é uma lista de sete linhas curtas,
        e esticá-la só afasta o nome do treino da sua distância. O que sobra
        fica com o dia, que é quem tem texto, séries e exercícios para mostrar.
        Abaixo de `lg`, uma coluna só — comprimir os dois lados é pior do que
        empilhar.
      */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)] xl:gap-8">
        {/* Uma superfície discreta segura a lista; as linhas não têm borda cada uma. */}
        <div className="rounded-2xl bg-surface-800/40 p-1.5">
          <WeekAgenda
            days={plan.days.filter((d): d is WeeklyPlanDay => !!d && !!d.day)}
            weekStart={activeWeek}
            todayKey={todayKey}
            selectedDay={selectedDay}
            onSelect={(d) => {
              /*
                Tocar no dia que já está aberto não fecha nada.

                Fechava, e o painel ao lado ficava vazio com "Toque num dia para
                ver o treino" — um clique no lugar certo parecia um erro. Um
                dia sempre selecionado é o estado previsível.
              */
              if (selectedDay?.day === d.day) return;
              setSelectedDay(d);
              /*
                No celular a lista e o dia são empilhados: tocar em sábado sem
                isto deixa o treino três dedos abaixo da dobra, e parece que
                nada aconteceu. No computador o dia já está ao lado — não há
                para onde rolar.
              */
              if (typeof window !== "undefined" && window.innerWidth < 1024) {
                setTimeout(() => dayPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
              }
            }}
          />
        </div>

        <div ref={dayPanelRef}>
          {/* No computador o dia acompanha a rolagem: a semana nunca sai da vista. */}
          <div className="space-y-3 lg:sticky lg:top-24">
            {!selectedDay ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-surface-700 px-4 text-center">
                <p className="text-sm text-surface-500">Toque num dia para ver o treino.</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-surface-500">
                  {selectedDay.dayPt} {dateOfWeekDay(activeWeek, selectedDay.day) ?? ""}
                  {selectedDay.day === todayKey && <span className="ml-1.5 text-brand-400">· hoje</span>}
                </p>

                {/*
                  ── A sessão principal do dia ───────────────────────────

                  A ordem é a da pergunta que se faz olhando o card: o que é,
                  quanto, em que ritmo, e só então por quê. A descrição vinha
                  antes dos números e ganhava mais espaço que eles.

                  A cor virou etiqueta em vez de fundo. Verde já quer dizer
                  "rodagem" aqui; se amanhã também quiser dizer "concluído",
                  nenhuma das duas coisas fica clara — e nada essencial deve
                  depender só de cor.
                */}
                {mainSession && mainTone && (
                  <div className="space-y-3 rounded-2xl border border-surface-700 bg-surface-800/60 p-4">
                    <div>
                      <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${mainTone.text}`}>
                        <span className={`h-2 w-2 rounded-full ${mainTone.dot}`} aria-hidden />
                        {mainSession.sport
                          ? <span aria-hidden>{SPORTS[mainSession.sport].emoji}</span>
                          : mainTone.icon}
                        {mainTone.label}
                      </p>
                      <h3 className="mt-1 text-lg font-bold leading-tight text-surface-100">
                        {mainSession.label}
                      </h3>
                      {/* Os números que o atleta procura primeiro, numa linha só. */}
                      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-surface-300">
                        {mainSession.distance_km != null && (
                          <span className="font-semibold tabular-nums text-surface-100">{mainSession.distance_km} km</span>
                        )}
                        {mainSession.duration_min != null && (
                          <span className="font-semibold tabular-nums text-surface-100">{mainSession.duration_min} min</span>
                        )}
                        {mainSession.pace && (
                          <><span className="text-surface-600">·</span><span className="tabular-nums">{mainSession.pace}</span></>
                        )}
                      </p>
                    </div>

                    {/* Derivado do dia, nunca o texto cru: ver day-description.ts.
                        A musculação sai daqui — ela tem card próprio logo abaixo. */}
                    <p className="text-sm leading-relaxed text-surface-400">
                      {stripStrengthTail(mainSession.description ?? "")}
                    </p>

                    {/*
                      A estrutura fica atrás de um toque (Sérgio, 23/09): aberta,
                      um treino de tiros empurrava o resto da semana para longe.

                      O nome muda com o treino, porque "Ver as séries · 1 blocos"
                      numa rodagem contínua é errado duas vezes.
                    */}
                    {mainSession.structure && mainSession.structure.blocks.length > 0 && (
                      <Disclosure
                        title={structureTitle(mainSession.type)}
                        summary={structureSummary(mainSession.structure.blocks.length)}
                      >
                        <WorkoutStepsView
                          structure={mainSession.structure}
                          label={mainSession.label}
                          sport={mainSession.sport}
                        />
                      </Disclosure>
                    )}

                    <ShoeHint day={mainSession} compact />

                    {/*
                      As três coisas que se pode fazer com um treino, juntas e
                      com o escopo no nome: mudar de dia, trocar por outro,
                      perguntar. Antes estavam espalhadas em alturas diferentes.
                    */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-surface-700/50 pt-2.5">
                      {/* Só uma corrida pode ser movida como "a corrida". */}
                      {isRunSession(mainSession) && (
                        <MoveSessionControl
                          week={activeWeek}
                          day={mainSession.day}
                          session="corrida"
                          label={mainSession.label}
                          onMoved={onPlanChanged}
                        />
                      )}
                      {canAdapt && (
                        <AdaptSessionControl
                          day={mainSession}
                          onChanged={(next: WeeklyPlanDay) => {
                            if (!plan) return;
                            const updated = { ...plan, days: plan.days.map(d => d.day === next.day ? next : d) };
                            setPlans(prev => ({ ...prev, [activeWeek]: updated }));
                            setSelectedDay(next);
                          }}
                        />
                      )}
                      {/*
                        A mesma conversa, com o assunto já posto. "Uma
                        identidade, várias portas": o treinador é um só, e cada
                        porta diz o que acontece ao abri-la.
                      */}
                      <button
                        type="button"
                        onClick={() => {
                          setChatInput(`Sobre o treino de ${mainSession.dayPt.toLowerCase()} (${mainSession.label}): `);
                          setShowChat(true);
                          setTimeout(() => chatInputRef.current?.focus(), 50);
                        }}
                        className="inline-flex min-h-[44px] items-center gap-1.5 text-xs text-surface-400 transition-colors hover:text-brand-300"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> Perguntar sobre este treino
                      </button>
                    </div>
                  </div>
                )}

                {/*
                  A musculação tem card próprio, sempre.

                  Duas sessões num dia são dois treinos, não um rodapé dentro da
                  corrida — enterrada no detalhe dela, o atleta não via que existia.
                */}
                {selectedDay.strength && (
                  <div className="space-y-3 rounded-2xl border border-surface-700 bg-surface-800/60 p-4">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-purple-300">
                        <span className="h-2 w-2 rounded-full bg-purple-400" aria-hidden />
                        <span aria-hidden>{SPORTS.musculacao.emoji}</span> Musculação
                      </p>
                      {/* "peito · 4 exercícios · ~51 min" — o que é a sessão, em uma linha. */}
                      <p className="mt-1 text-[15px] font-semibold text-surface-100">
                        {strengthSummary(selectedDay.strength)}
                      </p>
                    </div>

                    {mainSession && (
                      <p className="text-xs leading-relaxed text-surface-400">
                        Segunda sessão do dia. Corra primeiro e levante depois, com ~6 h entre as duas.
                      </p>
                    )}

                    <Disclosure
                      title="Ver os exercícios"
                      summary={`${selectedDay.strength.exercises.length} exercícios · registrar as séries`}
                    >
                      <StrengthSessionView
                        session={selectedDay.strength}
                        day={selectedDay.day}
                        weekStart={activeWeek}
                      />
                    </Disclosure>

                    <div className="border-t border-surface-700/50 pt-2.5">
                      <MoveSessionControl
                        week={activeWeek}
                        day={selectedDay.day}
                        session="musculacao"
                        label="Musculação"
                        onMoved={onPlanChanged}
                      />
                    </div>
                  </div>
                )}

                {/* Um dia sem sessão também é parte do plano — e diz por quê. */}
                {!mainSession && !selectedDay.strength && (
                  <div className="rounded-2xl border border-surface-700/60 bg-surface-800/40 p-4">
                    <p className="flex items-center gap-1.5 text-[15px] font-semibold text-surface-200">
                      <Moon className="h-4 w-4 text-surface-500" /> {selectedDay.label}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-surface-400">
                      {stripStrengthTail(selectedDay.description ?? "")}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Conversar sobre esta semana ─────────────────────────────────── */}
      <button
        onClick={() => setShowChat(v => !v)}
        className="flex w-full items-center justify-between rounded-xl bg-surface-700/50 px-4 py-3 text-sm transition-colors hover:bg-surface-700"
      >
        <span className="flex items-center gap-2 text-surface-400 transition-colors hover:text-surface-200">
          <MessageCircle className="h-4 w-4" />
          <span>Conversar sobre esta semana</span>
          {chatMessages.length > 0 && (
            <span className="rounded-full bg-brand-500/20 px-1.5 py-0.5 text-xs font-medium text-brand-400">
              {chatMessages.length}
            </span>
          )}
        </span>
        {showChat
          ? <ChevronUp className="h-4 w-4 text-surface-500" />
          : <ChevronDown className="h-4 w-4 text-surface-500" />}
      </button>

      {showChat && (
        <div className="space-y-3">

          {chatMessages.length > 0 && (
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={[
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "rounded-br-sm bg-brand-500/20 text-surface-100"
                      : "rounded-bl-sm bg-surface-700 text-surface-300",
                  ].join(" ")}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-surface-700 px-3.5 py-2.5">
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-surface-400 [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-surface-400 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-surface-400 [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/*
            A proposta, antes de qualquer alteração.

            Até 24/09 a mudança já estava salva quando o atleta lia sobre ela.
            O modelo nunca escreveu o plano — ele escolhe de um vocabulário
            fixo e o motor aplica —, mas descobrir a mudança depois de feita é
            o oposto do que a ADR-05 pede.
          */}
          {pending && (
            <div className="space-y-2.5 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3">
              <ul className="space-y-1">
                {pending.changes.map((c, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-surface-300">
                    <span className="text-surface-600">·</span>{c}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button onClick={applyPending} disabled={chatLoading} className="btn-primary flex-1 py-1.5 text-xs">
                  {chatLoading ? "Aplicando…" : "Aplicar"}
                </button>
                <button onClick={() => setPending(null)} disabled={chatLoading} className="btn-ghost flex-1 py-1.5 text-xs">
                  Agora não
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              ref={chatInputRef}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
              }}
              placeholder="Ex: na quinta não vou conseguir correr 8 km"
              className="flex-1 rounded-xl border border-surface-600 bg-surface-700 px-3.5 py-2.5 text-sm text-surface-200 transition-colors placeholder:text-surface-500 focus:border-brand-500 focus:outline-none"
              disabled={chatLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || chatLoading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4 text-white" />
            </button>
          </div>

          <p className="text-center text-[11px] text-surface-500">
            Peça um ajuste e o treinador propõe — nada muda até você tocar em Aplicar
          </p>
        </div>
      )}

    </div>
  );
}
