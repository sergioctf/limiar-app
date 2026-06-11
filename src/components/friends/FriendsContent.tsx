"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users, UserPlus, Check, X, Loader2, Trophy, Flame, MapPin,
  Calendar, Zap, Clock, Crown, AlertCircle, RefreshCw,
} from "lucide-react";
import { secondsToReadable } from "@/lib/utils";
import type { FriendSummary, FriendStats } from "@/types";

interface Props {
  myUsername: string | null;
  myName: string | null;
}

type Metric = "weekKm" | "monthKm" | "streak" | "best5kSeconds" | "best10kSeconds";

const METRICS: Array<{ key: Metric; label: string; icon: React.ReactNode; lowerIsBetter?: boolean }> = [
  { key: "weekKm",        label: "Semana",  icon: <MapPin className="w-3.5 h-3.5" /> },
  { key: "monthKm",       label: "Mês",     icon: <Calendar className="w-3.5 h-3.5" /> },
  { key: "streak",        label: "Sequência", icon: <Flame className="w-3.5 h-3.5" /> },
  { key: "best5kSeconds", label: "PR 5K",   icon: <Zap className="w-3.5 h-3.5" />, lowerIsBetter: true },
  { key: "best10kSeconds",label: "PR 10K",  icon: <Clock className="w-3.5 h-3.5" />, lowerIsBetter: true },
];

function displayName(s: { name: string | null; username: string | null }): string {
  return s.name?.trim() || (s.username ? `@${s.username}` : "Atleta");
}

function metricValue(s: FriendStats, m: Metric): number | null {
  const v = s[m];
  return typeof v === "number" ? v : null;
}

function formatMetric(value: number | null, m: Metric): string {
  if (value === null) return "—";
  if (m === "weekKm" || m === "monthKm") return `${value} km`;
  if (m === "streak") return `${value} ${value === 1 ? "dia" : "dias"}`;
  return secondsToReadable(value); // PR times
}

