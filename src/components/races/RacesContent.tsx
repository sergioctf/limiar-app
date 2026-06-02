"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Trophy, Plus, MapPin, Clock, TrendingUp,
  Calendar, Flag, Trash2, Pencil, ChevronRight,
  Medal, Star,
} from "lucide-react";
import { timeToString } from "@/lib/performance";
import { computeMetrics } from "@/lib/performance";
import { formatDate } from "@/lib/utils";
import { RaceForm } from "@/components/races/RaceForm";
import type { Race } from "@/types";

interface Props {
  initialRaces: Race[];
}

// Standard distances with matching tolerance
const STANDARD_DISTANCES = [
  { key: "5k",       label: "5 km",          min: 4.8,  max: 5.2  },
  { key: "10k",      label: "10 km",         min: 9.8,  max: 10.2 },
  { key: "half",     label: "Meia Maratona", min: 20.9, max: 21.3 },
  { key: "marathon", label: "Maratona",      min: 42.0, max: 42.4 },
];

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const race = new Date(dateStr + "T12:00:00");
  return Math.round((race.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function distanceLabel(km: number): string {
  for (const d of STANDARD_DISTANCES) {
    if (km >= d.min && km <= d.max) return d.label;
  }
  return `${km} km`;
}

function paceLabel(distanceKm: number, timeSecs: number): string {
  const secPerKm = timeSecs / distanceKm;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

interface PR {
  time: number;
  date: string;
  name: string;
  vdot?: number;
}

function computePRs(races: Race[]): Record<string, PR | null> {
  const result: Record<string, PR | null> = {};
  for (const dist of STANDARD_DISTANCES) {
    const matching = races.filter(
      (r) => r.distance_km >= dist.min && r.distance_km <= dist.max && r.time_seconds
    );
    if (matching.length > 0) {
      const best = matching.reduce((a, b) =>
        a.time_seconds! < b.time_seconds! ? a : b
      );
      let vdot: number | undefined;
      try {
        vdot = computeMetrics(best.distance_km * 1000, best.time_seconds!).vdot;
      } catch { /* ignore */ }
      result[dist.key] = { time: best.time_seconds!, date: best.race_date, name: best.name, vdot };
    } else {
      result[dist.key] = null;
    }
  }
  return result;
}

export function RacesContent({ initialRaces }: Props) {
  const [races, setRaces]       = useState<Race[]>(initialRaces);
  const [showForm, setShowForm] = useState(false);
  const [editRace, setEditRace] = useState<Race | null>(null);
  const [addResultFor, setAddResultFor] = useState<Race | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  // Split into future and past
  const futureRaces = useMemo(
    () =>
      races
        .filter((r) => r.race_date > today && !r.time_seconds)
        .sort((a, b) => a.race_date.localeCompare(b.race_date)),
    [races, today]
  );

  const pastRaces = useMemo(
    () =>
      races
        .filter((r) => r.race_date <= today || !!r.time_seconds)
        .sort((a, b) => b.race_date.localeCompare(a.race_date)),
    [races, today]
  );

  const nextRace = futureRaces[0] ?? null;
  const prs      = useMemo(() => computePRs(races), [races]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleSaved(race: Race) {
    setRaces((prev) => {
      const idx = prev.findIndex((r) => r.id === race.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = race;
        return next;
      }
      return [race, ...prev];
    });
    setShowForm(false);
    setEditRace(null);
    setAddResultFor(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta prova?")) return;
    setDeleting(id);
    const res = await fetch(`/api/races/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRaces((prev) => prev.filter((r) => r.id !== id));
    }
    setDeleting(null);
  }

  function openAddResult(race: Race) {
    setAddResultFor(race);
    setEditRace(race);
    setShowForm(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header flex items-center gap-2">
            <Trophy className="w-6 h-6 text-brand-400" /> Minhas Provas
          </h1>
          <p className="text-surface-500 text-sm mt-0.5">
            {races.length === 0
              ? "Registre suas corridas de rua"
              : `${pastRaces.length} resultado${pastRaces.length !== 1 ? "s" : ""} · ${futureRaces.length} agendada${futureRaces.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => { setEditRace(null); setAddResultFor(null); setShowForm(true); }}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Adicionar prova</span>
          <span className="sm:hidden">Prova</span>
        </button>
      </div>

      {/* Empty state */}
      {races.length === 0 && (
        <div className="card p-10 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-brand-500/15 flex items-center justify-center mx-auto">
            <Trophy className="w-7 h-7 text-brand-400" />
          </div>
          <h2 className="font-bold text-surface-100">Nenhuma prova ainda</h2>
          <p className="text-sm text-surface-500 max-w-xs mx-auto">
            Registre provas passadas para ver seus PRs, ou adicione uma futura para ter o countdown na home.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary mx-auto mt-2"
          >
            <Plus className="w-4 h-4" /> Adicionar primeira prova
          </button>
        </div>
      )}

      {/* Next race countdown */}
      {nextRace && (() => {
        const days = daysUntil(nextRace.race_date);
        return (
          <div className="card p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-500 to-brand-300 rounded-t-xl" />
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                  <Flag className="w-3.5 h-3.5" /> Próxima prova
                </p>
                <h2 className="font-bold text-surface-100 text-lg leading-tight">{nextRace.name}</h2>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-sm text-surface-400">
                    {distanceLabel(nextRace.distance_km)}
                  </span>
                  <span className="text-surface-600">·</span>
                  <span className="text-sm text-surface-400 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(nextRace.race_date)}
                  </span>
                  {nextRace.location && (
                    <>
                      <span className="text-surface-600">·</span>
                      <span className="text-sm text-surface-400 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />{nextRace.location}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-5xl font-black tabular-nums leading-none ${
                  days <= 7  ? "text-red-400" :
                  days <= 30 ? "text-yellow-400" : "text-brand-300"
                }`}>
                  {days > 0 ? days : "HOJE"}
                </div>
                {days > 0 && <p className="text-xs text-surface-500 mt-1">{days === 1 ? "dia" : "dias"}</p>}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => openAddResult(nextRace)}
                className="btn-primary text-sm py-1.5"
              >
                <Trophy className="w-3.5 h-3.5" /> Registrar resultado
              </button>
              <button
                onClick={() => { setEditRace(nextRace); setAddResultFor(null); setShowForm(true); }}
                className="btn-secondary text-sm py-1.5"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
            </div>
          </div>
        );
      })()}

      {/* Other upcoming races */}
      {futureRaces.length > 1 && (
        <div className="space-y-2">
          <h2 className="section-title">Outras provas agendadas</h2>
          {futureRaces.slice(1).map((race) => {
            const days = daysUntil(race.race_date);
            return (
              <div key={race.id} className="card p-4 flex items-center gap-4">
                <div className={`w-12 text-center shrink-0`}>
                  <div className={`text-xl font-black tabular-nums ${
                    days <= 30 ? "text-yellow-400" : "text-brand-300"
                  }`}>{days}</div>
                  <div className="text-xs text-surface-600">dias</div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-surface-100 text-sm truncate">{race.name}</p>
                  <p className="text-xs text-surface-500">
                    {distanceLabel(race.distance_km)} · {formatDate(race.race_date)}
                    {race.location && ` · ${race.location}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openAddResult(race)} className="btn-ghost text-xs p-1.5 text-green-400 hover:text-green-300">
                    <Trophy className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setEditRace(race); setAddResultFor(null); setShowForm(true); }} className="btn-ghost p-1.5">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(race.id)} disabled={deleting === race.id} className="btn-ghost p-1.5 text-surface-600 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PRs section */}
      {pastRaces.length > 0 && (
        <div>
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Medal className="w-4 h-4 text-yellow-400" /> Records Pessoais
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STANDARD_DISTANCES.map((dist) => {
              const pr = prs[dist.key];
              return (
                <div
                  key={dist.key}
                  className={`card p-4 ${pr ? "" : "opacity-50"}`}
                >
                  <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2">
                    {dist.label}
                  </p>
                  {pr ? (
                    <>
                      <p className="text-xl font-black text-surface-100 tabular-nums leading-none">
                        {timeToString(pr.time)}
                      </p>
                      <p className="text-xs text-surface-500 mt-1 truncate">{pr.name}</p>
                      <p className="text-xs text-surface-600 mt-0.5">{formatDate(pr.date)}</p>
                      {pr.vdot && (
                        <span className="inline-block mt-2 text-xs font-semibold text-brand-400 bg-brand-500/10 rounded-lg px-2 py-0.5">
                          VDOT {pr.vdot}
                        </span>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-surface-600 mt-1">Sem resultado</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Past races list */}
      {pastRaces.length > 0 && (
        <div>
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Histórico de provas
          </h2>
          <div className="space-y-2">
            {pastRaces.map((race) => {
              const isPR = race.time_seconds && STANDARD_DISTANCES.some((d) => {
                const pr = prs[d.key];
                return pr && pr.time === race.time_seconds && race.distance_km >= d.min && race.distance_km <= d.max;
              });

              let vdot: number | null = null;
              if (race.time_seconds && race.distance_km >= 3) {
                try {
                  vdot = computeMetrics(race.distance_km * 1000, race.time_seconds, race.avg_hr ?? undefined).vdot;
                } catch { /* ignore */ }
              }

              return (
                <div key={race.id} className="card p-4 flex items-center gap-4 group">
                  {/* Distance badge */}
                  <div className="w-16 shrink-0 text-center">
                    <p className="text-sm font-bold text-surface-100">{race.distance_km} km</p>
                    <p className="text-xs text-surface-500 leading-tight">{formatDate(race.race_date)}</p>
                  </div>

                  {/* Name + location */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-surface-100 text-sm truncate">{race.name}</p>
                      {isPR && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-bold text-yellow-400 bg-yellow-400/10 rounded-md px-1.5 py-0.5">
                          <Star className="w-3 h-3" /> PR
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {race.location && (
                        <span className="text-xs text-surface-500 flex items-center gap-0.5">
                          <MapPin className="w-3 h-3" />{race.location}
                        </span>
                      )}
                      {race.avg_hr && (
                        <span className="text-xs text-surface-500">❤️ {race.avg_hr} bpm</span>
                      )}
                      {vdot && (
                        <span className="text-xs font-semibold text-brand-400">VDOT {vdot}</span>
                      )}
                    </div>
                    {race.notes && (
                      <p className="text-xs text-surface-600 mt-1 line-clamp-1 italic">{race.notes}</p>
                    )}
                  </div>

                  {/* Result */}
                  <div className="text-right shrink-0">
                    {race.time_seconds ? (
                      <>
                        <p className="text-base font-black text-surface-100 tabular-nums">
                          {timeToString(race.time_seconds)}
                        </p>
                        <p className="text-xs text-surface-500">
                          {paceLabel(race.distance_km, race.time_seconds)}
                        </p>
                      </>
                    ) : (
                      <span className="text-xs text-surface-600 italic">sem resultado</span>
                    )}
                  </div>

                  {/* Actions (on hover) */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditRace(race); setAddResultFor(null); setShowForm(true); }}
                      className="btn-ghost p-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(race.id)}
                      disabled={deleting === race.id}
                      className="btn-ghost p-1.5 text-surface-600 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Progress chart teaser */}
      {pastRaces.filter((r) => r.time_seconds).length >= 2 && (
        <Link href="/analytics" className="card-hover p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4.5 h-4.5 text-brand-400" />
            </div>
            <div>
              <p className="font-semibold text-surface-100 text-sm">Ver evolução de VDOT</p>
              <p className="text-xs text-surface-500">Gráficos de progresso em Analytics</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-surface-500" />
        </Link>
      )}

      {/* Form modal */}
      {showForm && (
        <RaceForm
          onClose={() => { setShowForm(false); setEditRace(null); setAddResultFor(null); }}
          onSaved={handleSaved}
          editRace={editRace}
          addResult={!!addResultFor}
        />
      )}
    </div>
  );
}
