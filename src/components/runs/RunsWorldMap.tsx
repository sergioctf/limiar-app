"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin } from "lucide-react";
import { decodePolyline, type LatLng } from "@/lib/polyline";
import "leaflet/dist/leaflet.css";

export interface RunPin {
  id: string;
  name: string;
  date: string;
  distanceKm: number;
  polyline: string;
}

interface Props {
  runs: RunPin[];
}

export function RunsWorldMap({ runs }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [located, setLocated] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // Derive each run's start point from its summary polyline
    const decoded = runs
      .map(r => ({ run: r, pts: decodePolyline(r.polyline) }))
      .filter(d => d.pts.length > 1);

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: true, worldCopyJump: true });
      mapRef.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO", maxZoom: 19,
      }).addTo(map);

      const allStarts: LatLng[] = [];

      for (const { run, pts } of decoded) {
        const start = pts[0];
        allStarts.push(start);

        // Faint full route
        L.polyline(pts, { color: "#f97316", weight: 2, opacity: 0.35 }).addTo(map);

        // Clickable start pin
        const marker = L.circleMarker(start, {
          radius: 5, color: "#0a0a0a", weight: 1.5, fillColor: "#fb923c", fillOpacity: 1,
        }).addTo(map);
        marker.bindTooltip(
          `<strong>${run.name}</strong><br/>${new Date(`${run.date}T12:00:00`).toLocaleDateString("pt-BR")} · ${run.distanceKm.toFixed(1)} km`,
          { direction: "top", offset: [0, -4] },
        );
        marker.on("click", () => router.push(`/runs/${run.id}`));
      }

      if (allStarts.length > 0) {
        map.fitBounds(L.latLngBounds(allStarts), { padding: [40, 40], maxZoom: 14 });
      } else {
        map.setView([-15.78, -47.93], 4); // Brazil default
      }

      setLocated(allStarts.length);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [runs, router]);

  return (
    <div className="card p-0 overflow-hidden relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-800/60">
          <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        </div>
      )}
      <div ref={containerRef} className="w-full z-0" style={{ height: "min(70vh, 620px)" }} />
      {!loading && (
        <div className="absolute bottom-3 left-3 z-[400] bg-surface-900/80 backdrop-blur rounded-lg px-3 py-1.5 text-xs text-surface-300 flex items-center gap-1.5 pointer-events-none">
          <MapPin className="w-3.5 h-3.5 text-brand-400" />
          {located} corrida{located !== 1 ? "s" : ""} com GPS
        </div>
      )}
    </div>
  );
}