export function FriendsContent({ myUsername, myName }: Props) {
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [incoming, setIncoming] = useState<FriendSummary[]>([]);
  const [outgoing, setOutgoing] = useState<FriendSummary[]>([]);
  const [stats, setStats] = useState<FriendStats[]>([]);
  const [loading, setLoading] = useState(true);

  const [addValue, setAddValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [metric, setMetric] = useState<Metric>("weekKm");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, lRes] = await Promise.all([
        fetch("/api/friends"),
        fetch("/api/friends/leaderboard"),
      ]);
      const f = await fRes.json();
      const l = await lRes.json();
      setFriends(f.friends ?? []);
      setIncoming(f.incoming ?? []);
      setOutgoing(f.outgoing ?? []);
      setStats(l.stats ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addFriend(e: React.FormEvent) {
    e.preventDefault();
    const username = addValue.trim();
    if (!username) return;
    setAdding(true);
    setAddMsg(null);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddValue("");
        setAddMsg({ type: "ok", text: data.accepted ? "Pedido aceito — agora são amigos!" : "Pedido enviado!" });
        load();
      } else {
        setAddMsg({ type: "err", text: data.error ?? "Erro ao enviar pedido" });
      }
    } catch {
      setAddMsg({ type: "err", text: "Falha na conexão" });
    } finally {
      setAdding(false);
    }
  }

  async function accept(id: string) {
    await fetch("/api/friends", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }
  async function remove(id: string) {
    await fetch(`/api/friends?id=${id}`, { method: "DELETE" });
    load();
  }

  // Sorted leaderboard for the active metric
  const ranked = [...stats]
    .filter(s => metricValue(s, metric) !== null || s.isMe)
    .sort((a, b) => {
      const av = metricValue(a, metric), bv = metricValue(b, metric);
      if (av === null) return 1;
      if (bv === null) return -1;
      const lower = METRICS.find(m => m.key === metric)?.lowerIsBetter;
      return lower ? av - bv : bv - av;
    });

  const needsUsername = !myUsername;

  return (
    <div className="space-y-5 max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Amigos</h1>
          <p className="text-surface-500 text-sm">
            {friends.length} amigo{friends.length !== 1 ? "s" : ""}
            {myUsername && <> · você é <span className="text-brand-400">@{myUsername}</span></>}
          </p>
        </div>
        <button onClick={load} disabled={loading} title="Atualizar"
          className="text-surface-600 hover:text-surface-400 p-2 rounded-lg hover:bg-surface-700/50 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Username required notice */}
      {needsUsername && (
        <div className="card p-4 border-yellow-500/20 bg-yellow-500/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-surface-200">Defina seu username</p>
              <p className="text-xs text-surface-400 mt-0.5">
                Para seus amigos te encontrarem, escolha um username em{" "}
                <Link href="/settings" className="text-brand-400 underline">Configurações</Link>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add friend */}
      <form onSubmit={addFriend} className="card p-4">
        <label className="stat-label mb-2 block">Adicionar amigo por username</label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500">@</span>
            <input
              type="text"
              value={addValue}
              onChange={e => setAddValue(e.target.value.replace(/\s/g, ""))}
              placeholder="username"
              className="w-full bg-surface-700 border border-surface-600 rounded-xl pl-7 pr-3 py-2.5 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
            />
          </div>
          <button type="submit" disabled={adding || !addValue.trim()} className="btn-primary shrink-0">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4" /><span className="hidden sm:inline">Adicionar</span></>}
          </button>
        </div>
        {addMsg && (
          <p className={`text-xs mt-2 ${addMsg.type === "ok" ? "text-green-400" : "text-red-400"}`}>{addMsg.text}</p>
        )}
      </form>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <div className="card p-4 space-y-2">
          <p className="stat-label mb-1">Pedidos recebidos</p>
          {incoming.map(r => (
            <div key={r.friendshipId} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 text-sm font-bold shrink-0">
                {displayName(r).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-surface-200 truncate">{displayName(r)}</p>
                {r.username && <p className="text-xs text-surface-500">@{r.username}</p>}
              </div>
              <button onClick={() => accept(r.friendshipId)} className="w-8 h-8 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 flex items-center justify-center transition-colors" title="Aceitar">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => remove(r.friendshipId)} className="w-8 h-8 rounded-lg bg-surface-700 text-surface-400 hover:text-red-400 flex items-center justify-center transition-colors" title="Recusar">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Leaderboard */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Ranking</h2>
        </div>

        {/* Metric pills */}
        <div className="flex gap-1.5 flex-wrap mb-3">
          {METRICS.map(m => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                metric === m.key ? "bg-brand-500 text-white" : "bg-surface-700 text-surface-400 hover:text-surface-200"
              }`}>
              {m.icon}{m.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-surface-500" /></div>
        ) : ranked.length <= 1 && friends.length === 0 ? (
          <div className="text-center py-8 text-surface-500">
            <Users className="w-7 h-7 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Adicione amigos para ver o ranking</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {ranked.map((s, i) => {
              const val = metricValue(s, metric);
              return (
                <div key={s.userId}
                  className={`flex items-center gap-3 rounded-xl p-2.5 ${
                    s.isMe ? "bg-brand-500/10 border border-brand-500/20" : "bg-surface-700/30"
                  }`}>
                  <div className="w-6 text-center shrink-0">
                    {i === 0 && val !== null
                      ? <Crown className="w-4 h-4 text-yellow-400 mx-auto" />
                      : <span className="text-sm font-bold text-surface-500">{i + 1}</span>}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-surface-600 flex items-center justify-center text-surface-200 text-sm font-bold shrink-0">
                    {displayName(s).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-200 truncate">
                      {displayName(s)} {s.isMe && <span className="text-[10px] text-brand-400">(você)</span>}
                    </p>
                    {s.username && <p className="text-xs text-surface-500">@{s.username}</p>}
                  </div>
                  <span className={`font-mono font-bold text-sm shrink-0 ${val !== null ? "text-surface-100" : "text-surface-600"}`}>
                    {formatMetric(val, metric)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Outgoing pending */}
      {outgoing.length > 0 && (
        <div className="card p-4 space-y-2">
          <p className="stat-label mb-1">Pedidos enviados</p>
          {outgoing.map(r => (
            <div key={r.friendshipId} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-700 flex items-center justify-center text-surface-400 text-sm font-bold shrink-0">
                {displayName(r).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-surface-300 truncate">{displayName(r)}</p>
                <p className="text-xs text-surface-500">aguardando aceite</p>
              </div>
              <button onClick={() => remove(r.friendshipId)} className="text-xs text-surface-500 hover:text-red-400 px-2 py-1">
                Cancelar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
