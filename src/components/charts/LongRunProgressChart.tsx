"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";
import { formatDateShort, secondsToPaceString } from "@/lib/utils";
import type { Run } from "@/types";

const CustomTooltip = ({ active, payload }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: Run }>;
}) => {
  if (active && payload?.length) {
    const r = payload[0].payload;
    return (
      <div className="bg-surface-700 border border-surface-600 rounded-xl p-3 text-xs shadow-xl">
        <p className="font-semibold text-surface-200 mb-1">{formatDateShort(r.date)}</p>
        <p className="text-blue-300 font-bold tabular-nums">{r.distance_km.toFixed(2)} km</p>
        {r.avg_pace_seconds_per_km && (
          <p className="text-brand-300 font-mono">{secondsToPaceString(r.avg_pace_seconds_per_km)}/km</p>
        )}
      </div>
    );
  }
  return null;
};

export function LongRunProgressChart({ runs, height = 260 }: { runs: Run[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={runs} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="longrunGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(71,85,105,0.4)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatDateShort(v)}
          interval={Math.max(0, Math.floor(runs.length / 6) - 1)}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}km`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="distance_km"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#longrunGrad)"
          dot={{ fill: "#3b82f6", r: 3 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
