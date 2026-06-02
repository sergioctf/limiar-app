"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from "recharts";
import type { PerformanceTest } from "@/types";

interface Props {
  tests: PerformanceTest[];
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short",
  }).replace(".", "");
}

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: PerformanceTest & { vdotDisplay: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const t = payload[0].payload;
  return (
    <div className="bg-surface-700 border border-surface-600 rounded-xl p-3 text-xs shadow-xl">
      <p className="font-semibold text-surface-300 mb-1.5">{fmtDate(t.test_date)}</p>
      <p className="text-brand-300 font-black text-lg tabular-nums">
        {t.vdotDisplay?.toFixed(1)}
      </p>
      <p className="text-surface-500">VDOT</p>
      {t.distance_km && t.time_seconds && (
        <p className="text-surface-400 mt-1">
          {t.distance_km}km em {Math.floor(t.time_seconds/60)}:{String(t.time_seconds%60).padStart(2,"0")}
        </p>
      )}
    </div>
  );
}

export function VdotEvolutionChart({ tests }: Props) {
  if (tests.length < 2) return null;

  const data = [...tests]
    .filter(t => t.vdot != null)
    .sort((a, b) => a.test_date.localeCompare(b.test_date))
    .map(t => ({ ...t, vdotDisplay: t.vdot! }));

  if (data.length < 2) return null;

  const vdotValues = data.map(d => d.vdotDisplay);
  const minVdot = Math.floor(Math.min(...vdotValues)) - 2;
  const maxVdot = Math.ceil(Math.max(...vdotValues)) + 2;
  const latest  = data[data.length - 1];
  const first   = data[0];
  const delta   = latest.vdotDisplay - first.vdotDisplay;

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-surface-100">Evolução VDOT</h3>
          <p className="text-xs text-surface-500">{data.length} testes · {fmtDate(first.test_date)} → {fmtDate(latest.test_date)}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-brand-300 tabular-nums">
            {latest.vdotDisplay.toFixed(1)}
          </p>
          <p className={`text-xs font-semibold tabular-nums ${delta >= 0 ? "text-green-400" : "text-red-400"}`}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(1)} total
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="vdotGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f97316" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(71,85,105,0.3)" vertical={false} />
          <XAxis
            dataKey="test_date"
            tickFormatter={fmtDate}
            tick={{ fill: "#64748b", fontSize: 9 }}
            tickLine={false} axisLine={false}
          />
          <YAxis
            domain={[minVdot, maxVdot]}
            tick={{ fill: "#64748b", fontSize: 9 }}
            tickLine={false} axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone" dataKey="vdotDisplay" name="vdot"
            stroke="#f97316" strokeWidth={2.5}
            fill="url(#vdotGrad)"
            dot={{ r: 4, fill: "#f97316", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#fb923c" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
