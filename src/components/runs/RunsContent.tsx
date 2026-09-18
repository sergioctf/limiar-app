"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Plus, SlidersHorizontal, MapPin, Clock, TrendingUp, Heart, Map as MapIcon } from "lucide-react";
import { RunCard } from "./RunCard";
import { EmptyState } from "@/components/shared/States";
import { ProgressCard } from "./ProgressCard";
import { ActivityCard, activityLabel, type HistoryActivity } from "./ActivityCard";
import { SportGlyph } from "@/components/shared/SportGlyph";
import { SPORTS, toSportKey } from "@/lib/sports";
import type { ProgressReport } from "@/lib/progress-reading";
import {
  formatDistanceKm, secondsToPaceString,
  runTypeLabel
} from "@/lib/utils";
import type { Run } from "@/types";

const RUN_TYPES = ["easy","long_run","tempo","intervals","race","recovery","steady","progression","other"];
const SOURCES   = ["strava","manual","imported_ai","strava+ai"];

interface Props {
  runs: Run[];
  /** Every other sport, so the history is one list (18/09). */
  activities?: HistoryActivity[];
  /** From `?sport=` — the Home's tiles open the history on their sport. */
  initialSport?: string | null;
  /** "O que está melhorando para você?" — read from the same history listed below. */
  progress?: ProgressReport | null;
}

