/**
 * An activity of any sport in the history — the same shape and the same path
 * as a run (18/09: every sport opens its own page; none of them is "less of
 * the product" than running).
 */
import Link from "next/link";
import { Clock, Flame, Heart, MapPin } from "lucide-react";
import { SportGlyph } from "@/components/shared/SportGlyph";
import { SPORTS, toSportKey } from "@/lib/sports";
import { formatDate } from "@/lib/utils";

export interface HistoryActivity {
  id: string;
  date: string;
  name: string | null;
  sport_type: string;
  duration_seconds: number | null;
  distance_m: number | null;
  calories: number | null;
  avg_hr: number | null;
  source?: string | null;
}

const minutes = (s: number | null) => {
  if (!s) return null;
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} min`;
};

export function activityLabel(a: Pick<HistoryActivity, "sport_type">): string {
  const key = toSportKey(a.sport_type);
  return key ? SPORTS[key].label : a.sport_type;
}

export function ActivityCard({ activity: a }: { activity: HistoryActivity }) {
  const sport = toSportKey(a.sport_type);
  const km = a.distance_m && a.distance_m > 0 ? a.distance_m / 1000 : null;
  return (
    <Link href={`/activities/${a.id}`} className="card-hover p-4 block animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-surface-700/60 text-brand-400 flex items-center justify-center shrink-0">
          <SportGlyph sport={sport} className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-surface-100 text-sm truncate">{a.name || activityLabel(a)}</p>
          <p className="text-xs text-surface-500">{activityLabel(a)} · {formatDate(a.date)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {minutes(a.duration_seconds) && (
          <span className="flex items-center gap-1.5 font-bold text-surface-100 tabular-nums">
            <Clock className="w-3.5 h-3.5 text-surface-500" /> {minutes(a.duration_seconds)}
          </span>
        )}
        {km != null && (
          <span className="flex items-center gap-1.5 text-sm text-surface-400 tabular-nums">
            <MapPin className="w-3.5 h-3.5 text-surface-500" /> {km.toFixed(1).replace(".", ",")} km
          </span>
        )}
        {a.calories != null && a.calories > 0 && (
          <span className="flex items-center gap-1 text-xs text-surface-500">
            <Flame className="w-3 h-3" /> {Math.round(a.calories)} kcal
          </span>
        )}
        {a.avg_hr != null && (
          <span className="flex items-center gap-1 text-xs text-surface-500">
            <Heart className="w-3 h-3" /> {a.avg_hr} bpm
          </span>
        )}
      </div>
    </Link>
  );
}
