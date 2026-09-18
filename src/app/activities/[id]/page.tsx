/**
 * /activities/[id] — any sport's own page (18/09).
 *
 * A run opened its detail; every other sport opened the calendar. Now each
 * registered activity has a page like a run's: what it was, how long, how far,
 * what it cost, where it came from.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, Flame, Heart, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { SportGlyph } from "@/components/shared/SportGlyph";
import { DeleteActivityButton } from "@/components/runs/DeleteActivityButton";
import { SPORTS, activityCalories, toSportKey } from "@/lib/sports";
import { formatDate } from "@/lib/utils";

export default async function ActivityPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: a } = await supabase.from("activities")
    .select("id, date, name, sport_type, duration_seconds, distance_m, calories, avg_hr, source")
    .eq("id", params.id).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (!a) notFound();

  const sport = toSportKey(a.sport_type);
  const label = sport ? SPORTS[sport].label : a.sport_type;
  const minutes = a.duration_seconds ? Math.round(a.duration_seconds / 60) : null;
  const km = a.distance_m && a.distance_m > 0 ? a.distance_m / 1000 : null;
  const kcal = Math.round(activityCalories(a));
  const measured = a.calories != null && a.calories > 0;

  const stats = [
    minutes != null && { icon: Clock, label: "Duração", value: minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : `${minutes} min` },
    km != null && { icon: MapPin, label: "Distância", value: `${km.toFixed(2).replace(".", ",")} km` },
    kcal > 0 && { icon: Flame, label: measured ? "Calorias" : "Calorias (estimadas)", value: `${kcal} kcal` },
    a.avg_hr != null && { icon: Heart, label: "FC média", value: `${a.avg_hr} bpm` },
  ].filter(Boolean) as Array<{ icon: typeof Clock; label: string; value: string }>;

  return (
    <AppShell>
      <div className="space-y-5 max-w-2xl mx-auto animate-fade-in">
        <Link href={sport ? `/runs?sport=${sport}` : "/runs"} className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-surface-400 hover:text-surface-200">
          <ArrowLeft className="w-4 h-4" /> Histórico
        </Link>

        <div className="flex items-start gap-3">
          <span className="w-12 h-12 rounded-2xl bg-brand-500/15 text-brand-400 flex items-center justify-center shrink-0">
            <SportGlyph sport={sport} className="w-6 h-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-surface-100 leading-tight">{a.name || label}</h1>
            <p className="text-sm text-surface-500 mt-0.5">{label} · {formatDate(a.date)}{a.source === "strava" ? " · Strava" : ""}</p>
          </div>
        </div>

        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {stats.map(s => (
              <div key={s.label} className="card p-4">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-surface-500"><s.icon className="w-3.5 h-3.5" /> {s.label}</p>
                <p className="text-2xl font-black text-surface-100 tabular-nums mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/calendar" className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-brand-400">
            <CalendarDays className="w-4 h-4" /> Ver no calendário
          </Link>
          <DeleteActivityButton id={a.id} backTo={sport ? `/runs?sport=${sport}` : "/runs"} />
        </div>
      </div>
    </AppShell>
  );
}
