"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Map as MapIcon, MapPin } from "lucide-react";
import { decodePolyline, type LatLng } from "@/lib/polyline";
import type { Map as LeafletMap, Polyline, CircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  polyline: string | null | undefined;
  distanceKm: number;
  /** high-fidelity GPS track from streams; preferred over the summary polyline */
  latlng?: Array<[number, number]> | null;
}

const DURATION_MS = 6000;

export function RouteMap({ polyline, distanceKm, latlng }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const traveledRef = useRef<Polyline | null>(null);
  const ptsRef = useRef<LatLng[]>([]);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [hasRoute, setHasRoute] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1

  // Initialise the Leaflet map once (client-only, dynamic import avoids SSR)
  useEffect(() => {
    let cancelled = false;
    const pts: LatLng[] = latlng && latlng.length > 1 ? (latlng as LatLng[]) : decodePolyline(polyline ?? "");
    ptsRef.current = pts;
    if (pts.length < 2) { setHasRoute(false); return; }

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19,
      }).addTo(map);

      // Full route (faint) + traveled overlay (bright)
      L.polyline(pts, { color: "#52525b", weight: 4, opacity: 0.6 }).addTo(map);
      traveledRef.current = L.polyline([pts[0]], { color: "#f97316", weight: 4 }).addTo(map);

      // Start (green) and finish (red) markers
      L.circleMarker(pts[0], { radius: 6, color: "#0a0a0a", weight: 2, fillColor: "#34d399", fillOpacity: 1 }).addTo(map);
      L.circleMarker(pts[pts.length - 1], { radius: 6, color: "#0a0a0a", weight: 2, fillColor: "#f87171", fillOpacity: 1 }).addTo(map);

      // Moving marker for replay
      markerRef.current = L.circleMarker(pts[0], { radius: 7, color: "#0a0a0a", weight: 2, fillColor: "#fb923c", fillOpacity: 1 }).addTo(map);

      map.fitBounds(L.polyline(pts).getBounds(), { padding: [24, 24] });
      setReady(true);
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [polyline, latlng]);

  // Position the marker + traveled line at a given progress (0..1)
  function applyProgress(p: number) {
    const pts = ptsRef.current;
    if (pts.length < 2 || !markerRef.current || !traveledRef.current) return;
    const idx = Math.min(pts.length - 1, Math.floor(p * (pts.length - 1)));
    markerRef.current.setLatLng(pts[idx]);
    traveledRef.current.setLatLngs(pts.slice(0, idx + 1));
  }

  // Animation loop
  useEffect(() => {
    if (!playing) return;
    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts - progress * DURATION_MS;
      const elapsed = ts - startRef.current;
      const p = Math.min(1, elapsed / DURATION_MS);
      setProgress(p);
      applyProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else { setPlaying(false); startRef.current = null; }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); startRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  function handlePlay() {
    if (progress >= 1) { setProgress(0); applyProgress(0); }
    startRef.current = null;
    setPlaying(p => !p);
  }
  function handleReset() {
    setPlaying(false); setProgress(0); startRef.current = null; applyProgress(0);
  }

  if (!hasRoute) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <MapIcon className="w-4 h-4 text-surface-500" />
          <h2 className="section-title">Trajeto</h2>
        </div>
        <p className="text-sm text-surface-500 py-6 text-center">Sem dados de GPS para esta corrida.</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapIcon className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Trajeto</h2>
        </div>
        <span className="text-xs text-surface-500">{distanceKm.toFixed(1)} km</span>
      </div>

      <div ref={containerRef} className="w-full rounded-xl overflow-hidden bg-surface-700/30 z-0" style={{ height: 320 }} />

      {/* Controls */}
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handlePlay}
          disabled={!ready}
          className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-400 text-white flex items-center justify-center transition-colors active:scale-95 shrink-0 disabled:opacity-50"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <button
          onClick={handleReset}
          disabled={!ready}
          title="Reiniciar"
          className="w-9 h-9 rounded-full bg-surface-700 hover:bg-surface-600 text-surface-300 flex items-center justify-center transition-colors active:scale-95 shrink-0 disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <input
          type="range" min={0} max={1000} value={Math.round(progress * 1000)}
          onChange={e => { setPlaying(false); startRef.current = null; const p = Number(e.target.value) / 1000; setProgress(p); applyProgress(p); }}
          className="flex-1 accent-brand-500 h-1.5"
        />
        <span className="text-xs text-surface-500 tabular-nums w-12 text-right shrink-0 flex items-center justify-end gap-1">
          <MapPin className="w-3 h-3" />{Math.round(progress * distanceKm * 10) / 10}
        </span>
      </div>
    </div>
  );
}