export function RunsContent({ runs, activities = [], initialSport = null, progress = null }: Props) {
  // "tudo", "corrida" or another sport key. Running keeps its own filters and numbers.
  const sportsPresent = useMemo(() => {
    const keys = new Set<string>();
    for (const a of activities) { const k = toSportKey(a.sport_type); if (k && k !== "corrida") keys.add(k); }
    return Array.from(keys);
  }, [activities]);
  const [sport, setSport] = useState<string>(
    initialSport && (initialSport === "corrida" || sportsPresent.includes(initialSport)) ? initialSport : "tudo",
  );
  const [search, setSearch]             = useState("");
  const [filterType, setFilterType]     = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterMonth, setFilterMonth]   = useState("all");
  const [showFilters, setShowFilters]   = useState(false);
  const [sortKey, setSortKey]           = useState<"date"|"distance"|"pace"|"elevation">("date");

  const months = useMemo(() => {
    const seen = new Set<string>();
    runs.forEach((r) => {
      const m = r.date.slice(0, 7);
      seen.add(m);
    });
    return Array.from(seen).sort().reverse();
  }, [runs]);

  const filtered = useMemo(() => {
    let list = runs;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || r.notes?.toLowerCase().includes(q)
      );
    }
    if (filterType !== "all") list = list.filter((r) => r.type === filterType);
    if (filterSource !== "all") list = list.filter((r) => r.source === filterSource);
    if (filterMonth !== "all") list = list.filter((r) => r.date.startsWith(filterMonth));

    return [...list].sort((a, b) => {
      if (sortKey === "date")      return b.date.localeCompare(a.date);
      if (sortKey === "distance")  return b.distance_km - a.distance_km;
      if (sortKey === "elevation") return (b.elevation_gain_m ?? 0) - (a.elevation_gain_m ?? 0);
      if (sortKey === "pace") {
        const pa = a.avg_pace_seconds_per_km ?? 99999;
        const pb = b.avg_pace_seconds_per_km ?? 99999;
        return pa - pb;
      }
      return 0;
    });
  }, [runs, search, filterType, filterSource, filterMonth, sortKey]);

  const totalKm = filtered.reduce((s, r) => s + r.distance_km, 0);

  // Other sports: the same search and month apply; running filters do not.
  const filteredActivities = useMemo(() => {
    let list = sport === "corrida" ? [] : activities;
    if (sport !== "tudo" && sport !== "corrida") list = list.filter(a => toSportKey(a.sport_type) === sport);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => (a.name ?? "").toLowerCase().includes(q) || activityLabel(a).toLowerCase().includes(q));
    }
    if (filterMonth !== "all") list = list.filter(a => a.date.startsWith(filterMonth));
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [activities, sport, search, filterMonth]);

  const showRuns = sport === "tudo" || sport === "corrida";
  const merged = useMemo(() => {
    if (sport !== "tudo") return null;
    return [
      ...filtered.map(r => ({ kind: "run" as const, date: r.date, run: r })),
      ...filteredActivities.map(a => ({ kind: "activity" as const, date: a.date, activity: a })),
    ].sort((a, b) => b.date.localeCompare(a.date));
  }, [sport, filtered, filteredActivities]);
  const activityMinutes = filteredActivities.reduce((sum, a) => sum + (a.duration_seconds ?? 0) / 60, 0);
  const count = (showRuns ? filtered.length : 0) + filteredActivities.length;

  // Stats bar computed values
  const avgPaceSec = useMemo(() => {
    if (filtered.length === 0) return null;
    const withPace = filtered.filter((r) => r.avg_pace_seconds_per_km);
    if (withPace.length === 0) return null;
    return Math.round(withPace.reduce((s, r) => s + (r.avg_pace_seconds_per_km ?? 0), 0) / withPace.length);
  }, [filtered]);

  const avgHR = useMemo(() => {
    const withHR = filtered.filter((r) => r.avg_hr);
    if (withHR.length === 0) return null;
    return Math.round(withHR.reduce((s, r) => s + (r.avg_hr ?? 0), 0) / withHR.length);
  }, [filtered]);

  return (
    <div className="space-y-4 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Atividades</h1>
          <p className="text-surface-500 text-sm">
            {count} {count === 1 ? "atividade" : "atividades"}{showRuns ? ` · ${totalKm.toFixed(1).replace(".", ",")} km de corrida` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/runs/map" className="btn-secondary">
            <MapIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Mapa</span>
          </Link>
          <Link href="/runs/new" className="btn-primary">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova</span>
          </Link>
        </div>
      </div>

      <ProgressCard report={progress} />

      {/* Every sport in one history: pick one, or see them all together. */}
      {sportsPresent.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Esporte">
          {["tudo", "corrida", ...sportsPresent].map(k => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={sport === k}
              onClick={() => setSport(k)}
              className={`shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full text-sm font-medium border transition-colors ${
                sport === k ? "bg-surface-600 border-surface-500 text-surface-100" : "border-surface-700 text-surface-400 hover:text-surface-200"
              }`}
            >
              {k !== "tudo" && <SportGlyph sport={k} className="w-3.5 h-3.5" />}
              {k === "tudo" ? "Tudo" : SPORTS[k as keyof typeof SPORTS]?.label ?? k}
            </button>
          ))}
        </div>
      )}

      {/* Search + filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={sport === "corrida" ? "Buscar corrida..." : "Buscar atividade..."}
              className="input pl-9"
            />
          </div>
          {sport === "corrida" && <button
            onClick={() => setShowFilters((v) => !v)}
            className={`btn-secondary gap-1.5 ${showFilters ? "border-brand-500/60 text-brand-300" : ""}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filtros</span>
          </button>}
        </div>

        {showFilters && sport === "corrida" && (
          <div className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 animate-slide-up">
            <div>
              <label className="label">Tipo</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="input text-xs"
              >
                <option value="all">Todos</option>
                {RUN_TYPES.map((t) => (
                  <option key={t} value={t}>{runTypeLabel(t)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Fonte</label>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="input text-xs"
              >
                <option value="all">Todas</option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Mês</label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="input text-xs"
              >
                <option value="all">Todos</option>
                {months.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Ordenar por</label>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                className="input text-xs"
              >
                <option value="date">Data</option>
                <option value="distance">Distância</option>
                <option value="pace">Pace</option>
                <option value="elevation">Elevação</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Stats bar — other sports: sessions and time */}
      {sport !== "corrida" && sport !== "tudo" && filteredActivities.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <div className="flex items-center gap-1.5 bg-surface-800 border border-surface-700 rounded-full px-3 py-1.5 shrink-0">
            <span className="text-brand-400 text-xs font-bold tabular-nums">{filteredActivities.length}</span>
            <span className="text-surface-500 text-xs">{filteredActivities.length === 1 ? "sessão" : "sessões"}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-surface-800 border border-surface-700 rounded-full px-3 py-1.5 shrink-0">
            <Clock className="w-3 h-3 text-surface-400 shrink-0" />
            <span className="text-surface-100 text-xs font-bold tabular-nums">{Math.floor(activityMinutes / 60)}h{String(Math.round(activityMinutes % 60)).padStart(2, "0")}</span>
          </div>
        </div>
      )}

      {/* Stats bar — running */}
      {sport === "corrida" && filtered.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <div className="flex items-center gap-1.5 bg-surface-800 border border-surface-700 rounded-full px-3 py-1.5 shrink-0">
            <span className="text-brand-400 text-xs font-bold tabular-nums">{filtered.length}</span>
            <span className="text-surface-500 text-xs">corridas</span>
          </div>
          <div className="flex items-center gap-1.5 bg-surface-800 border border-surface-700 rounded-full px-3 py-1.5 shrink-0">
            <MapPin className="w-3 h-3 text-surface-400 shrink-0" />
            <span className="text-surface-100 text-xs font-bold tabular-nums">{totalKm.toFixed(1).replace(".", ",")} km</span>
          </div>
          {avgPaceSec && (
            <div className="flex items-center gap-1.5 bg-surface-800 border border-surface-700 rounded-full px-3 py-1.5 shrink-0">
              <TrendingUp className="w-3 h-3 text-surface-400 shrink-0" />
              <span className="text-surface-100 text-xs font-bold tabular-nums">
                {secondsToPaceString(avgPaceSec)}/km
              </span>
              <span className="text-surface-500 text-xs">pace médio</span>
            </div>
          )}
          {avgHR && (
            <div className="flex items-center gap-1.5 bg-surface-800 border border-surface-700 rounded-full px-3 py-1.5 shrink-0">
              <Heart className="w-3 h-3 text-red-400 shrink-0" />
              <span className="text-surface-100 text-xs font-bold tabular-nums">{avgHR} bpm</span>
              <span className="text-surface-500 text-xs">FC média</span>
            </div>
          )}
        </div>
      )}

      {/* List — one history, every sport, the same path for each */}
      {count === 0 ? (
        <EmptyState
          title={sport === "corrida" ? "Nenhuma corrida encontrada" : "Nenhuma atividade encontrada"}
          description="Tente ajustar a busca ou os filtros, ou registre um treino."
          action={
            <Link href="/runs/new" className="btn-primary">
              <Plus className="w-4 h-4" /> Registrar treino
            </Link>
          }
        />
      ) : merged ? (
        <div className="space-y-2">
          {merged.map(item => item.kind === "run"
            ? <RunCard key={`r-${item.run.id}`} run={item.run} />
            : <ActivityCard key={`a-${item.activity.id}`} activity={item.activity} />)}
        </div>
      ) : sport === "corrida" ? (
        <div className="space-y-2">
          {filtered.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredActivities.map(a => <ActivityCard key={a.id} activity={a} />)}
        </div>
      )}
    </div>
  );
}
