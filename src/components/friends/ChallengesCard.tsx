"use client";

import { useState } from "react";
import { Swords, Crown, Medal, Flame, Target } from "lucide-react";
import type { FriendStats } from "@/types";

interface Props {
  stats: FriendStats[];
}

type ChallengeKey = "monthDays" | "weekKm" | "weekDays";

interface ChallengeDef {
  key:      ChallengeKey;
  tab:      string;
  title:    string;
  question: string;
  /** Value for a participant. */
  value:    (s: FriendStats) => number;
  format:   (v: number) => string;
  /** Days left in the period. */
  remaining: () => number;
}

const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function daysLeftInWeek(): number {
  const d = new Date().getDay();          // 0 = Sunday
  return d === 0 ? 0 : 7 - d;
}

function daysLeftInMonth(): number {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return last - now.getDate();
}

const CHALLENGES: ChallengeDef[] = [
  {
    key: "monthDays",
    tab: "Mês · dias",
    title: `Desafio de ${MONTHS_PT[new Date().getMonth()]}`,
    question: "Quem treina mais dias no mês? 💪 (vale corrida, musculação, bike e natação)",
    value: s => s.trainingDaysMonth ?? 0,
    format: v => `${v} ${v === 1 ? "dia" : "dias"}`,
    remaining: daysLeftInMonth,
  },
  {
    key: "weekDays",
    tab: "Semana · dias",
    title: "Desafio da semana",
    question: "Quem treina mais dias até domingo? 🔥 (todos os esportes)",
    value: s => s.trainingDaysWeek ?? 0,
    format: v => `${v} ${v === 1 ? "dia" : "dias"}`,
    remaining: daysLeftInWeek,
  },
  {
    key: "weekKm",
    tab: "Semana · km",
    title: "Desafio da semana",
    question: "Quem corre mais km até domingo? 🏃",
    value: s => s.weekKm,
    format: v => `${v.toFixed(1)} km`,
    remaining: daysLeftInWeek,
  },
];

function displayName(s: FriendStats): string {
  if (s.isMe) return "Você";
  return s.name?.trim() || (s.username ? `@${s.username}` : "Atleta");
}

/**
 * Friend challenges. Derived live from the leaderboard aggregates — nobody has
 * to opt in, the competition just runs. Defaults to training days this month,
 * which counts every sport rather than running alone.
 */
export function ChallengesCard({ stats }: Props) {
  const [active, setActive] = useState<ChallengeKey>("monthDays");
  if (stats.length < 2) return null;   // needs at least one friend

  const def = CHALLENGES.find(c => c.key === active)!;
  const ranked = [...stats].sort((a, b) => def.value(b) - def.value(a));
  const leader = ranked[0];
  const leaderValue = Math.max(def.value(leader) || 0, 1);
  const remaining = def.remaining();

  const me = stats.find(s => s.isMe) ?? null;
  const myValue = me ? def.value(me) : 0;
  const myRank = me ? ranked.findIndex(s => s.isMe) + 1 : 0;
  const gap = leader && me && !me.isMe ? def.value(leader) - myValue : 0;

  // Last week's winner only makes sense for the weekly km challenge.
  const lastWeekRanked = [...stats].sort((a, b) => b.lastWeekKm - a.lastWeekKm);
  const lastWinner = active === "weekKm" && lastWeekRanked[0]?.lastWeekKm > 0 ? lastWeekRanked[0] : null;

  return (
    <div className="card p-4 border-brand-500/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">{def.title}</h2>
        </div>
        <span className="text-[11px] text-surface-500 shrink-0">
          {remaining === 0 ? "último dia!" : `${remaining} dia${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Challenge switcher */}
      <div className="flex gap-1 bg-surface-700 rounded-lg p-1 mb-3">
        {CHALLENGES.map(c => (
          <button
            key={c.key}
            onClick={() => setActive(c.key)}
            className={`flex-1 min-h-[44px] py-1.5 px-2 rounded-md text-[10px] sm:text-[11px] font-semibold transition-colors duration-100 ${
              active === c.key ? "bg-brand-500 text-white" : "text-surface-400 hover:text-surface-200"
            }`}
          >
            {c.tab}
          </button>
        ))}
      </div>

      <p className="text-xs text-surface-500 mb-3">{def.question}</p>

      <div className="space-y-2.5">
        {ranked.map((s, i) => {
          const v = def.value(s);
          const pct = Math.max(4, (v / leaderValue) * 100);
          const leading = i === 0 && v > 0;
          return (
            <div key={s.userId}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold flex items-center gap-1.5 ${
                  s.isMe ? "text-brand-300" : "text-surface-300"
                }`}>
                  {leading && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
                  {displayName(s)}
                </span>
                <span className="text-xs font-mono font-bold text-surface-200 tabular-nums">
                  {def.format(v)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    leading ? "bg-gradient-to-r from-brand-500 to-yellow-400"
                      : s.isMe ? "bg-brand-500" : "bg-surface-500"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Where the athlete stands */}
      {me && (
        <div className="mt-3 pt-3 border-t border-surface-700/50 flex items-start gap-1.5">
          {myRank === 1 ? (
            <>
              <Flame className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-surface-400">
                Você está <span className="font-semibold text-brand-300">em primeiro</span>
                {remaining > 0 && " — segure a liderança até o fim."}
              </p>
            </>
          ) : gap > 0 ? (
            <>
              <Target className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-surface-400">
                {myRank}º lugar · faltam <span className="font-semibold text-surface-200">{def.format(gap)}</span> para
                alcançar {displayName(leader)}
                {remaining > 0 && ` em ${remaining} dia${remaining > 1 ? "s" : ""}`}.
              </p>
            </>
          ) : null}
        </div>
      )}

      {lastWinner && (
        <p className="text-[11px] text-surface-500 mt-2 flex items-center gap-1.5">
          <Medal className="w-3.5 h-3.5 text-yellow-500" />
          Semana passada: <span className="font-semibold text-surface-300">{displayName(lastWinner)}</span>
          venceu com {lastWinner.lastWeekKm.toFixed(1)} km
        </p>
      )}
    </div>
  );
}
