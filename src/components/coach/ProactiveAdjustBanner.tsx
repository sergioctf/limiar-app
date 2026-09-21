"use client";

/**
 * "Perdi treinos esta semana — e agora?"
 *
 * Até 21/09 este botão mandava a semana inteira para um modelo de linguagem,
 * que devolvia os dias de hoje em diante reescritos, e o app salvava direto
 * (dívida A2). Três problemas, em ordem de gravidade:
 *
 *   1. Violava a ADR-02 — quem prescreve treino é o motor, não a IA.
 *   2. Os dias reescritos perdiam a `structure` (as séries, com intensidade e
 *      faixa de FC) e a musculação do dia. O plano voltava mais pobre do que
 *      saiu, sem ninguém perceber.
 *   3. Salvava sem confirmação. A ADR-05 diz o contrário: propõe, o atleta
 *      confirma.
 *
 * Agora a mesma pergunta é respondida pelo `fitWeek`, o motor determinístico
 * que já reorganiza a semana quando o atleta declara a agenda — só que aqui a
 * "agenda" são os dias que sobraram. Ele protege longão → treino forte →
 * rodagem, nunca empilha dois dias fortes, move a sessão inteira (estrutura,
 * ritmo e adaptação junto) e **não tenta repor os quilômetros perdidos**.
 *
 * E quando não há o que mexer, ele diz isso — que costuma ser a resposta certa
 * depois de um treino perdido, e a única que a versão anterior não sabia dar.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, CheckCircle2, Loader2 } from "lucide-react";
import { remainingDays } from "@/lib/week-fit";
import { dayKeyOf } from "@/lib/session-swap";
import { localDateStr, localMondayStr } from "@/lib/week";
import type { WeekAdherence } from "@/lib/plan-adherence";

interface Proposal {
  explanation: string[];
  unchanged: boolean;
  beforeKm: number;
  afterKm: number;
}

export function ProactiveAdjustBanner({ currentWeek }: { currentWeek: WeekAdherence }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "preview" | "done" | "error">("idle");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const deviations = currentWeek.missedCount + currentWeek.partialCount;
  if (deviations === 0 && state === "idle") return null;

  async function run(action: "preview" | "confirm") {
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/coach/week-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          week: localMondayStr(),
          days: remainingDays(dayKeyOf(localDateStr())),
          // Os dias que sobraram não são a agenda dele — ver a rota.
          remember: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível reorganizar a semana.");

      if (action === "preview") {
        setProposal(data.proposal ?? null);
        setState("preview");
      } else {
        setState("done");
        router.refresh();
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao reorganizar a semana");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="card border-green-500/25 bg-green-500/5 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
          <div>
            <p className="mb-1 text-sm font-semibold text-surface-100">Semana reorganizada</p>
            <p className="text-xs leading-relaxed text-surface-300">
              O que sobrou da semana foi redistribuído nos dias que restam. Dá para desfazer em
              &quot;Minha agenda desta semana&quot;.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card border-yellow-500/25 bg-yellow-500/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-sm font-semibold text-surface-100">
            {currentWeek.missedCount > 0
              ? `${currentWeek.missedCount} treino${currentWeek.missedCount > 1 ? "s" : ""} perdido${currentWeek.missedCount > 1 ? "s" : ""} esta semana`
              : "Treinos parciais esta semana"}
          </p>
          <p className="mt-0.5 text-xs text-surface-400">
            Dá para reorganizar o que sobrou nos dias que restam — sem tentar repor o que passou.
          </p>
          {state === "error" && message && <p className="mt-1 text-xs text-red-400">{message}</p>}
        </div>
        {state !== "preview" && (
          <button onClick={() => void run("preview")} disabled={state === "loading"} className="btn-secondary shrink-0">
            {state === "loading"
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</>
              : <><CalendarRange className="h-4 w-4" /> Ver o que muda</>}
          </button>
        )}
      </div>

      {/* A proposta, antes de qualquer alteração — a ADR-05 em uma tela. */}
      {state === "preview" && proposal && (
        <div className="mt-3 space-y-3 border-t border-yellow-500/20 pt-3">
          {proposal.unchanged ? (
            <p className="text-xs leading-relaxed text-surface-300">
              Não há o que reorganizar: o que resta da semana já está no melhor lugar possível.
              Repor os treinos perdidos empilharia dias fortes, e isso cobra mais do que rende.
            </p>
          ) : (
            <ul className="space-y-1">
              {proposal.explanation.map((line, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-surface-300">
                  <span className="text-surface-600">·</span>{line}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            {!proposal.unchanged && (
              <button onClick={() => void run("confirm")} className="btn-primary flex-1">Aplicar</button>
            )}
            <button
              onClick={() => { setState("idle"); setProposal(null); }}
              className="btn-ghost flex-1"
            >
              {proposal.unchanged ? "Entendi" : "Agora não"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
