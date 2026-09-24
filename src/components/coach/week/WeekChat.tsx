"use client";

/**
 * Conversar sobre a semana — que **propõe** e espera confirmação.
 *
 * Até 24/09 a mudança já estava salva quando o atleta lia sobre ela. O modelo
 * nunca escreveu o plano (ele escolhe de um vocabulário fixo, em
 * `plan-edit.ts`, e o motor aplica), mas descobrir a mudança depois de feita é
 * o oposto do que a ADR-05 pede.
 */
import { forwardRef } from "react";
import { ChevronDown, ChevronUp, Loader2, MessageCircle, Send } from "lucide-react";
import type { PlanChatMessage } from "@/types";

export interface PendingProposal {
  edits: unknown[];
  changes: string[];
}

export const WeekChat = forwardRef<HTMLInputElement, {
  open: boolean;
  onToggle: () => void;
  messages: PlanChatMessage[];
  loading: boolean;
  input: string;
  onInput: (value: string) => void;
  onSend: () => void;
  pending: PendingProposal | null;
  onApply: () => void;
  onDismiss: () => void;
  endRef: React.RefObject<HTMLDivElement>;
}>(function WeekChat({
  open, onToggle, messages, loading, input, onInput, onSend, pending, onApply, onDismiss, endRef,
}, inputRef) {
  return (
    <div className="space-y-3">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-xl bg-surface-700/50 px-4 py-3 text-sm transition-colors hover:bg-surface-700"
      >
        <span className="flex items-center gap-2 text-surface-400 transition-colors hover:text-surface-200">
          <MessageCircle className="h-4 w-4" />
          <span>Conversar sobre esta semana</span>
          {messages.length > 0 && (
            <span className="rounded-full bg-brand-500/20 px-1.5 py-0.5 text-xs font-medium text-brand-400">
              {messages.length}
            </span>
          )}
        </span>
        {open
          ? <ChevronUp className="h-4 w-4 text-surface-500" />
          : <ChevronDown className="h-4 w-4 text-surface-500" />}
      </button>

      {open && (
        <div className="space-y-3">
          {messages.length > 0 && (
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {messages.map((msg, i) => (
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

              {loading && (
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
              <div ref={endRef} />
            </div>
          )}

          {/* A proposta, antes de qualquer alteração. */}
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
                <button onClick={onApply} disabled={loading} className="btn-primary flex-1 py-1.5 text-xs">
                  {loading ? "Aplicando…" : "Aplicar"}
                </button>
                <button onClick={onDismiss} disabled={loading} className="btn-ghost flex-1 py-1.5 text-xs">
                  Agora não
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              ref={inputRef}
              value={input}
              onChange={e => onInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
              }}
              placeholder="Ex: na quinta não vou conseguir correr 8 km"
              className="flex-1 rounded-xl border border-surface-600 bg-surface-700 px-3.5 py-2.5 text-sm text-surface-200 transition-colors placeholder:text-surface-500 focus:border-brand-500 focus:outline-none"
              disabled={loading}
            />
            <button
              onClick={onSend}
              disabled={!input.trim() || loading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin text-white" />
                : <Send className="h-4 w-4 text-white" />}
            </button>
          </div>

          <p className="text-center text-[11px] text-surface-500">
            Peça um ajuste e o treinador propõe — nada muda até você tocar em Aplicar
          </p>
        </div>
      )}
    </div>
  );
});
