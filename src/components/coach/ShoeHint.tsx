"use client";

import { useEffect, useState } from "react";
import { Footprints } from "lucide-react";
import { suggestShoe, SHOE_META, type Shoe, type Wear } from "@/lib/shoes";
import type { WeeklyPlanDay } from "@/types";

type ShoeWithWear = Shoe & { wear: Wear };

/**
 * "Tênis: Novablast 5" under the session, with the reason.
 *
 * Shown only when the athlete has registered shoes. An empty rack means the app
 * has nothing to say, and inviting someone to configure something in the middle
 * of reading their Wednesday session is an interruption, not a feature — the
 * invitation lives in the shoe card instead.
 */
export function ShoeHint({ day, compact = false }: { day: WeeklyPlanDay; compact?: boolean }) {
  const [shoes, setShoes] = useState<ShoeWithWear[]>([]);
  const [daysToRace, setDaysToRace] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shoes")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return;
        setShoes((d.shoes ?? []) as ShoeWithWear[]);
        setDaysToRace(typeof d.daysToRace === "number" ? d.daysToRace : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (shoes.length === 0) return null;

  const suggestion = suggestShoe(day, shoes, [], { daysToRace });
  if (!suggestion) return null;

  // Mileage already came from the server with the shoe; recomputing it here from
  // an empty run list would report zero for every pair.
  const wear = shoes.find(s => s.id === suggestion.shoe.id)?.wear;

  /*
    Dentro do card do treino, o tênis é uma linha, não um quadro.

    A caixa com o porquê competia com a descrição da sessão: dois parágrafos
    permanentes para "calce o Novablast". O motivo continua acessível ao passar
    o mouse, e o aviso de desgaste — que é o que realmente muda uma decisão —
    continua visível.
  */
  if (compact) {
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-surface-400" title={suggestion.reason}>
        <Footprints className="h-3.5 w-3.5 shrink-0 text-brand-400" />
        <span className="font-medium text-surface-300">{suggestion.shoe.name}</span>
        <span className="text-surface-500">· {SHOE_META[suggestion.shoe.category].label}</span>
        {wear && wear.status === "trocar" && <span className="text-red-400">· {wear.note}</span>}
        {wear && wear.status === "atencao" && <span className="text-yellow-400">· {wear.note}</span>}
      </p>
    );
  }

  return (
    <div className="rounded-xl bg-surface-700/30 p-3 space-y-1">
      <p className="text-xs text-surface-200 flex items-center gap-1.5">
        <Footprints className="w-3.5 h-3.5 text-brand-400 shrink-0" />
        <span className="font-semibold">{suggestion.shoe.name}</span>
        <span className="text-surface-500">· {SHOE_META[suggestion.shoe.category].label}</span>
      </p>
      <p className="text-[11px] text-surface-500 leading-relaxed">{suggestion.reason}</p>
      {wear && wear.status === "trocar" && (
        <p className="text-[11px] text-red-400 leading-relaxed">{wear.note}</p>
      )}
      {wear && wear.status === "atencao" && (
        <p className="text-[11px] text-yellow-400 leading-relaxed">{wear.note}</p>
      )}
    </div>
  );
}
