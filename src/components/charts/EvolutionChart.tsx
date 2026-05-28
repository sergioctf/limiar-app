"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { secondsToPaceString, formatDateShort } from "@/lib/utils";
import type { Run } from "@/types";

type DistanceRange = "5-8" | "8-12" | "12-16" | "16+";

const RANGES: { key: DistanceRange; label: string; min: number; max: number }[] = [
  { key: "5-8",   label: "5–8 km",   min: 5,  max: 8   },
  { key: "8-12",  label: "8–12 km",  min: 8,  max: 12  },
  { key: "12-16", label: "12–16 km", min: 12, max: 16  },
  { key: "16+",   label: "16+ km",   min: 16, max: 9999 },
];

// ─── Pace tooltip ────────────────────────────────────────────────────────────
const PaceTooltip = ({
  active, payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { date: string; pace: number; distance: number; name: string } }>;
}) => {
  if (active && payload?.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-surface-700 border border-surface-600 rounded-xl p-3 text-xs shadow-xl">
        <p className="font-semibold text-surface-200 mb-1">{formatDateShort(d.date)}</p>
        <p className="text-surface-400 text-[10px] line-clamp-1 mb-1">{d.name}</p>
        <p className="text-brand-300 font-bold tabular-nums font-mono">
          {secondsToPaceString(d.pace)}/km
        </p>
        <p className="text-surface-500">{d.distance.toFixed(1)} km</p>
      </div>
    );
  }
  return null;
};

// ─── HR tooltip ──────────────────────────────────────────────────────────────
const HRTooltip = ({
  active, payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { date: string; hr: number; distance: number } }>;
}) => {
  if (active && payload?.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-surface-700 border border-surface-600 rounded-xl p-3 text-xs shadow-xl">
        <p className="font-semibold text-surface-200 mb-1">{formatDateShort(d.date)}</p>
        <p className="text-red-300 font-bold tabular-nums">
          {d.hr} bpm
        </p>
        <p className="text-surface-500">{d.distance.toFixed(1)} km</p>
      </div>
    );
  }
  return null;
};

// ─── Main component ──────────────────────────────────────────────────────────
export function EvolutionChart({ runs, height = 220 }: { runs: Run[]; height?: number }) {
  const [range, setRange] = useState<DistanceRange>("8-12");

  const selectedRange = RANGES.find((r) => r.key === range)!;

  const filtered = useMemo(() => {
    return runs
      .filter(
        (r) =>
          r.distance_km >= selectedRange.min &&
          r.distance_km < selectedRange.max &&
          r.avg_pace_seconds_per_km
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [runs, selectedRange]);

  const paceData = filtered.map((r) => ({
    date: r.date,
    pace: r.avg_pace_seconds_per_km!,
    distance: r.distance_km,
    name: r.name,
  }));

  const hrData = filtered
    .filter((r) => r.avg_hr)
    .map((r) => ({
      date: r.date,
      hr: r.avg_hr!,
      distance: r.distance_km,
    }));

  // Compute pace avg for reference line
  const avgPace =
    paceData.length > 0
      ? Math.round(paceData.reduce((s, d) => s + d.pace, 0) / paceData.length)
      : null;

  const hasHR = hrData.length >= 2;
  const avgHR =
    hrData.length > 0
      ? Math.round(hrData.reduce((s, d) => s + d.hr, 0) / hrData.length)
      : null;

  const paceFastest = paceData.length ? Math.min(...paceData.map((d) => d.pace)) : 0;
  const paceSlowest = paceData.length ? Math.max(...paceData.map((d) => d.pace)) : 0;
  const paceYMin = Math.floor(paceFastest / 30) * 30 - 30;
  const paceYMax = Math.ceil(paceSlowest / 30) * 30 + 30;

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex gap-1.5 flex-wrap">
        {RANGES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              range === key
                ? "bg-brand-500 text-white shadow"
                : "bg-surface-700 text-surface-400 hover:text-surface-200"
            }`}
          >
            {label}
          </button>
        ))}
        {paceData.length > 0 && (
          <span className="ml-auto text-xs text-surface-500 self-center">
            {paceData.length} corrida{paceData.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {paceData.length < 2 ? (
        <div className="flex flex-col items-center justify-center py-12 text-surface-500">
          <p className="text-sm font-medium">Poucas corridas nessa faixa</p>
          <p className="text-xs mt-1">Selecione outro intervalo de distância</p>
        </div>
      ) : (
        <>
          {/* Pace evolution */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-200">Evolução do pace</h3>
              {avgPace && (
                <span className="text-xs text-surface-500">
                  Média: <span className="text-brand-400 font-mono font-bold">{secondsToPaceString(avgPace)}/km</span>
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={height}>
              <LineChart data={paceData} margin={{ top: 4, right: 4, left: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(71,85,105,0.4)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatDateShort(v)}
                  interval={Math.max(0, Math.floor(paceData.length / 6) - 1)}
                />
                <YAxis
                  domain={[paceYMin, paceYMax]}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => secondsToPaceString(v)}
                  reversed
                />
                <Tooltip content={<PaceTooltip />} />
                {avgPace && (
                  <ReferenceLine
                    y={avgPace}
                    stroke="#f97316"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="pace"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#f97316", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#f97316" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* HR evolution (only if data available) */}
          {hasHR && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-semibold text-surface-200">FC média</h3>
                {avgHR && (
                  <span className="text-xs text-surface-500">
                    Média: <span className="text-red-400 font-bold">{avgHR} bpm</span>
                  </span>
                )}
              </div>
              <ResponsiveContainer width="100%" height={height}>
                <LineChart data={hrData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(71,85,105,0.4)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatDateShort(v)}
                    interval={Math.max(0, Math.floor(hrData.length / 6) - 1)}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    unit=" bpm"
                  />
                  <Tooltip content={<HRTooltip />} />
                  {avgHR && (
                    <ReferenceLine
                      y={avgHR}
                      stroke="#f87171"
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="hr"
                    stroke="#f87171"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#f87171", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#f87171" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
