"use client";

import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TrendingUp } from "lucide-react";
import type { DailyLoad } from "@/lib/training-load";
import { tsbLabel } from "@/lib/training-load";

interface Props {
  data: DailyLoad[];
}

// Format date for chart axis: "15/mai"
function fmtDateAxis(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

// Custom tooltip
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const date = label ? new Date(label + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "numeric", month: "short"
  }) : "";
  const ctlEntry  = payload.find(p => p.name === "ctl");
  const atlEntry  = payload.find(p => p.name === "atl");
  const tsbEntry  = payload.find(p => p.name === "tsb");
  const tsb = tsbEntry?.value ?? 0;
  const { color } = tsbLabel(tsb);

  return (
    <div className="bg-surface-700 border border-surface-600 rounded-xl p-3 text-xs shadow-xl min-w-[130px]">
      <p className="font-semibold text-surface-300 mb-2">{date}</p>
      {ctlEntry && (
        <div className="flex justify-between gap-4 mb-1">
          <span className="text-blue-400">Fitness</span>
          <span className="font-bold text-surface-100 tabular-nums">{ctlEntry.value.toFixed(0)}</span>
        </div>
      )}
      {atlEntry && (
        <div className="flex justify-between gap-4 mb-1">
          <span className="text-orange-400">Fadiga</span>
          <span className="font-bold text-surface-100 tabular-nums">{atlEntry.value.toFixed(0)}</span>
        </div>
      )}
      {tsbEntry && (
        <div className="flex justify-between gap-4 border-t border-surface-600 mt-1.5 pt-1.5">
          <span className="text-surface-400">Forma</span>
          <span className={`font-bold tabular-nums ${color}`}>
            {tsb >= 0 ? "+" : ""}{tsb.toFixed(0)}
          </span>
        </div>
      )}
    </div>
  );
}

export function FitnessCard({ data }: Props) {
  if (data.length === 0) return null;

  const latest  = data[data.length - 1];
  const { label: formLabel, color: formColor, bg: formBg } = tsbLabel(latest.tsb);

  // Sample data for display: show every 3rd point to keep chart clean
  const chartData = data.filter((_, i) => i % 2 === 0 || i === data.length - 1);

  // TSB chart data (bar-like, showing form)
  const tsbColor = (v: number) =>
    v > 5 ? "#22c55e" : v > -10 ? "#84cc16" : v > -25 ? "#eab308" : "#f97316";

  return (
    <div className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="font-bold text-surface-100">Carga de treino</h2>
            <p className="text-xs text-surface-500">CTL · ATL · TSB — últimos 90 dias</p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${formBg} ${formColor}`}>
          {formLabel}
        </span>
      </div>

      {/* Current values */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold mb-1">Fitness</p>
          <p className="text-2xl font-black text-blue-300 tabular-nums">{latest.ctl.toFixed(0)}</p>
          <p className="text-[10px] text-surface-500 mt-0.5">CTL</p>
        </div>
        <div className="bg-orange-500/8 border border-orange-500/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-orange-400 uppercase tracking-wider font-semibold mb-1">Fadiga</p>
          <p className="text-2xl font-black text-orange-300 tabular-nums">{latest.atl.toFixed(0)}</p>
          <p className="text-[10px] text-surface-500 mt-0.5">ATL</p>
        </div>
        <div className={`border rounded-xl p-3 text-center ${formBg} border-current/20`}>
          <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${formColor}`}>Forma</p>
          <p className={`text-2xl font-black tabular-nums ${formColor}`}>
            {latest.tsb >= 0 ? "+" : ""}{latest.tsb.toFixed(0)}
          </p>
          <p className="text-[10px] text-surface-500 mt-0.5">TSB</p>
        </div>
      </div>

      {/* CTL + ATL chart */}
      <div>
        <p className="text-[10px] text-surface-500 mb-2 uppercase tracking-wide">Fitness vs Fadiga</p>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id="ctlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(71,85,105,0.3)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDateAxis}
              tick={{ fill: "#64748b", fontSize: 9 }}
              tickLine={false} axisLine={false}
              interval={Math.floor(chartData.length / 4)}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 9 }}
              tickLine={false} axisLine={false}
              tickFormatter={v => Math.round(v).toString()}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone" dataKey="ctl" name="ctl"
              stroke="#3b82f6" strokeWidth={2}
              fill="url(#ctlGrad)"
              dot={false} activeDot={{ r: 3, fill: "#3b82f6" }}
            />
            <Line
              type="monotone" dataKey="atl" name="atl"
              stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 2"
              dot={false} activeDot={{ r: 3, fill: "#f97316" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* TSB bar chart */}
      <div>
        <p className="text-[10px] text-surface-500 mb-2 uppercase tracking-wide">Forma (TSB)</p>
        <ResponsiveContainer width="100%" height={70}>
          <AreaChart data={chartData} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id="tsbPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="tsbNeg" x1="0" y1="1" x2="0" y2="0">
                <stop offset="5%"  stopColor="#f97316" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(71,85,105,0.3)" vertical={false} />
            <XAxis dataKey="date" hide />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 9 }}
              tickLine={false} axisLine={false}
              tickFormatter={v => v > 0 ? `+${v}` : `${v}`}
            />
            <ReferenceLine y={0} stroke="rgba(100,116,139,0.5)" strokeDasharray="4 2" />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone" dataKey="tsb" name="tsb"
              stroke={latest.tsb >= 0 ? "#22c55e" : "#f97316"}
              strokeWidth={1.5}
              fill={latest.tsb >= 0 ? "url(#tsbPos)" : "url(#tsbNeg)"}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-surface-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-blue-500 inline-block rounded" /> CTL = Fitness crônico
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-orange-400 inline-block rounded" style={{ background: "repeating-linear-gradient(90deg,#f97316 0,#f97316 4px,transparent 4px,transparent 6px)" }} /> ATL = Fadiga aguda
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-green-500 inline-block rounded" /> TSB = Forma
        </span>
      </div>
    </div>
  );
}
