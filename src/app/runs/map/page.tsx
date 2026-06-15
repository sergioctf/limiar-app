import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { RunsWorldMap, type RunPin } from "@/components/runs/RunsWorldMap";

export const metadata = { title: "Mapa de corridas — Limiar" };

export default async function RunsMapPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: runs } = await supabase
    .from("runs")
    .select("id, name, date, distance_km, map_polyline")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .not("map_polyline", "is", null)
    .order("date", { ascending: false });

  const pins: RunPin[] = (runs ?? [])
    .filter(r => r.map_polyline)
    .map(r => ({
      id: r.id,
      name: r.name,
      date: r.date,
      distanceKm: r.distance_km,
      polyline: r.map_polyline as string,
    }));

  return (
    <AppShell>
      <div className="space-y-4 max-w-5xl mx-auto animate-fade-in">
        <div>
          <Link href="/runs" className="inline-flex items-center gap-1 text-sm text-surface-400 hover:text-surface-200 transition-colors mb-1">
            <ChevronLeft className="w-4 h-4" /> Corridas
          </Link>
          <h1 className="page-header">Onde você correu</h1>
          <p className="text-surface-500 text-sm">Cada ponto é o início de uma corrida — clique para abrir.</p>
        </div>
        <RunsWorldMap runs={pins} />
      </div>
    </AppShell>
  );
}
