"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, Flame, Loader2 } from "lucide-react";
import { secondsToPaceString, formatDate } from "@/lib/utils";

interface FeedItem {
  runId: string;
  userId: string;
  name: string | null;
  username: string | null;
  isMe: boolean;
  runName: string;
  date: string;
  distanceKm: number;
  paceSecondsPerKm: number | null;
  durationSeconds: number;
  kudosCount: number;
  didIKudo: boolean;
}

function displayName(item: FeedItem): string {
  if (item.isMe) return "Você";
  return item.name?.trim() || (item.username ? `@${item.username}` : "Atleta");
}

export function FriendsFeed() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/friends/feed");
      const data = await res.json();
      setFeed(data.feed ?? []);
    } catch {
      // keep whatever we had
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleKudo(item: FeedItem) {
    // Optimistic update
    setFeed(prev => prev.map(f =>
      f.runId === item.runId
        ? { ...f, didIKudo: !f.didIKudo, kudosCount: f.kudosCount + (f.didIKudo ? -1 : 1) }
        : f
    ));
    try {
      const res = await fetch("/api/friends/kudos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: item.runId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Roll back on failure
      setFeed(prev => prev.map(f =>
        f.runId === item.runId
          ? { ...f, didIKudo: item.didIKudo, kudosCount: item.kudosCount }
          : f
      ));
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-brand-400" />
        <h2 className="section-title">Feed de atividades</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
        </div>
      ) : feed.length === 0 ? (
        <p className="text-sm text-surface-500 text-center py-6">
          Sem corridas nos últimos 14 dias — as suas e as dos seus amigos aparecem aqui.
        </p>
      ) : (
        <ul className="space-y-2">
          {feed.map(item => (
            <li key={item.runId} className="flex items-center gap-3 bg-surface-700/30 rounded-xl p-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                item.isMe ? "bg-brand-500/20 text-brand-400" : "bg-surface-600 text-surface-200"
              }`}>
                {displayName(item).charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-surface-200 leading-tight">
                  <span className="font-semibold">{displayName(item)}</span>
                  <span className="text-surface-500"> · {formatDate(item.date)}</span>
                </p>
                <p className="text-xs text-surface-400 truncate">{item.runName}</p>
                <p className="text-xs text-surface-500 tabular-nums">
                  {item.distanceKm.toFixed(1)} km
                  {item.paceSecondsPerKm ? ` · ${secondsToPaceString(item.paceSecondsPerKm)}/km` : ""}
                </p>
              </div>

              <button
                onClick={() => toggleKudo(item)}
                disabled={item.isMe}
                title={item.isMe ? "Sua corrida" : item.didIKudo ? "Remover reação" : "Mandar fogo"}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-90 shrink-0 ${
                  item.didIKudo
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                    : item.isMe
                      ? "bg-surface-700/50 text-surface-500"
                      : "bg-surface-700 text-surface-400 hover:text-orange-400 hover:bg-orange-500/10"
                }`}
              >
                <Flame className={`w-4 h-4 ${item.didIKudo ? "fill-orange-400/40" : ""}`} />
                {item.kudosCount > 0 && <span className="tabular-nums">{item.kudosCount}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
