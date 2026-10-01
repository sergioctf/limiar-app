"use client";

import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";

/**
 * Replay the app tour.
 *
 * The tour marks itself seen in localStorage and never returns — sensible on
 * day one, unhelpful six months and a dozen features later.
 *
 * Clearing that mark is not enough: the tour also gates on `enabled`, which the
 * dashboard sets only for new accounts, so an existing athlete cleared the flag
 * and still saw nothing. The tour already honours `?tour=1` as an explicit
 * override — using it means the replay path and the first-run path share one
 * implementation instead of two that can drift.
 */
export function TutorialButton() {
  const [going, setGoing] = useState(false);

  function replay() {
    setGoing(true);
    /*
      A chave fica. Ela marca o primeiro acesso como visto, e apagá-la fazia
      a vitrine voltar a ser o fluxo de cadastro na próxima visita — com as
      perguntas de novo, para quem já respondeu. `?tour=1` abre a vitrine
      sozinho (ver OnboardingGate).
    */
    window.location.href = "/?tour=1";
  }

  return (
    <div className="card p-4 flex items-center gap-3">
      <GraduationCap className="w-5 h-5 text-brand-400 shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-surface-100 text-sm">Conheça o app</h3>
        <p className="text-[11px] text-surface-500 mt-0.5">
          Nove telas mostrando o que cada parte faz. Não pede configuração nenhuma.
        </p>
      </div>
      <button
        onClick={replay}
        disabled={going}
        className="btn-secondary shrink-0 disabled:opacity-50"
      >
        {going ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ver de novo"}
      </button>
    </div>
  );
}
