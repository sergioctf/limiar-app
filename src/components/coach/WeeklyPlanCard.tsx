"use client";

import { useState, useRef, useEffect } from "react";
import {
  CalendarDays, Sparkles, Loader2, Send, RotateCcw,
  MessageCircle, ChevronDown, ChevronUp,
  Moon, Wind, Timer, Repeat, Zap, Trophy, FlaskConical, Dumbbell,
} from "lucide-react";
import type { WeeklyPlanData, WeeklyPlanDay, PlanChatMessage } from "@/types";
import { WorkoutStepsView } from "@/components/coach/WorkoutStepsView";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrentMondayStr(): string {
  const now = new Date();
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysSinceMonday);
  return monday.toISOString().slice(0, 10);
}

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

// ─── Type → visual style map ─────────────────────────────────────────────────

interface TypeStyle {
  bg: string; border: string; text: string; dot: string; icon: React.ReactNode;
}

const TYPE_STYLES: Record<string, TypeStyle> = {
  rest:      { bg: "bg-surface-700/40",  border: "border-surface-600/60",   text: "text-surface-400",  dot: "bg-surface-500",  icon: <Moon         className="w-3.5 h-3.5" /> },
  easy:      { bg: "bg-green-500/10",    border: "border-green-500/30",     text: "text-green-400",    dot: "bg-green-500",    icon: <Wind         className="w-3.5 h-3.5" /> },
  recovery:  { bg: "bg-cyan-500/10",     border: "border-cyan-500/30",      text: "text-cyan-400",     dot: "bg-cyan-500",     icon: <Wind         className="w-3.5 h-3.5" /> },
  tempo:     { bg: "bg-yellow-500/10",   border: "border-yellow-500/30",    text: "text-yellow-400",   dot: "bg-yellow-500",   icon: <Timer        className="w-3.5 h-3.5" /> },
  intervals: { bg: "bg-red-500/10",      border: "border-red-500/30",       text: "text-red-400",      dot: "bg-red-400",      icon: <Repeat       className="w-3.5 h-3.5" /> },
  long_run:  { bg: "bg-purple-500/10",   border: "border-purple-500/30",    text: "text-purple-400",   dot: "bg-purple-500",   icon: <Zap          className="w-3.5 h-3.5" /> },
  test:      { bg: "bg-pink-500/10",     border: "border-pink-500/30",      text: "text-pink-400",     dot: "bg-pink-500",     icon: <FlaskConical className="w-3.5 h-3.5" /> },
  race:      { bg: "bg-brand-500/15",    border: "border-brand-500/40",     text: "text-brand-400",    dot: "bg-brand-500",    icon: <Trophy       className="w-3.5 h-3.5" /> },
  strength:  { bg: "bg-surface-700/50",   border: "border-surface-600/60",   text: "text-surface-300",  dot: "bg-surface-400",  icon: <Dumbbell     className="w-3.5 h-3.5" /> },
};

function typeStyle(type: string): TypeStyle {
  return TYPE_STYLES[type] ?? TYPE_STYLES.easy;
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

  // Only use initialPlan if it's from the current week
  const seedPlan = initialPlan?.week_start === currentMonday ? initialPlan : null;

  const [plan,         setPlan]         = useState<WeeklyPlanData | null>(seedPlan);
  const [reportId,     setReportId]     = useState<string | null>(
    seedPlan ? (initialReportId ?? null) : null
  );
  const [selectedDay,  setSelectedDay]  = useState<WeeklyPlanDay | null>(null);
  const [generating,   setGenerating]   = useState(false);
  const [genError,     setGenError]     = useState<string | null>(null);
  const [showChat,     setShowChat]     = useState(false);
  const [chatMessages, setChatMessages] = useState<PlanChatMessage[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const [chatLoading,  setChatLoading]  = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-select TODAY's day when plan loads (fallback to first training day)
  useEffect(() => {
    if (plan?.days) {
      const DAY_KEYS: WeeklyPlanDay["day"][] = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const todayKey = DAY_KEYS[new Date().getDay()];
      const todayDay = plan.days.find(d => d.day === todayKey);
      const fallback = plan.days.find(d => d.type !== "rest") ?? plan.days[0] ?? null;
      setSelectedDay(todayDay ?? fallback);
    }
  }, [plan]);

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
        body: JSON.stringify({ paces, force }),
      });
      const data = await res.json();
      if (res.ok && data.plan) {
        setPlan(data.plan as WeeklyPlanData);
        setReportId(data.reportId ?? null);
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

  // ── Empty state (no plan for current week) ───────────────────────────────

  if (!plan) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h2 className="font-bold text-surface-100">Plano semanal IA</h2>
            <p className="text-xs text-surface-500">Semana de {currentMonday}</p>
          </div>
        </div>

        {genError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
            <p className="text-sm text-red-400">{genError}</p>
          </div>
        )}

        <div className="text-center py-6 space-y-4">
          <div className="text-surface-500">
            <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nova semana — sem plano gerado ainda</p>
            <p className="text-xs mt-1 text-surface-600">
              3 corridas + 4 musculações · ajuste via chat depois de gerar
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
              <><Sparkles className="w-3.5 h-3.5 inline mr-1.5" />Gerar plano desta semana</>
            )}
          </button>
        </div>
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
          className="flex items-center gap-1 text-[11px] text-surface-600 hover:text-surface-400 transition-colors py-1 px-2 rounded-lg hover:bg-surface-700/50"
        >
          {generating
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RotateCcw className="w-3 h-3" />}
          <span className="hidden sm:inline">Regenerar</span>
        </button>
      </div>

      {/* AI proactive message */}
      {plan.ai_message && (
        <div className="bg-brand-500/8 border border-brand-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
          <p className="text-sm text-surface-300 leading-relaxed">{plan.ai_message}</p>
        </div>
      )}

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-1">
        {plan.days.map((day) => {
          const s          = typeStyle(day.type);
          const isSelected = selectedDay?.day === day.day;
          const isToday    = day.day === todayKey;
          const shortLabel = day.label.length > 7 ? day.label.slice(0, 6) + "…" : day.label;

          return (
            <button
              key={day.day}
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
              <span className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? "text-brand-400" : "text-surface-400"}`}>
                {day.day.slice(0, 2)}
              </span>
              <div className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
              <span className={`text-[9px] font-semibold ${s.text} text-center leading-tight hidden xs:block`}>
                {shortLabel}
              </span>
              {/* On mobile: only show metric if selected, always on sm+ */}
              {day.distance_km != null && (
                <span className={`text-[9px] text-surface-500 font-medium ${isSelected ? "block" : "hidden sm:block"}`}>
                  {day.distance_km}km
                </span>
              )}
              {day.distance_km == null && day.duration_min != null && (
                <span className={`text-[9px] text-surface-500 ${isSelected ? "block" : "hidden sm:block"}`}>
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
            <span className={selStyle.text}>{selStyle.icon}</span>
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
          <p className="text-sm text-surface-300 leading-relaxed">{selectedDay.description}</p>

          {/* Structured steps + watch export (quality sessions) */}
          {selectedDay.structure && selectedDay.structure.blocks.length > 0 && (
            <WorkoutStepsView structure={selectedDay.structure} label={selectedDay.label} />
          )}
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

          <p className="text-[11px] text-surface-600 text-center">
            Peça ajustes — o plano é salvo automaticamente quando mudado
          </p>
        </div>
      )}

      {genError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <p className="text-sm text-red-400">{genError}</p>
        </div>
      )}
    </div>
  );
}
