"use client";

import Link from "next/link";
import { ArrowLeft, Flame, CalendarCheck, MapPin, Trophy } from "lucide-react";
import { SPORTS, type SportKey } from "@/lib/sports";
import type { DistanceRecord } from "@/lib/best-efforts";
import { FriendMuteToggle } from "@/components/friends/FriendMuteToggle";

interface Props {
  /** Their user id — the mute toggle needs somebody to mute. */
  userId: string;
  name: string | null;
  username: string | null;
  isMe: boolean;
  memberSince: string | null;
  totalRuns: number;
  totalKm: number;
  weekKm: number;
  monthKm: number;
  trainingDaysWeek: number;
  trainingDaysMonth: number;
  streak: number;
  /** Their records, from the shared engine. */
  records: DistanceRecord[];
  /** Mine, for the side-by-side. Empty when viewing my own profile. */
  myRecords: DistanceRecord[];
  sportCounts: Partial<Record<SportKey, number>>;
  weeklyVolume: Array<{ label: string; km: number }>;
}

function Stat({ label, value, sub, icon }: {
  label: string; value: string; sub?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <p className="stat-label">{label}</p>
      </div>
      <p className="text-2xl font-black text-surface-100 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-surface-500 mt-0.5">{sub}</p>}
    </div>
  );
}

/**
 * Public-facing athlete profile. Shows aggregates only — friends never see
 * each other's individual runs, matching the leaderboard's privacy contract.
 */
