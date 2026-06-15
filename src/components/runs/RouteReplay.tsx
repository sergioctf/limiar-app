"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RotateCcw, MapPin, Map as MapIcon } from "lucide-react";
import { decodePolyline, projectToSvg, type LatLng } from "@/lib/polyline";

interface Props {
  polyline: string | null | undefined;
  distanceKm: number;
  /** high-fidelity GPS track from streams; preferred over the summary polyline */
  latlng?: Array<[number, number]> | null;
}

const SIZE = 320;
const DURATION_MS = 6000; // full replay length

export function RouteReplay({ polyline, distanceKm, latlng }: Props) {
  const projected = useMemo(() => {
    // Prefer the real per-point GPS track when available (streams); the
    // summary polyline is a simplified fallback.
    const pts: LatLng[] = latlng && latlng.length > 1
      ? (latlng as LatLng[])
      : decodePolyline(polyline ?? "");
    return projectToSvg(pts, SIZE);
  }, [polyline, latlng]);

  const pathRef = useRef<SVGPathElement>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  const [progress, setProgress] = useState(0); // 0..1
  const [playing, setPlaying] = useState(false);
  const [totalLen, setTotalLen] = useState(0);

  useEffect(() => {
    if (pathRef.current) setTotalLen(pathRef.current.getTotalLength());
  }, [projected]);

  // Animation loop
  useEffect(() => {
    if (!playing) return;

    function tick(ts: number) {
      if (startRef.current === null) {
        // resume from current progress
        startRef.current = ts - progress * DURATION_MS;
      }
      const elapsed = ts - startRef.current;
      const p = Math.min(1, elapsed / DURATION_MS);
      setProgress(p);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
        startRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  if (!projected) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <MapIcon className="w-4 h-4 text-surface-500" />
          <h2 className="section-title">Trajeto</h2>
        </div>
        <p className="text-sm text-surface-500 py-6 text-center">
          Sem dados de GPS para esta corrida.
        </p>
      </div>
    );
  }

  const marker = (() => {
    if (!pathRef.current || totalLen === 0) return projected.points[0];
    const pt = pathRef.current.getPointAtLength(progress * totalLen);
    return { x: pt.x, y: pt.y };
  })();

  const dashOffset = totalLen * (1 - progress);
  const start = projected.points[0];
  const finish = projected.points[projected.points.length - 1];

  function handlePlay() {
    if (progress >= 1) { setProgress(0); startRef.current = null; }
    else startRef.current = null; // recompute baseline on resume
    setPlaying(p => !p);
  }

  function handleReset() {
    setPlaying(false);
    setProgress(0);
    startRef.current = null;
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

      {/* SVG route */}
      <div className="relative rounded-xl bg-surface-700/30 overflow-hidden">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto" style={{ maxHeight: 360 }}>
          {/* Faint full route */}
          <path
            d={projected.pathD}
            fill="none"
            stroke="currentColor"
            className="text-surface-600"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Animated progress path */}
          <path
            ref={pathRef}
            d={projected.pathD}
            fill="none"
            stroke="currentColor"
            className="text-brand-400"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: totalLen,
              strokeDashoffset: dashOffset,
            }}
          />
          {/* Start marker */}
          <circle cx={start.x} cy={start.y} r={5} className="fill-green-400" stroke="#0a0a0a" strokeWidth={1.5} />
          {/* Finish marker */}
          <circle cx={finish.x} cy={finish.y} r={5} className="fill-red-400" stroke="#0a0a0a" strokeWidth={1.5} />
          {/* Moving marker */}
          <circle cx={marker.x} cy={marker.y} r={6} className="fill-brand-300" stroke="#0a0a0a" strokeWidth={2}>
            <animate attributeName="opacity" values="1;0.6;1" dur="1.2s" repeatCount="indefinite" />
          </circle>
        </svg>

        {/* Legend */}
        <div className="absolute top-2 left-2 flex items-center gap-2 text-[10px] text-surface-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" />início</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />fim</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handlePlay}
          className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-400 text-white flex items-center justify-center transition-colors active:scale-95 shrink-0"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        <button
          onClick={handleReset}
          title="Reiniciar"
          className="w-9 h-9 rounded-full bg-surface-700 hover:bg-surface-600 text-surface-300 flex items-center justify-center transition-colors active:scale-95 shrink-0"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={e => {
            setPlaying(false);
            startRef.current = null;
            setProgress(Number(e.target.value) / 1000);
          }}
          className="flex-1 accent-brand-500 h-1.5"
        />

        <span className="text-xs text-surface-500 tabular-nums w-12 text-right shrink-0 flex items-center justify-end gap-1">
          <MapPin className="w-3 h-3" />{Math.round(progress * distanceKm * 10) / 10}
        </span>
      </div>
    </div>
  );
}
