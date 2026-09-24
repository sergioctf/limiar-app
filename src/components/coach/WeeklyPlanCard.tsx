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
import { describeDay } from "@/lib/day-description";
import { savePlanOffline, loadPlanOffline } from "@/lib/offline-store";
import { isLegacyPlanShape } from "@/lib/workout-builder";
import { WorkoutStepsView } from "@/components/coach/WorkoutStepsView";
import { StrengthSessionView } from "@/components/coach/StrengthSessionView";
import { localMondayStr, localNextMondayStr, DAY_SHORT_PT, dateOfWeekDay } from "@/lib/week";
import { MoveSessionControl } from "@/components/coach/MoveSessionControl";
import { AdaptSessionControl } from "@/components/today/AdaptSession";
import { ShoeHint } from "@/components/coach/ShoeHint";

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
  bg: string; border: string; text: string; dot: string; icon: React.ReactNode;
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
  const [chatMessages, setChatMessages] = useState<PlanChatMessage[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const [chatLoading,  setChatLoading]  = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
        if (data.updatedPlan) {
          setPlan(data.updatedPlan as WeeklyPlanData);
        }
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

  const weekTabs = (
    <div className="flex gap-1 bg-surface-700 rounded-xl p-1">
      {[
        { key: currentMonday, label: "Esta semana" },
        { key: nextMonday,    label: "Próxima" },
      ].map(w => (
        <button
          key={w.key}
          onClick={() => setActiveWeek(w.key)}
          className={`flex-1 min-h-[44px] py-1.5 px-3 rounded-lg text-[11px] font-semibold transition-colors duration-100 ${
            activeWeek === w.key ? "bg-surface-600 text-surface-100 shadow-sm" : "text-surface-400 hover:text-surface-200"
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
        <CalendarDays className="w-3.5 h-3.5" /> Mudar meus dias de treino
      </button>
      <span className="text-surface-600 hidden sm:inline">
        {plan ? "ou toque num dia para movê-lo só desta vez" : "antes de gerar o plano"}
      </span>
    </div>
  );

  // ── Empty state (no plan for the selected week) ──────────────────────────

  if (!plan) {
    return (
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h2 className="font-bold text-surface-100">Plano semanal IA</h2>
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

        {loadingWeek ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
          </div>
        ) : (
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

  const todayKey = getTodayDayKey();
  const selStyle = selectedDay ? typeStyle(selectedDay.type) : null;

  return (
    <div className="card p-5 space-y-4">

      {/* Header — no prominent regenerate button (to not waste calls) */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h2 className="font-bold text-surface-100">Plano semanal IA</h2>
            <p className="text-xs text-surface-500">{formatWeekRange(plan.week_start)}</p>
          </div>
        </div>
        {/* Regenerate: subtle, only accessible intentionally */}
        <button
          onClick={() => handleGenerate(true)}
          disabled={generating}
          title="Regenerar plano (gera novo plano desta semana)"
          className="flex items-center gap-1 text-[11px] text-surface-500 hover:text-surface-400 transition-colors min-h-[44px] py-1 px-2 rounded-lg hover:bg-surface-700/50"
        >
          {generating
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RotateCcw className="w-3 h-3" />}
          <span className="hidden sm:inline">Regenerar</span>
        </button>
      </div>

      {weekTabs}

      {daysShortcut}

      {/* "Esta semana só consigo terça, quinta e sábado" — the week reorganised, explained, confirmed. */}
      <WeekFitControl
        key={`fit-${activeWeek}-${plan.rearrangement?.at ?? "none"}`}
        week={activeWeek}
        plan={plan}
        isNextWeek={isNextWeek}
        todayKey={todayKey}
        onChanged={(next) => {
          if (!next) return;
          setPlans(prev => ({ ...prev, [activeWeek]: next }));
          setSelectedDay(null);
        }}
      />

      {offlineWeek === activeWeek && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
          <WifiOff className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          <p className="text-[11px] text-yellow-300">
            Plano salvo no aparelho — sem conexão, alterações não serão salvas agora.
          </p>
        </div>
      )}

      {/* Errors belong next to the action that caused them — a failure loading
          another week shouldn't surface under an unrelated workout. */}
      {genError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start justify-between gap-2">
          <p className="text-sm text-red-400">{genError}</p>
          <button
            onClick={() => setGenError(null)}
            aria-label="Dispensar"
            className="text-red-400/70 hover:text-red-300 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/*
        How the week before this one entered it. The athlete should never have to
        guess why the volume moved — or why it did not, after a week that work
        or weather broke.
      */}
      {plan.week_reading && plan.week_reading.status === "short" && (
        <div className="border border-surface-700 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-surface-200">{plan.week_reading.headline}</p>
          <p className="text-sm text-surface-400 leading-relaxed mt-1">{plan.week_reading.detail}</p>
        </div>
      )}

      {/*
        A semana de recuperação diz o que é.

        A de 28/09 do Sérgio saiu com 14 km em 3 + 3 + 8, e nada na tela dizia
        que era a quarta semana do bloco, mais leve de propósito — ele leu como
        plano quebrado. Um número pequeno sem explicação parece erro; com ela,
        parece o que é.
      */}
      {plan.cycle?.isRecovery && (
        <div className="flex items-start gap-2.5 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3">
          <Moon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          <div>
            <p className="text-sm font-semibold text-surface-100">Semana de recuperação</p>
            <p className="mt-0.5 text-xs leading-relaxed text-surface-400">
              A quarta do bloco, mais leve de propósito: é quando o corpo absorve as três semanas
              anteriores. Na próxima, o volume volta a subir.
            </p>
          </div>
        </div>
      )}

      {/* AI proactive message */}
      {plan.ai_message && (
        <div className="bg-brand-500/8 border border-brand-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
          <p className="text-sm text-surface-300 leading-relaxed">{plan.ai_message}</p>
        </div>
      )}

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-1">
        {plan.days.filter((day): day is WeeklyPlanDay => !!day && !!day.day).map((day) => {
          const dayKey     = day.day;
          const label      = day.label ?? "";
          const s          = typeStyle(day.type);
          const isSelected = selectedDay?.day === dayKey;
          const isToday    = dayKey === todayKey && !isNextWeek;
          const shortLabel = label.length > 7 ? label.slice(0, 6) + "…" : label;

          return (
            <button
              key={dayKey}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className={[
                "relative flex flex-col items-center gap-0.5 py-2.5 px-0.5 rounded-xl border transition-colors duration-100 active:opacity-80",
                s.bg, s.border,
                isSelected ? "ring-2 ring-brand-400/60 shadow-sm shadow-brand-500/20" : "",
              ].join(" ")}
            >
              {/* Today indicator dot */}
              {isToday && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-brand-400" />
              )}
              {/* Em português e com a data: "MO" e "TU" eram a chave interna, que é inglesa. */}
              <span className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? "text-brand-400" : "text-surface-400"}`}>
                {DAY_SHORT_PT[dayKey] ?? dayKey}
              </span>
              <span className={`text-[10px] leading-none ${isToday ? "text-brand-400/80" : "text-surface-500"}`}>
                {dateOfWeekDay(activeWeek, dayKey) ?? ""}
              </span>
              {/* A day can hold two sessions; showing one icon hid the other. */}
              <span className="flex items-center gap-0.5 leading-none">
                {day.sport
                  ? <span className="text-[11px] leading-none" aria-hidden>{SPORTS[day.sport].emoji}</span>
                  : <div className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />}
                {day.strength && day.sport !== "musculacao" && (
                  <span className="text-[11px] leading-none" aria-hidden>{SPORTS.musculacao.emoji}</span>
                )}
              </span>
              <span className={`text-[10px] font-semibold ${s.text} text-center leading-tight hidden xs:block`}>
                {shortLabel}
              </span>
              {/* On mobile: only show metric if selected, always on sm+ */}
              {day.distance_km != null && (
                <span className={`text-[10px] text-surface-500 font-medium ${isSelected ? "block" : "hidden sm:block"}`}>
                  {day.distance_km}km
                </span>
              )}
              {day.distance_km == null && day.duration_min != null && (
                <span className={`text-[10px] text-surface-500 ${isSelected ? "block" : "hidden sm:block"}`}>
                  {day.duration_min}m
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay && selStyle && (
        <div className={`${selStyle.bg} border ${selStyle.border} rounded-xl p-4 space-y-2.5 transition-all`}>
          <div className="flex items-center gap-2">
            <span className={selStyle.text}>
              {selectedDay.sport ? <span className="text-base" aria-hidden>{SPORTS[selectedDay.sport].emoji}</span> : selStyle.icon}
            </span>
            <span className={`font-bold text-sm ${selStyle.text}`}>
              {selectedDay.dayPt} — {selectedDay.label}
            </span>
            <div className="ml-auto flex items-center gap-2 text-xs text-surface-400">
              {selectedDay.distance_km != null && <span>{selectedDay.distance_km} km</span>}
              {selectedDay.duration_min != null && <span>{selectedDay.duration_min} min</span>}
            </div>
          </div>
          {selectedDay.pace && (
            <p className="text-xs text-surface-400">
              <span className="text-surface-500">Ritmo: </span>
              <span className="font-medium">{selectedDay.pace}</span>
            </p>
          )}
          {/* Derivado do dia, nunca o texto cru: ver day-description.ts. */}
          <p className="text-sm text-surface-300 leading-relaxed">{describeDay(selectedDay)}</p>

          <ShoeHint day={selectedDay} />

          {/* Only a run can be moved as "a corrida" — offering it on a pilates
              day promised something the plan editor cannot do. */}
          {isRunSession(selectedDay) && (
            <MoveSessionControl
              week={activeWeek}
              day={selectedDay.day}
              session="corrida"
              label={selectedDay.label}
              onMoved={(p: WeeklyPlanData) => {
                setPlans(prev => ({ ...prev, [activeWeek]: p }));
                setSelectedDay(p.days.find(x => x.day === selectedDay.day) ?? null);
              }}
            />
          )}

          {/* Adapting is for the week being lived, today or later. */}
          {isRunSession(selectedDay) && !isNextWeek
            && ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(selectedDay.day)
               >= ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(todayKey) && (
            <AdaptSessionControl
              day={selectedDay}
              onChanged={(next: WeeklyPlanDay) => {
                if (!plan) return;
                const updated = { ...plan, days: plan.days.map(d => d.day === next.day ? next : d) };
                setPlans(prev => ({ ...prev, [activeWeek]: updated }));
                setSelectedDay(next);
              }}
            />
          )}

          {/* On a lifting-only day this IS the session, so it belongs here.
              When a run shares the day it gets its own card below instead. */}
          {selectedDay.strength && selectedDay.sport === "musculacao" && (
            <>
              <MoveSessionControl
                week={activeWeek}
                day={selectedDay.day}
                session="musculacao"
                label="Musculação"
                onMoved={(p: WeeklyPlanData) => {
                setPlans(prev => ({ ...prev, [activeWeek]: p }));
                setSelectedDay(p.days.find(x => x.day === selectedDay.day) ?? null);
              }}
              />
              <StrengthSessionView
            session={selectedDay.strength}
            day={selectedDay.day}
            weekStart={activeWeek}
          />
            </>
          )}

          {/* Structured steps + watch export (quality sessions) */}
          {selectedDay.structure && selectedDay.structure.blocks.length > 0 && (
            <WorkoutStepsView
              structure={selectedDay.structure}
              label={selectedDay.label}
              sport={selectedDay.sport}
            />
          )}
        </div>
      )}

      {/*
        The lifting session gets its own card.
        Two sessions on one day are two workouts, not a footnote inside the run
        — buried under the running detail, the athlete simply did not see it.
      */}
      {selectedDay?.strength && selectedDay.sport !== "musculacao" && (
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden>{SPORTS.musculacao.emoji}</span>
            <span className="font-bold text-sm text-purple-300">
              {selectedDay.dayPt} — Musculação
            </span>
            <span className="ml-auto text-xs text-surface-400">
              ~{selectedDay.strength.estimatedMinutes} min
            </span>
          </div>
          <p className="text-xs text-surface-400 leading-relaxed">
            Segunda sessão do dia. Corra primeiro e levante depois, com ~6 h entre as duas.
          </p>
          <MoveSessionControl
            week={activeWeek}
            day={selectedDay.day}
            session="musculacao"
            label="Musculação"
            onMoved={(p: WeeklyPlanData) => {
                setPlans(prev => ({ ...prev, [activeWeek]: p }));
                setSelectedDay(p.days.find(x => x.day === selectedDay.day) ?? null);
              }}
          />
          <StrengthSessionView
            session={selectedDay.strength}
            day={selectedDay.day}
            weekStart={activeWeek}
          />
        </div>
      )}

      {/* Chat toggle */}
      <button
        onClick={() => setShowChat(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-surface-700/50 hover:bg-surface-700 transition-colors text-sm"
      >
        <span className="flex items-center gap-2 text-surface-400 hover:text-surface-200 transition-colors">
          <MessageCircle className="w-4 h-4" />
          <span>Ajustar com o treinador</span>
          {chatMessages.length > 0 && (
            <span className="bg-brand-500/20 text-brand-400 text-xs px-1.5 py-0.5 rounded-full font-medium">
              {chatMessages.length}
            </span>
          )}
        </span>
        {showChat
          ? <ChevronUp className="w-4 h-4 text-surface-500" />
          : <ChevronDown className="w-4 h-4 text-surface-500" />}
      </button>

      {/* Chat interface */}
      {showChat && (
        <div className="space-y-3">

          {/* Message history */}
          {chatMessages.length > 0 && (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={[
                    "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-brand-500/20 text-surface-100 rounded-br-sm"
                      : "bg-surface-700 text-surface-300 rounded-bl-sm",
                  ].join(" ")}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-surface-700 px-3.5 py-2.5 rounded-2xl rounded-bl-sm">
                    <div className="flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Input row */}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
              }}
              placeholder="Ex: remove o treino de quinta, adiciona musculação…"
              className="flex-1 bg-surface-700 border border-surface-600 rounded-xl px-3.5 py-2.5 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500 transition-colors"
              disabled={chatLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || chatLoading}
              className="shrink-0 w-10 h-10 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>

          <p className="text-[11px] text-surface-500 text-center">
            Peça ajustes — o plano é salvo automaticamente quando mudado
          </p>
        </div>
      )}

    </div>
  );
}
