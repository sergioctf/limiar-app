"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Dot
} from "recharts";
import { formatDateShort } from "@/lib/utils";
import type { Run } from "@/types";

export function HeartRateTrendChart({ runs, height = 260 }: { runs: Run[]; height?: number }) {
  const data = runs
    .filter((r) => r.avg_hr)
    .map((r) => ({ date: r.date, hr: r.avg_hr, name: r.name }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const CustomTooltip = ({ active, payload }: {
    active?: boolean;
    payload?: Array<{ value: number; payload: typeof data[0] }>;
  }) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-surface-700 border border-surface-600 rounded-xl p-3 text-xs shadow-xl">
          <p className="font-semibold text-surface-200 mb-1">{formatDateShort(d.date)}</p>
          <p className="text-red-300 font-bold tabular-nums">{d.hr} bpm</p>
          <p className="text-surface-500 line-clamp-1">{d.name}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
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
          domain={["auto", "auto"]}
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="hr"
          stroke="#ef4444"
          strokeWidth={2}
          dot={<Dot r={3} fill="#ef4444" />}
          activeDot={{ r: 5, fill: "#ef4444" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
