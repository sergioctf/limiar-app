import Link from "next/link";
import {
  MapPin, Clock, Heart, TrendingUp, Mountain, MessageSquare
} from "lucide-react";
import { PaceBadge, RunTypeBadge, SourceBadge, TagBadge } from "@/components/shared/Badges";
import {
  formatDate, formatDistanceKm, secondsToReadable, secondsToPaceString
} from "@/lib/utils";
import type { Run } from "@/types";

interface Props { run: Run }

export function RunCard({ run }: Props) {
  return (
    <Link
      href={`/runs/${run.id}`}
      className="card-hover p-4 block animate-fade-in"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-surface-100 text-sm truncate">
              {run.name}
            </span>
            {run.relevance && run.relevance >= 9 && (
              <span className="badge bg-brand-500/20 text-brand-300 text-xs">⭐ Destaque</span>
            )}
          </div>
          <p className="text-xs text-surface-500">{formatDate(run.date)}</p>
        </div>

        {/* Right: badges */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <RunTypeBadge type={run.type} />
          <SourceBadge source={run.source} />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <span className="flex items-center gap-1.5 font-bold text-surface-100 tabular-nums">
          <MapPin className="w-3.5 h-3.5 text-surface-500" />
          {formatDistanceKm(run.distance_km)}
        </span>
        <span className="flex items-center gap-1.5 text-sm text-surface-400 tabular-nums">
          <Clock className="w-3.5 h-3.5 text-surface-600" />
          {secondsToReadable(run.duration_seconds)}
        </span>
        {run.avg_pace_seconds_per_km && (
          <PaceBadge paceSeconds={run.avg_pace_seconds_per_km} />
        )}
        {run.avg_hr && (
          <span className="flex items-center gap-1 text-xs text-surface-500">
            <Heart className="w-3 h-3" /> {run.avg_hr} bpm
          </span>
        )}
        {run.elevation_gain_m && (
          <span className="flex items-center gap-1 text-xs text-surface-500">
            <Mountain className="w-3 h-3" /> {run.elevation_gain_m}m
          </span>
        )}
        {run.coach_feedback && (
          <span className="flex items-center gap-1 text-xs text-purple-400">
            <MessageSquare className="w-3 h-3" /> Análise
          </span>
        )}
      </div>

      {/* Tags */}
      {run.tags && run.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {run.tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
        </div>
      )}

      {/* Notes preview */}
      {run.notes && (
        <p className="text-xs text-surface-500 mt-2 line-clamp-2">{run.notes}</p>
      )}
    </Link>
  );
}
