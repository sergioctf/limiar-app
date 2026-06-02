"use client";

import { useState, useRef, useEffect } from "react";
import {
  CalendarDays, Sparkles, Loader2, Send, RotateCcw,
  MessageCircle, ChevronDown, ChevronUp,
  Moon, Wind, Timer, Repeat, Zap, Trophy, FlaskConical,
} from "lucide-react";
import type { WeeklyPlanData, WeeklyPlanDay, PlanChatMessage } from "@/types";

// ─── Type → visual style map ─────────────────────────────────────────────────

interface TypeStyle {
  bg: string;
  border: string;
  text: string;
  dot: string;
  icon: React.ReactNode;
}

const TYPE_STYLES: Record<string, TypeStyle> = {
  rest:      { bg: "bg-surface-700/40",  border: "border-surface-600/60",   text: "text-surface-400",  dot: "bg-surface-500",  icon: <Moon       className="w-3.5 h-3.5" /> },
  easy:      { bg: "bg-green-500/10",    border: "border-green-500/30",     text: "text-green-400",    dot: "bg-green-500",    icon: <Wind       className="w-3.5 h-3.5" /> },
  recovery:  { bg: "bg-cyan-500/10",     border: "border-cyan-500/30",      text: "text-cyan-400",     dot: "bg-cyan-500",     icon: <Wind       className="w-3.5 h-3.5" /> },
  tempo:     { bg: "bg-yellow-500/10",   border: "border-yellow-500/30",    text: "text-yellow-400",   dot: "bg-yellow-500",   icon: <Timer      className="w-3.5 h-3.5" /> },
  intervals: { bg: "bg-red-500/10",      border: "border-red-500/30",       text: "text-red-400",      dot: "bg-red-400",      icon: <Repeat     className="w-3.5 h-3.5" /> },
  long_run:  { bg: "bg-purple-500/10",   border: "border-purple-500/30",    text: "text-purple-400",   dot: "bg-purple-500",   icon: <Zap        className="w-3.5 h-3.5" /> },
  test:      { bg: "bg-pink-500/10",     border: "border-pink-500/30",      text: "text-pink-400",     dot: "bg-pink-500",     icon: <FlaskConical className="w-3.5 h-3.5" /> },
  race:      { bg: "bg-brand-500/15",    border: "border-brand-500/40",     text: "text-brand-400",    dot: "bg-brand-500",    icon: <Trophy     className="w-3.5 h-3.5" /> },
};

