"use client";

import { Swords, Crown, Medal } from "lucide-react";
import type { FriendStats } from "@/types";

interface Props {
  stats: FriendStats[];
}

function displayName(s: FriendStats): string {
  if (s.isMe) return "Você";
  return s.name?.trim() || (s.username ? `@${s.username}` : "Atleta");
}

function daysUntilSunday(): number {
  const today = new Date().getDay(); // 0 = Sunday
  return today === 0 ? 0 : 7 - today;
}

/**
 * Weekly km challenge between friends: live ranking Mon→Sun with progress
 * bars relative to the current leader, plus last week's winner.
 */
export function WeeklyChallengeCard({ stats }: Props) {
  if (stats.length < 2) return null; // needs at least one friend

  const ranked = [...stats].sort((a, b) => b.weekKm - a.weekKm);
  const leaderKm = Math.max(ranked[0]?.weekKm ?? 0, 1);
  const remaining = daysUntilSunday();

  const lastWeekRanked = [...stats].sort((a, b) => b.lastWeekKm - a.lastWeekKm);
  const lastWinner = lastWeekRanked[0]?.lastWeekKm > 0 ? lastWeekRanked[0] : null;

  return (
    <div className="card p-4 border-brand-500/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Desafio da semana</h2>
        </div>
        <span className="text-[11px] text-surface-500">
          {remaining === 0 ? "último dia!" : `${remaining} dia${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}`}
        </span>
      </div>

      <p className="text-xs text-surface-500 mb-3">Quem corre mais km até domingo? 🏃</p>

      <div className="space-y-2.5">
        {ranked.map((s, i) => {
          const pct = Math.max(4, (s.weekKm / leaderKm) * 100);
          const leading = i === 0 && s.weekKm > 0;
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
                  {s.weekKm.toFixed(1)} km
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    leading ? "bg-gradient-to-r from-brand-500 to-yellow-400" : s.isMe ? "bg-brand-500" : "bg-surface-500"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {lastWinner && (
        <p className="text-[11px] text-surface-500 mt-3 pt-3 border-t border-surface-700/50 flex items-center gap-1.5">
          <Medal className="w-3.5 h-3.5 text-yellow-500" />
          Semana passada: <span className="font-semibold text-surface-300">{displayName(lastWinner)}</span>
          venceu com {lastWinner.lastWeekKm.toFixed(1)} km
        </p>
      )}
    </div>
  );
}
