"use client";

/**
 * A IA central — "um especialista pessoal, não um chatbot genérico" (Sérgio, 20/09).
 *
 * Duas formas de perguntar, e a diferença entre elas é o que dá a sensação de
 * especialista:
 *
 *   · As sugestões respondem **na hora**, sem rede e sem modelo. A resposta é
 *     calculada no navegador a partir do mesmo dossiê que o servidor montou ao
 *     abrir a tela (`answerSuggestion`), e depois gravada no servidor, que a
 *     recalcula em vez de confiar no texto que passou pela rede.
 *   · A pergunta aberta vai ao modelo, que responde **sobre o mesmo dossiê** —
 *     e só sobre ele.
 *
 * A conversa é uma linha do tempo só, agrupada por dia, porque foi assim que
 * ficou combinado guardá-la: com data, para dar continuidade e para poder ser
 * relida depois.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles, Trash2 } from "lucide-react";
import { answerSuggestion, longDate, type AthleteBrief, type Suggestion } from "@/lib/ai-brief";

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** O dia do atleta, que é como a conversa se organiza. */
  date: string;
  pending?: boolean;
}

export function AiContent({
  brief, suggestions, history, firstName, autoAsk = null,
}: {
  brief: AthleteBrief;
  suggestions: Suggestion[];
  history: AiMessage[];
  firstName: string | null;
  /** Uma leitura para responder ao abrir — quando a tela foi aberta por um aviso. */
  autoAsk?: string | null;
}) {
  const [messages, setMessages] = useState<AiMessage[]>(history);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Uma conversa rola para a última coisa dita, não para o começo do histórico.
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, thinking]);

  /*
   * Chegou por um aviso ("Como foi a semana passada…"): a resposta já aparece,
   * sem o atleta precisar achar a pergunta de novo. Uma vez só — o parâmetro sai
   * da URL, para um recarregar da página não perguntar tudo outra vez.
   */
  const asked = useRef(false);
  useEffect(() => {
    if (!autoAsk || asked.current) return;
    asked.current = true;
    const s = suggestions.find(x => x.id === autoAsk);
    if (s) askSuggestion(s);
    window.history.replaceState(null, "", "/ia");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAsk]);

  const add = (m: Omit<AiMessage, "id">) =>
    setMessages(prev => [...prev, { ...m, id: `${Date.now()}-${prev.length}` }]);

  function askSuggestion(s: Suggestion) {
    const answered = answerSuggestion(brief, s);
    if (!answered) return;
    setError(null);
    add({ role: "user", content: s.question, date: brief.date });
    add({ role: "assistant", content: answered.content, date: brief.date });
    // Gravar é do servidor, que recalcula a resposta. Falhar aqui não pode
    // apagar da tela o que o atleta acabou de ler.
    fetch("/api/ia/mensagens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionId: s.id }),
    }).catch(() => {});
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || thinking) return;
    setError(null);
    setQuestion("");
    add({ role: "user", content: q, date: brief.date });
    setThinking(true);
    try {
      const res = await fetch("/api/ia/perguntar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok || !data.answer) {
        setError(data.error ?? "Não consegui responder agora.");
      } else {
        add({ role: "assistant", content: data.answer, date: brief.date });
      }
    } catch {
      setError("Sem conexão com o treinador agora.");
    } finally {
      setThinking(false);
    }
  }

  async function clearAll() {
    if (!confirm("Apagar toda a conversa com a IA? Isso não pode ser desfeito.")) return;
    const res = await fetch("/api/ia/mensagens", { method: "DELETE" });
    if (res.ok) setMessages([]);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 pb-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-surface-100">
            <Sparkles className="h-5 w-5 text-brand-400" /> Seu treinador
          </h1>
          <p className="mt-0.5 text-xs text-surface-500">
            Ele enxerga seus treinos, sua recuperação, sua carga e suas provas — e responde só com o que tem.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 rounded-xl p-2 text-surface-500 hover:text-surface-300"
            aria-label="Apagar conversa"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      {messages.length === 0 ? (
        <div className="rounded-2xl border border-surface-700 bg-surface-800 p-5">
          <p className="text-lg font-semibold text-surface-100">
            {firstName ? `${firstName}, o que você quer saber?` : "O que você quer saber?"}
          </p>
          <p className="mt-1 text-sm text-surface-400">
            Pergunte do seu jeito, ou toque em uma das leituras abaixo.
          </p>
        </div>
      ) : (
        <Thread messages={messages} thinking={thinking} />
      )}

      <div ref={endRef} />

      {error && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200/90">{error}</p>
      )}

      {/* As leituras prontas. Respondem sem custo e sem espera. */}
      {suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wider text-surface-500">Leituras rápidas</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => askSuggestion(s)}
                className="min-h-[40px] rounded-full border border-surface-700 bg-surface-800 px-3.5 text-sm
                           text-surface-200 transition-colors hover:border-brand-500/50 hover:text-surface-100 active:scale-95"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* O campo aberto. */}
      <form
        onSubmit={e => { e.preventDefault(); ask(question); }}
        className="sticky bottom-0 flex items-end gap-2 bg-surface-900/80 pt-2 backdrop-blur"
      >
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); }
          }}
          rows={1}
          placeholder="Pergunte qualquer coisa sobre seu treino"
          className="min-h-[48px] max-h-40 flex-1 resize-none rounded-2xl border border-surface-700 bg-surface-800
                     px-4 py-3 text-sm text-surface-100 placeholder:text-surface-500
                     focus:border-brand-500/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!question.trim() || thinking}
          aria-label="Perguntar"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white
                     transition-transform hover:bg-brand-400 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}

/** A conversa, com um cabeçalho por dia. */
function Thread({ messages, thinking }: { messages: AiMessage[]; thinking: boolean }) {
  const today = messages[messages.length - 1]?.date;
  let lastDate: string | null = null;

  return (
    <div className="space-y-3">
      {messages.map(m => {
        const header = m.date !== lastDate ? m.date : null;
        lastDate = m.date;
        return (
          <div key={m.id} className="space-y-3">
            {header && (
              <p className="pt-1 text-center text-[11px] uppercase tracking-wider text-surface-600">
                {header === today ? "Hoje" : longDate(header)}
              </p>
            )}
            <Bubble message={m} />
          </div>
        );
      })}
      {thinking && (
        <div className="flex items-center gap-2 text-sm text-surface-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-400" />
          Lendo seus dados…
        </div>
      )}
    </div>
  );
}

function Bubble({ message }: { message: AiMessage }) {
  if (message.role === "user") {
    return (
      <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand-500/15 px-4 py-2.5 text-sm text-surface-100">
        {message.content}
      </p>
    );
  }
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-surface-700 bg-surface-800 px-4 py-3">
      <Answer content={message.content} />
    </div>
  );
}

/**
 * A resposta na tela.
 *
 * As leituras vêm com uma frase em negrito e uma lista de fatos; a resposta
 * aberta vem em parágrafos. O mesmo componente dá conta das duas sem precisar
 * de um renderizador de markdown inteiro.
 */
function Answer({ content }: { content: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-surface-200">
      {content.split("\n").filter(l => l.trim()).map((line, i) => {
        const bold = line.match(/^\*\*(.+)\*\*$/);
        if (bold) return <p key={i} className="font-semibold text-surface-100">{bold[1]}</p>;
        if (line.startsWith("- ")) {
          return (
            <p key={i} className="flex gap-2 text-surface-300">
              <span className="text-surface-600">·</span>
              <span>{line.slice(2)}</span>
            </p>
          );
        }
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}
