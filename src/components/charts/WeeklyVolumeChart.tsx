"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import type { WeeklyVolume } from "@/types";

interface Props {
  data: WeeklyVolume[];
  height?: number;
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: WeeklyVolume }>;
  label?: string;
}) => {
  if (active && payload?.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-surface-700 border border-surface-600 rounded-xl p-3 text-xs shadow-xl">
        <p className="font-semibold text-surface-200 mb-1">{label}</p>
        <p className="text-brand-300 font-bold tabular-nums">{d.totalKm.toFixed(1)} km</p>
        <p className="text-surface-500">{d.runs} corrida{d.runs !== 1 ? "s" : ""}</p>
      </div>
    );
  }
  return null;
};

export function WeeklyVolumeChart({ data, height = 180 }: Props) {
  const max = Math.max(...data.map((d) => d.totalKm));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(71,85,105,0.4)"
          vertical={false}
        />
        <XAxis
          dataKey="weekLabel"
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval={data.length > 8 ? 1 : 0}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}k`}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(249,115,22,0.08)" }} />
        <Bar dataKey="totalKm" radius={[6, 6, 0, 0]} maxBarSize={40}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.totalKm === max ? "#f97316" : "#334155"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