function typeStyle(type: string): TypeStyle {
  return TYPE_STYLES[type] ?? TYPE_STYLES.easy;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialPlan: WeeklyPlanData | null;
  paces?:      { easy?: string; threshold?: string; long?: string; interval?: string } | null;
  onPlanSaved?: (plan: WeeklyPlanData) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WeeklyPlanCard({ initialPlan, paces, onPlanSaved }: Props) {
  const [plan,         setPlan]         = useState<WeeklyPlanData | null>(initialPlan);
  const [selectedDay,  setSelectedDay]  = useState<WeeklyPlanDay | null>(null);
  const [generating,   setGenerating]   = useState(false);
  const [genError,     setGenError]     = useState<string | null>(null);
  const [showChat,     setShowChat]     = useState(false);
  const [chatMessages, setChatMessages] = useState<PlanChatMessage[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const [chatLoading,  setChatLoading]  = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-select first training day when plan loads
  useEffect(() => {
    if (plan?.days) {
      const first = plan.days.find(d => d.type !== "rest") ?? plan.days[0] ?? null;
      setSelectedDay(first);
    }
  }, [plan]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      const res  = await fetch("/api/coach/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paces }),
      });
      const data = await res.json();
      if (res.ok && data.plan) {
        setPlan(data.plan as WeeklyPlanData);
        setChatMessages([]);
        onPlanSaved?.(data.plan as WeeklyPlanData);
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
      role:      "user",
      content:   msg,
      timestamp: new Date().toISOString(),
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
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setChatMessages(prev => [
          ...prev,
          {
            role:      "assistant" as const,
            content:   data.assistantMessage as string,
            timestamp: new Date().toISOString(),
          },
        ]);
        if (data.updatedPlan) {
          setPlan(data.updatedPlan as WeeklyPlanData);
        }
      } else {
        setChatMessages(prev => [
          ...prev,
          { role: "assistant" as const, content: data.error ?? "Erro ao processar.", timestamp: new Date().toISOString() },
        ]);
      }
    } catch {
      setChatMessages(prev => [
        ...prev,
        { role: "assistant" as const, content: "Erro de conexão. Tente novamente.", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  // ── Empty state ──────────────────────────────────────────────────────────

  if (!plan) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h2 className="font-bold text-surface-100">Plano semanal IA</h2>
              <p className="text-xs text-surface-500">7 dias personalizados + ajustes via chat</p>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary text-xs py-1.5 px-3 shrink-0"
          >
            {generating ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />Gerando…</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5 inline mr-1.5" />Gerar plano</>
            )}
          </button>
        </div>

        {genError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-3">
            <p className="text-sm text-red-400">{genError}</p>
          </div>
        )}

        <div className="text-center py-8 text-surface-500">
          <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Plano 7 dias com tipo, ritmo e descrição de cada treino</p>
          <p className="text-xs mt-1 text-surface-600">
            Ajuste conversando: &quot;muda o longão pro domingo&quot;, &quot;adiciona tiro na quarta&quot;…
          </p>
        </div>
      </div>
    );
  }

  // ── Plan loaded ──────────────────────────────────────────────────────────

  const selStyle = selectedDay ? typeStyle(selectedDay.type) : null;

  return (
    <div className="card p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h2 className="font-bold text-surface-100">Plano semanal IA</h2>
            <p className="text-xs text-surface-500">Semana de {plan.week_start}</p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          title="Regenerar plano"
          className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-200 transition-colors py-1.5 px-2.5 rounded-lg hover:bg-surface-700"
        >
          {generating
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RotateCcw className="w-3.5 h-3.5" />}
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
      <div className="grid grid-cols-7 gap-1.5">
        {plan.days.map((day) => {
          const s         = typeStyle(day.type);
          const isSelected = selectedDay?.day === day.day;
          const shortLabel = day.label.length > 9
            ? day.label.slice(0, 8) + "…"
            : day.label;

          return (
            <button
              key={day.day}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className={[
                "flex flex-col items-center gap-1 py-3 px-1 rounded-xl border transition-all duration-150",
                s.bg, s.border,
                isSelected
                  ? "ring-2 ring-brand-400/50 scale-[1.05] shadow-lg shadow-brand-500/10"
                  : "hover:scale-[1.02]",
              ].join(" ")}
            >
              <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wide">
                {day.day.slice(0, 2)}
              </span>
              <div className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className={`text-[9px] font-semibold ${s.text} text-center leading-tight`}>
                {shortLabel}
              </span>
              {day.distance_km != null && (
                <span className="text-[9px] text-surface-500 font-medium">
                  {day.distance_km}km
                </span>
              )}
              {!day.distance_km && day.duration_min != null && (
                <span className="text-[9px] text-surface-500">
                  {day.duration_min}min
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
              {selectedDay.distance_km != null && (
                <span>{selectedDay.distance_km} km</span>
              )}
              {selectedDay.duration_min != null && (
                <span>{selectedDay.duration_min} min</span>
              )}
            </div>
          </div>

          {selectedDay.pace && (
            <p className="text-xs text-surface-400">
              <span className="text-surface-500">Ritmo: </span>
              <span className="font-medium">{selectedDay.pace}</span>
            </p>
          )}

          <p className="text-sm text-surface-300 leading-relaxed">
            {selectedDay.description}
          </p>
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
          ? <ChevronUp   className="w-4 h-4 text-surface-500" />
          : <ChevronDown className="w-4 h-4 text-surface-500" />}
      </button>

      {/* Chat interface */}
      {showChat && (
        <div className="space-y-3">

          {/* Message history */}
          {chatMessages.length > 0 && (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={[
                      "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-brand-500/20 text-surface-100 rounded-br-sm"
                        : "bg-surface-700 text-surface-300 rounded-bl-sm",
                    ].join(" ")}
                  >
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
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ex: muda o longão pro domingo, adiciona tiro na quarta…"
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
            Peça ajustes no plano ou tire dúvidas sobre os treinos
          </p>
        </div>
      )}

      {/* Generation error */}
      {genError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <p className="text-sm text-red-400">{genError}</p>
        </div>
      )}
    </div>
  );
}
