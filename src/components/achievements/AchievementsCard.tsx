"use client";

import { useState, useEffect } from "react";
import { Trophy, ChevronRight, Lock } from "lucide-react";
import type { Achievement } from "@/lib/achievements";
import { Confetti } from "@/components/shared/Confetti";

interface AchievementsCardProps {
  achievements: Achievement[];
}

const SEEN_KEY = "limiar_seen_badges";

export function AchievementsCard({ achievements }: AchievementsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const displayCount = expanded ? achievements.length : 6;

  // Fire a confetti burst when a badge unlocks that the user hasn't seen before
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlockedIds = achievements.filter(a => a.unlocked).map(a => a.id).sort();
    if (unlockedIds.length === 0) return;
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
      const hasNew = unlockedIds.some(id => !seen.includes(id));
      // Only celebrate when we have a prior snapshot (avoid firing on first ever load)
      if (hasNew && seen.length > 0) setCelebrate(true);
      localStorage.setItem(SEEN_KEY, JSON.stringify(unlockedIds));
    } catch {
      // ignore storage errors
    }
  }, [achievements]);

  return (
    <div className="card p-5 space-y-4">
      <Confetti trigger={celebrate} onDone={() => setCelebrate(false)} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h2 className="section-title">Conquistas</h2>
            <p className="text-xs text-surface-500">{unlockedCount} de {achievements.length} desbloqueadas</p>
          </div>
        </div>
        {unlockedCount > 0 && (
          <div className="text-right">
            <p className="text-2xl font-black text-brand-400 tabular-nums">{unlockedCount}</p>
            <p className="text-[10px] text-surface-600">badges</p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-1.5 rounded-full bg-surface-700 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-orange-400 transition-all duration-500"
            style={{ width: `${(unlockedCount / achievements.length) * 100}%` }}
          />
        </div>
        <p className="text-xs text-surface-500">
          {achievements.length - unlockedCount} por desbloquear
        </p>
      </div>

      {/* Achievements grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {achievements.slice(0, displayCount).map(achievement => (
          <div
            key={achievement.id}
            className={`p-3 rounded-lg text-center transition-all ${
              achievement.unlocked
                ? "bg-brand-500/15 border border-brand-500/30"
                : "bg-surface-700/30 border border-surface-600"
            }`}
          >
            <div className="text-2xl mb-1">{achievement.icon}</div>
            <p className="text-xs font-semibold text-surface-200 line-clamp-2 mb-0.5">
              {achievement.label}
            </p>
            <p className="text-[10px] text-surface-500">{achievement.description}</p>

            {/* Progress bar for locked achievements */}
            {!achievement.unlocked && achievement.progress !== undefined && achievement.progress > 0 && (
              <div className="mt-1.5">
                <div className="h-0.5 rounded-full bg-surface-600 overflow-hidden">
                  <div
                    className="h-full bg-yellow-500 transition-all"
                    style={{ width: `${achievement.progress}%` }}
                  />
                </div>
                <p className="text-[9px] text-surface-600 mt-0.5">
                  {Math.round(achievement.progress)}%
                </p>
              </div>
            )}

            {!achievement.unlocked && (
              <div className="mt-1.5">
                <Lock className="w-3 h-3 text-surface-500 mx-auto opacity-50" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Expand button */}
      {achievements.length > 6 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="btn-ghost w-full justify-center text-xs"
        >
          Ver todas as {achievements.length} conquistas <ChevronRight className="w-3 h-3" />
        </button>
      )}

      {expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="btn-ghost w-full justify-center text-xs"
        >
          Mostrar menos
        </button>
      )}
    </div>
  );
}
