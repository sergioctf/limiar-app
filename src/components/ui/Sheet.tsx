"use client";

/**
 * O painel de baixo — um só, para toda decisão que mexe no treino.
 *
 * Mover de dia, adaptar a sessão, reorganizar a semana e marcar o teste são a
 * mesma classe de ação: o atleta escolhe uma coisa e o plano muda. Até 01/10
 * cada uma tinha a sua forma — uma abria um bloco dentro do card com sete
 * botões estreitos, outra uma folha de baixo, outra um painel com borda — e os
 * botões de confirmar ficavam em lugares diferentes em cada uma. No celular,
 * isso é a pessoa reaprendendo a interface a cada toque.
 *
 * O contrato, que é o que este componente garante:
 *
 *   1. **Título com o escopo.** "Mover a corrida de sábado" diz o que vai
 *      mudar; "Mover" não diz.
 *   2. **Opções confortáveis para o dedo** — quem usa isto está de pé, na rua
 *      ou na academia. Mínimo de 48 px, não 38.
 *   3. **A consequência antes da confirmação.** O que acontece com a semana se
 *      você tocar em confirmar.
 *   4. **Confirmar e cancelar em posição previsível**, sempre no pé, sempre na
 *      mesma ordem, com o mesmo tratamento de erro e de carregamento.
 *
 * Fecha no toque fora, no X e no Esc. No celular nasce de baixo e respeita a
 * área segura do iPhone; no computador, centraliza.
 */
import { useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";

export function Sheet({
  title, scope, onClose, children, footer, busy = false, error = null,
}: {
  title: string;
  /** Uma linha dizendo o que isto afeta. Aparece sob o título. */
  scope?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Os botões do pé. Use `SheetActions` para manter a ordem. */
  footer?: React.ReactNode;
  busy?: boolean;
  error?: string | null;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl border border-surface-700 bg-surface-900 outline-none animate-slide-up sm:rounded-3xl"
      >
        <div className="space-y-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight text-surface-100">{title}</h2>
              {scope && <p className="mt-0.5 text-sm text-surface-400">{scope}</p>}
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-surface-500 transition-colors hover:bg-surface-800 hover:text-surface-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {children}

          {/* Erro e carregamento no mesmo lugar, sempre acima dos botões. */}
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          {busy && (
            <p className="flex items-center gap-1.5 text-sm text-surface-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…
            </p>
          )}

          {footer}
        </div>
      </div>
    </div>
  );
}

/**
 * Os botões do pé, na ordem de sempre: cancelar à esquerda, confirmar à
 * direita e maior — a mão direita no celular alcança a direita primeiro, e o
 * destrutivo nunca deve ser o que está debaixo do polegar.
 */
export function SheetActions({
  confirmLabel, onConfirm, onCancel, disabled = false, busy = false, cancelLabel = "Cancelar",
}: {
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  busy?: boolean;
  cancelLabel?: string;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="btn-secondary min-h-[48px] flex-1 disabled:opacity-50"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled || busy}
        className="btn-primary min-h-[48px] flex-[2] justify-center disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
      </button>
    </div>
  );
}

/**
 * Uma opção dentro do painel: alvo grande, rótulo à esquerda, estado à direita.
 *
 * Linha, não quadradinho. Sete botões de 40 px numa grade são sete alvos que a
 * mão erra — e não cabe neles dizer o que cada um significa.
 */
export function SheetOption({
  label, detail, selected, disabled, onClick,
}: {
  label: string;
  detail?: string | null;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        "flex min-h-[52px] w-full items-center gap-3 rounded-xl border px-3.5 text-left transition-colors",
        disabled ? "cursor-not-allowed border-surface-700 opacity-40" : "",
        selected
          ? "border-brand-500/60 bg-brand-500/10"
          : "border-surface-700 hover:border-surface-600 hover:bg-surface-800",
      ].join(" ")}
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${selected ? "text-brand-200" : "text-surface-100"}`}>
          {label}
        </span>
        {detail && <span className="mt-0.5 block text-xs text-surface-500">{detail}</span>}
      </span>
      <span
        aria-hidden
        className={`h-4 w-4 shrink-0 rounded-full border-2 ${
          selected ? "border-brand-400 bg-brand-500" : "border-surface-600"
        }`}
      />
    </button>
  );
}
