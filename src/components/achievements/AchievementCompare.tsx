"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Crown, Loader2, ArrowLeft, Target, Sparkles } from "lucide-react";
import { getAllAchievements } from "@/lib/achievements";
import {
  compareAchievements, holdersSummary, displayName,
  type AthleteBadges, type AchievementComparison,
} from "@/lib/achievement-compare";

/**
 * Achievements, side by side.
 *
 * The badge grid on the dashboard answers "what have I got?". This answers the
 * question that makes badges worth collecting: what has somebody else got that
 * I haven't. The gaps come first for that reason — a list that opens with what
 * you already own is a trophy cabinet, not a comparison.
 */
export function AchievementCompare() {
  const [group, setGroup] = useState<AthleteBadges[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  /*
    Falhar calado era pior do que falhar.

    Qualquer erro da rota virava uma lista vazia, e a tela mostrava a comparação
    "só você" — indistinguível de quem não tem amigos. Quem clicou em
    "Comparar com amigos" e caiu numa tela sem amigo nenhum conclui, com razão,
    que o botão não funciona (Sérgio, 01/10).
  */
  useEffect(() => {
    let cancelled = false;
    setFalhou(false);
    fetch("/api/friends/achievements", { cache: "no-store" })
      .then(async r => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(d => { if (!cancelled) setGroup((d?.group ?? []) as AthleteBadges[]); })
      .catch(() => { if (!cancelled) { setFalhou(true); setGroup([]); } });
    return () => { cancelled = true; };
  }, [tentativa]);

  if (falhou) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <p className="text-sm text-surface-300">Não consegui carregar as conquistas do grupo.</p>
        <button
          type="button"
          onClick={() => { setGroup(null); setTentativa(n => n + 1); }}
          className="btn-primary mx-auto min-h-[48px]"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="card p-6 flex items-center gap-2 text-surface-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando conquistas…
      </div>
    );
  }

  const cmp = compareAchievements(getAllAchievements(), group);
  const me  = cmp.standings.find(s => s.isMe);
  const soloed = group.length <= 1;

  return (
    <div className="space-y-5 max-w-3xl mx-auto animate-fade-in">
      <Link href="/friends" className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-300 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Amigos
      </Link>

      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-surface-100">Conquistas</h1>
            <p className="text-xs text-surface-500">
              {me ? `Você tem ${me.count} de ${cmp.total}` : `${cmp.total} conquistas`}
              {!soloed && ` · comparando com ${group.length - 1} amigo${group.length > 2 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {soloed && (
          <p className="text-[11px] text-surface-500 leading-relaxed mt-3">
            Adicione amigos para comparar. Conquista sem ninguém para comparar é
            só uma caixinha marcada.
          </p>
        )}
      </div>

      {!soloed && <Standings cmp={cmp} />}
      {!soloed && cmp.missing.length > 0 && <Missing cmp={cmp} />}
      {!soloed && cmp.onlyMine.length > 0 && <OnlyMine cmp={cmp} />}

      <AllBadges cmp={cmp} groupSize={group.length} />
    </div>
  );
}

function Standings({ cmp }: { cmp: AchievementComparison }) {
  return (
    <div className="card p-4 space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-1">
        Quem tem mais
      </p>
      {cmp.standings.map(s => (
        <div
          key={s.userId}
          className={`flex items-center gap-3 rounded-xl p-2.5 ${
            s.isMe ? "bg-brand-500/10 border border-brand-500/20" : "bg-surface-700/30"
          }`}
        >
          <span className="w-6 text-center shrink-0">
            {s.place === 1
              ? <Crown className="w-4 h-4 text-yellow-400 mx-auto" />
              : <span className="text-sm font-bold text-surface-500">{s.place}</span>}
          </span>
          <span className="flex-1 min-w-0 text-sm font-semibold text-surface-200 truncate">
            {displayName(s)} {s.isMe && <span className="text-[10px] text-brand-400">(você)</span>}
          </span>
          <span className="font-mono font-bold text-sm text-surface-100 shrink-0 tabular-nums">
            {s.count}<span className="text-surface-500 font-normal">/{s.total}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Missing({ cmp }: { cmp: AchievementComparison }) {
  return (
    <div className="card p-4 space-y-2 border-yellow-500/20 bg-yellow-500/[0.04]">
      <div className="flex items-center gap-1.5">
        <Target className="w-3.5 h-3.5 text-yellow-400" />
        <p className="text-xs font-semibold uppercase tracking-wide text-yellow-400">
          Seus amigos têm, você não
        </p>
      </div>
      {cmp.missing.map(r => (
        <div key={r.achievement.id} className="flex items-start gap-2.5">
          <span className="text-lg leading-none shrink-0 grayscale opacity-60" aria-hidden>
            {r.achievement.icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm text-surface-200 font-medium">{r.achievement.label}</p>
            <p className="text-[11px] text-surface-500 leading-relaxed">
              {r.achievement.description} · {r.holders.map(h => displayName(h)).join(", ")}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function OnlyMine({ cmp }: { cmp: AchievementComparison }) {
  return (
    <div className="card p-4 space-y-2 border-green-500/20 bg-green-500/[0.04]">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-green-400" />
        <p className="text-xs font-semibold uppercase tracking-wide text-green-400">
          Só você tem
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {cmp.onlyMine.map(r => (
          <span key={r.achievement.id} className="flex items-center gap-1.5 bg-surface-700/40 rounded-lg px-2.5 py-1.5">
            <span aria-hidden>{r.achievement.icon}</span>
            <span className="text-xs text-surface-200">{r.achievement.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function AllBadges({ cmp, groupSize }: { cmp: AchievementComparison; groupSize: number }) {
  return (
    <div className="card p-4 space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold mb-2">
        Todas as conquistas · da mais rara para a mais comum
      </p>
      {cmp.rows.map(r => (
        <div
          key={r.achievement.id}
          className={`flex items-center gap-3 rounded-xl p-2.5 ${
            r.iHaveIt ? "bg-surface-700/30" : "opacity-60"
          }`}
        >
          <span className={`text-xl leading-none shrink-0 ${r.iHaveIt ? "" : "grayscale"}`} aria-hidden>
            {r.achievement.icon}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-surface-200 font-medium truncate">{r.achievement.label}</p>
            <p className="text-[11px] text-surface-500 truncate">{r.achievement.description}</p>
          </div>
          <span className={`text-[11px] shrink-0 text-right ${
            r.iHaveIt ? "text-brand-400" : "text-surface-500"
          }`}>
            {holdersSummary(r, groupSize)}
          </span>
        </div>
      ))}
    </div>
  );
}