/** m:ss under an hour, h:mm:ss over it. */
function hms(s: number): string {
  const t = Math.round(Math.abs(s));
  return t >= 3600
    ? `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
    : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** The distances worth putting on a profile — the ones people race. */
const PROFILE_DISTANCES = [5000, 10000, 21097, 42195];

export function FriendProfile(p: Props) {
  const display = p.name?.trim() || (p.username ? `@${p.username}` : "Atleta");
  const maxKm   = Math.max(...p.weeklyVolume.map(w => w.km), 1);

  const mineBy = new Map(p.myRecords.map(r => [r.distanceM, r.best?.seconds ?? null]));
  const shown = PROFILE_DISTANCES
    .map(m => {
      const rec = p.records.find(r => r.distanceM === m);
      return {
        distanceM: m,
        label: rec?.label ?? `${m / 1000} km`,
        theirs: rec?.best?.seconds ?? null,
        mine: mineBy.get(m) ?? null,
        fromInsideRun: rec?.best?.fromInsideRun ?? false,
        activityKm: rec?.best?.activityKm ?? null,
      };
    })
    .filter(r => r.theirs != null);
  const sports  = (Object.keys(p.sportCounts) as SportKey[])
    .filter(k => (p.sportCounts[k] ?? 0) > 0)
    .sort((a, b) => (p.sportCounts[b] ?? 0) - (p.sportCounts[a] ?? 0));
  const totalSessions = sports.reduce((s, k) => s + (p.sportCounts[k] ?? 0), 0);

  return (
    <div className="space-y-5 max-w-3xl mx-auto animate-fade-in">
      <Link href="/friends" className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-300 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Amigos
      </Link>

      {/* Identity */}
      <div className="card p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-brand-500/20 flex items-center justify-center text-brand-400 text-xl font-black shrink-0">
          {display.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-surface-100 truncate">
            {display} {p.isMe && <span className="text-xs text-brand-400 font-medium">(você)</span>}
          </h1>
          {p.username && <p className="text-sm text-surface-500">@{p.username}</p>}
          {p.memberSince && (
            <p className="text-xs text-surface-500 mt-0.5">
              No Limiar desde {new Date(p.memberSince).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </p>
          )}
        </div>
        {/* Nobody needs a bell for their own workouts. */}
        {!p.isMe && <FriendMuteToggle friendId={p.userId} friendName={p.name} />}
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Dias (semana)" value={String(p.trainingDaysWeek)} sub="todos os treinos"
              icon={<CalendarCheck className="w-3.5 h-3.5 text-brand-400" />} />
        <Stat label="Dias (mês)" value={String(p.trainingDaysMonth)} sub="todos os treinos"
              icon={<CalendarCheck className="w-3.5 h-3.5 text-brand-400" />} />
        <Stat label="Km na semana" value={`${p.weekKm}`} sub={`${p.monthKm} km no mês`}
              icon={<MapPin className="w-3.5 h-3.5 text-brand-400" />} />
        <Stat label="Sequência" value={`${p.streak}`} sub={p.streak === 1 ? "dia" : "dias"}
              icon={<Flame className="w-3.5 h-3.5 text-brand-400" />} />
      </div>

      {/* Sport mix */}
      {sports.length > 0 && (
        <div className="card p-4">
          <h2 className="section-title mb-3">Esportes (90 dias)</h2>
          <div className="space-y-2">
            {sports.map(k => {
              const count = p.sportCounts[k] ?? 0;
              const pct = Math.round((count / totalSessions) * 100);
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-6 text-center" aria-hidden>{SPORTS[k].emoji}</span>
                  <span className="text-sm text-surface-300 w-24 shrink-0">{SPORTS[k].label}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-700 overflow-hidden">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-surface-500 font-mono w-16 text-right shrink-0">
                    {count} {count === 1 ? "sessão" : "sessões"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly volume */}
      <div className="card p-4">
        <h2 className="section-title mb-3">Volume das últimas 8 semanas</h2>
        <div className="flex items-end gap-1.5 h-28">
          {p.weeklyVolume.map((w, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <span className="text-[10px] text-surface-500 tabular-nums">{w.km > 0 ? w.km : ""}</span>
              <div
                className={`w-full rounded-t-md ${i === p.weeklyVolume.length - 1 ? "bg-brand-500" : "bg-surface-600"}`}
                style={{ height: `${Math.max((w.km / maxKm) * 100, w.km > 0 ? 4 : 1)}%` }}
              />
              <span className="text-[10px] text-surface-500">{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Records */}
      <div className="card p-4">
        <h2 className="section-title mb-3 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-brand-400" /> Recordes
        </h2>

        {shown.length === 0 ? (
          <p className="text-sm text-surface-500 py-2">
            Nenhum recorde registrado ainda.
          </p>
        ) : (
          <div className="space-y-1.5">
            {shown.map(row => (
              <div key={row.distanceM} className="bg-surface-700/40 rounded-xl px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-surface-400 shrink-0">{row.label}</span>
                  <span className="font-mono font-bold text-surface-100 tabular-nums">
                    {hms(row.theirs!)}
                  </span>
                </div>

                {/*
                  The comparison is the reason to open somebody's profile. It
                  reads as a gap in seconds rather than two numbers side by
                  side, because "1:12 atrás" is a thing you can act on and
                  "26:34 vs 25:22" is arithmetic homework.
                */}
                {!p.isMe && row.mine != null && (
                  <div className="flex items-baseline justify-between gap-3 mt-1">
                    <span className="text-[11px] text-surface-500">
                      seu: {hms(row.mine)}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        row.mine < row.theirs! ? "text-green-400" : "text-surface-400"
                      }`}
                    >
                      {row.mine === row.theirs!
                        ? "empate"
                        : row.mine < row.theirs!
                          ? `você ${hms(row.theirs! - row.mine)} na frente`
                          : `você ${hms(row.mine - row.theirs!)} atrás`}
                    </span>
                  </div>
                )}

                {!p.isMe && row.mine == null && (
                  <p className="text-[11px] text-surface-600 mt-1">
                    você ainda não tem marca nessa distância
                  </p>
                )}

                {row.fromInsideRun && (
                  <p className="text-[10px] text-brand-300/70 mt-1">
                    dentro de um treino de {row.activityKm?.toFixed(1)} km
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-surface-500 mt-3">
          {p.totalRuns} corridas · {p.totalKm} km no total
        </p>
      </div>
    </div>
  );
}
