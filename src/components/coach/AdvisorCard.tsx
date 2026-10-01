"use client";

import { useCallback, useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import {
  Sparkles, Lock, FlaskConical, Check, X, ChevronDown, Loader2,
  AlertTriangle, Dumbbell, Footprints, Link2, BedDouble,
} from "lucide-react";

type Area = "integracao" | "forca" | "corrida" | "recuperacao" | "teste";
type Severity = "alta" | "media" | "baixa";

interface Suggestion {
  id: string;
  key: string;
  area: Area;
  severity: Severity;
  title: string;
  evidence: string;
  proposal: string;
  rationale: string;
  actionLabel: string | null;
  patch: unknown;
  stale?: boolean;
}

interface Payload {
  locked: boolean;
  storageReady?: boolean;
  clean?: boolean;
  testStatus?: { state: string; weeksSince: number | null; headline: string; detail: string };
  benefits?: Array<{ title: string; detail: string }>;
  protocol?: string[];
  suggestions: Suggestion[];
}

const AREA_UI: Record<Area, { label: string; icon: React.ReactNode }> = {
  integracao:  { label: "Corrida × força", icon: <Link2 className="w-3 h-3" /> },
  forca:       { label: "Musculação",      icon: <Dumbbell className="w-3 h-3" /> },
  corrida:     { label: "Corrida",         icon: <Footprints className="w-3 h-3" /> },
  recuperacao: { label: "Recuperação",     icon: <BedDouble className="w-3 h-3" /> },
  teste:       { label: "Teste",           icon: <FlaskConical className="w-3 h-3" /> },
};

const SEVERITY_UI: Record<Severity, { ring: string; dot: string; label: string }> = {
  alta:  { ring: "border-red-500/25 bg-red-500/[0.04]",       dot: "bg-red-400",    label: "Vale mexer" },
  media: { ring: "border-yellow-500/20 bg-yellow-500/[0.03]", dot: "bg-yellow-400", label: "Dá para melhorar" },
  baixa: { ring: "border-surface-700 bg-surface-800/40",      dot: "bg-surface-500", label: "Detalhe" },
};

/**
 * The advisor's screen.
 *
 * It only ever proposes. Every card carries what was measured, what we suggest
 * and the rule behind it — so the athlete can disagree with an argument instead
 * of with an oracle. "Manter como está" is a first-class answer.
 */
export function AdvisorCard({ onGoToTests }: { onGoToTests?: () => void }) {
  const [data, setData]       = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<string | null>(null);
  const [open, setOpen]       = useState<string | null>(null);
  /** A lista nasce fechada — o card é um aviso até alguém tocar nele. */
  const [listOpen, setListOpen] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Make sure today's readiness proposal exists before asking for the list.
      //
      // The morning cron normally creates it, but it runs once a day: wellness
      // logged at lunchtime, or a plan generated after it fired, would otherwise
      // wait until tomorrow to be noticed. This endpoint returns immediately
      // when a row is already there, so the extra call costs nothing most days.
      await fetch("/api/coach/suggestion").catch(() => {});

      const res = await fetch("/api/coach/advisor");
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(null);
    } catch {
      setError("Não foi possível carregar as sugestões.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, action: "accept" | "dismiss") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/coach/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "");

      /*
       * The buzz marks the outcome, not the tap. By the time the request
       * returns the athlete is often looking somewhere else, and the card
       * simply vanishing is easy to miss.
       */
      haptic(action === "accept" ? "success" : "tap");
      setData(d => d ? { ...d, suggestions: d.suggestions.filter(s => s.id !== id) } : d);

      // Applying a change rewrites this week's plan — reload so the screen
      // isn't showing the plan the athlete just replaced.
      if (action === "accept" && json?.applied) {
        setTimeout(() => window.location.reload(), 600);
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Não foi possível registrar sua escolha.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="card p-5 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-surface-500" />
        <p className="text-sm text-surface-400">Analisando seu treino…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card p-5">
        <p className="text-sm text-surface-400">{error ?? "Sem dados."}</p>
      </div>
    );
  }

  // ── Locked: no test yet ────────────────────────────────────────────────────
  if (data.locked) return <LockedAdvisor data={data} onGoToTests={onGoToTests} />;

  return (
    <div className="space-y-3">
      {/*
        Fechado por padrão: um aviso, não uma parede.

        O conselheiro ocupava a tela toda semana — "Conselheiro · 2
        observação(ões)", dois parágrafos explicando o que ele faz, e cada
        sugestão com a sua evidência já aberta. Mas sugestão não é o que a
        pessoa veio ver: ela veio ver o treino. "Tem duas coisas aqui" é tudo
        que precisa aparecer sem ninguém pedir (Sérgio, 01/10).

        O cabeçalho também diz o que a lista é, não como ela se chama:
        "Sugestões para sua semana" dispensa os dois parágrafos, e a quantidade
        cabe num selo.
      */}
      <button
        type="button"
        onClick={() => setListOpen(v => !v)}
        aria-expanded={listOpen}
        disabled={data.suggestions.length === 0}
        className="flex min-h-[52px] w-full items-center justify-between gap-2 rounded-2xl border border-surface-700 bg-surface-800/60 px-4 text-left transition-colors enabled:hover:border-surface-600 disabled:cursor-default"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-brand-400" />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-surface-100">Sugestões para sua semana</span>
            <span className="block text-xs text-surface-500">
              {data.suggestions.length === 0
                ? "Nada a ajustar por enquanto"
                : listOpen ? "toque para fechar" : "toque para ver"}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {data.suggestions.length > 0 && (
            <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-xs font-bold tabular-nums text-brand-300">
              {data.suggestions.length}
            </span>
          )}
          {data.suggestions.length > 0 && (
            <ChevronDown className={`h-4 w-4 text-surface-500 transition-transform duration-200 ${listOpen ? "rotate-180" : ""}`} />
          )}
        </span>
      </button>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}

      {data.storageReady === false && (
        <p className="text-[11px] text-yellow-300/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
          Rodando em modo leitura: a tabela <code>advisor_suggestions</code> ainda não existe,
          então as escolhas não ficam salvas.
        </p>
      )}


      {/*
        One suggestion, one line — until the athlete asks for more.

        Each card used to show the area, the severity, the title, the evidence,
        the proposal, a "why" toggle, two buttons and a footnote: about seven
        lines, three times over. An inbox where every item is fully expanded is
        not an inbox, it is a wall, and the most important item looked exactly
        like the least.

        Collapsed keeps what makes somebody care — the title and the fact behind
        it. The proposal and the buttons appear when they are wanted. Only one
        opens at a time, which was already the behaviour and is the whole point.
      */}
      {listOpen && data.suggestions.map(s => {
        const ui = SEVERITY_UI[s.severity] ?? SEVERITY_UI.baixa;
        // Nenhuma abre sozinha: a lista inteira já está atrás de um toque.
        const isOpen = open === s.id;
        const isBusy = busy === s.id;

        return (
          <div key={s.id} className={`rounded-2xl border ${ui.ring} bg-surface-800 overflow-hidden`}>
            <button
              onClick={() => setOpen(isOpen ? "" : s.id)}
              aria-expanded={isOpen}
              className="w-full flex items-start gap-2.5 p-3 text-left min-h-[44px]"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${ui.dot}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-surface-100">{s.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-surface-400">{s.evidence}</span>
                {/*
                  A área e a severidade saíram da linha fechada: eram duas
                  palavras em caixa alta acima do título, disputando com ele a
                  primeira leitura. A cor do ponto já diz a severidade, e o
                  assunto está no próprio título.
                */}
                {!isOpen && (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-400">
                    Ver proposta <ChevronDown className="h-3 w-3" />
                  </span>
                )}
              </span>
              {isOpen && (
                <ChevronDown className="mt-1 h-4 w-4 shrink-0 rotate-180 text-surface-500 transition-transform duration-200" />
              )}
            </button>

            {isOpen && (
              <div className="px-3 pb-3 pl-[26px] space-y-2.5">
                <p className="text-xs text-surface-200 leading-relaxed">{s.proposal}</p>

                <p className="text-[11px] text-surface-400 leading-relaxed pl-3 border-l-2 border-surface-700">
                  {s.rationale}
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => decide(s.id, "accept")}
                    disabled={isBusy}
                    className="btn-primary text-xs min-h-[44px] py-1.5 px-3 disabled:opacity-50"
                  >
                    {isBusy
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Check className="w-3.5 h-3.5" />}
                    {/*
                      A proposal that carries its own label does something when
                      accepted, patch or no patch — the readiness card rewrites
                      today's session without touching any preference. Reading
                      the label off `patch` alone made that button say "Entendi".
                    */}
                    {s.actionLabel ?? (s.patch ? "Aplicar" : "Entendi")}
                  </button>
                  <button
                    onClick={() => decide(s.id, "dismiss")}
                    disabled={isBusy}
                    className="text-xs min-h-[44px] py-1.5 px-3 rounded-lg bg-surface-800 text-surface-400 hover:text-surface-200 border border-surface-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" /> Manter como está
                  </button>
                </div>

                {s.patch != null ? (
                  <p className="text-[10px] text-surface-500">
                    Aplicar muda sua configuração e regenera o plano da semana.
                  </p>
                ) : s.actionLabel ? (
                  <p className="text-[10px] text-surface-500">
                    Muda só o treino de hoje. O resto da semana continua igual.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The locked state. It has to do real work: explain what the test unlocks and
 * how to run it, so the lock reads as "here's what you gain" rather than
 * "you're not allowed".
 */
function LockedAdvisor({ data, onGoToTests }: { data: Payload; onGoToTests?: () => void }) {
  return (
    <div className="card p-5 border border-brand-500/20 bg-brand-500/[0.03] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-brand-400" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-surface-100">Conselheiro bloqueado</h3>
          <p className="text-xs text-surface-400 mt-1 leading-relaxed">
            Ele compara o que você faz com as intensidades que o seu corpo aguenta.
            Sem o teste de 3 km não existe essa referência — ele não saberia dizer se
            um treino seu foi forte ou leve, e daria palpite com cara de diagnóstico.
          </p>
        </div>
      </div>

      {data.benefits && data.benefits.length > 0 && (
        <div>
          <p className="text-[10px] text-surface-500 uppercase tracking-wide mb-2">O que o teste destrava</p>
          <div className="space-y-2">
            {data.benefits.map(b => (
              <div key={b.title} className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
                <p className="text-xs text-surface-300 leading-relaxed">
                  <span className="font-semibold text-surface-200">{b.title}.</span>{" "}
                  <span className="text-surface-400">{b.detail}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.protocol && data.protocol.length > 0 && (
        <div className="bg-surface-800/60 border border-surface-700 rounded-xl p-3">
          <p className="text-[10px] text-surface-500 uppercase tracking-wide mb-2">Como fazer — 15 minutos</p>
          <ol className="space-y-1.5">
            {data.protocol.map((step, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-surface-300 leading-relaxed">
                <span className="font-mono text-surface-500 shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex items-start gap-2 text-[11px] text-surface-500 leading-relaxed">
        <AlertTriangle className="w-3.5 h-3.5 text-surface-500 shrink-0 mt-0.5" />
        <span>
          Enquanto isso o plano continua funcionando: volume, estrutura das sessões e
          periodização não dependem do teste. Só os números de ritmo e FC dependem.
        </span>
      </div>

      {onGoToTests && (
        <button onClick={onGoToTests} className="btn-primary w-full text-sm py-2">
          <FlaskConical className="w-4 h-4" /> Registrar teste de 3 km
        </button>
      )}
    </div>
  );
}
