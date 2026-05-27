"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Filter, Plus, SlidersHorizontal } from "lucide-react";
import { RunCard } from "./RunCard";
import { EmptyState } from "@/components/shared/States";
import {
  formatDate, formatDistanceKm, secondsToPaceString,
  secondsToReadable, runTypeLabel
} from "@/lib/utils";
import type { Run } from "@/types";

const RUN_TYPES = ["easy","long_run","tempo","intervals","race","recovery","steady","progression","other"];
const SOURCES   = ["strava","manual","imported_ai","strava+ai"];

interface Props { runs: Run[] }

export function RunsContent({ runs }: Props) {
  const [search, setSearch]         = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterMonth, setFilterMonth]   = useState("all");
  const [showFilters, setShowFilters]   = useState(false);
  const [sortKey, setSortKey]           = useState<"date"|"distance"|"pace">("date");

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
      if (sortKey === "date")     return b.date.localeCompare(a.date);
      if (sortKey === "distance") return b.distance_km - a.distance_km;
      if (sortKey === "pace") {
        const pa = a.avg_pace_seconds_per_km ?? 99999;
        const pb = b.avg_pace_seconds_per_km ?? 99999;
        return pa - pb;
      }
      return 0;
    });
  }, [runs, search, filterType, filterSource, filterMonth, sortKey]);

  const totalKm = filtered.reduce((s, r) => s + r.distance_km, 0);

  return (
    <div className="space-y-4 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Corridas</h1>
          <p className="text-surface-500 text-sm">
            {filtered.length} corridas · {totalKm.toFixed(1)} km
          </p>
        </div>
        <Link href="/runs/new" className="btn-primary">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nova</span>
        </Link>
      </div>

      {/* Search + filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar corrida..."
              className="input pl-9"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`btn-secondary gap-1.5 ${showFilters ? "border-brand-500/60 text-brand-300" : ""}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filtros</span>
          </button>
        </div>

        {showFilters && (
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
              </select>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma corrida encontrada"
          description="Tente ajustar os filtros ou adicione uma nova corrida."
          action={
            <Link href="/runs/new" className="btn-primary">
              <Plus className="w-4 h-4" /> Adicionar corrida
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
