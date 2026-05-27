"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Dot
} from "recharts";
import { secondsToPaceString, formatDateShort } from "@/lib/utils";
import type { PaceTrend } from "@/types";

const CustomTooltip = ({ active, payload }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: PaceTrend }>;
}) => {
  if (active && payload?.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-surface-700 border border-surface-600 rounded-xl p-3 text-xs shadow-xl">
        <p className="font-semibold text-surface-200 mb-1">{formatDateShort(d.date)}</p>
        <p className="text-brand-300 font-bold tabular-nums font-mono">
          {secondsToPaceString(d.pace)}/km
        </p>
        <p className="text-surface-500">{d.distance.toFixed(1)} km</p>
      </div>
    );
  }
  return null;
};

export function PaceTrendChart({ data, height = 260 }: { data: PaceTrend[]; height?: number }) {
  // Invert for display (lower pace = better = show higher on chart)
  const chartData = data.map((d) => ({ ...d, displayPace: d.pace }));
  const fastest = Math.min(...data.map((d) => d.pace));
  const slowest = Math.max(...data.map((d) => d.pace));
  const yMin = Math.floor(fastest / 30) * 30 - 30;
  const yMax = Math.ceil(slowest / 30) * 30 + 30;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(71,85,105,0.4)" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatDateShort(v)}
          interval={Math.floor(data.length / 6)}
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => secondsToPaceString(v)}
          reversed
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="displayPace"
          stroke="#f97316"
          strokeWidth={2}
          dot={<Dot r={3} fill="#f97316" />}
          activeDot={{ r: 5, fill: "#f97316" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
