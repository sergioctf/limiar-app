"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { DayRecovery } from "@/lib/health-view";

const WEEKDAY = ["D", "S", "T", "Q", "Q", "S", "S"];
const DOT: Record<string, string> = { alta: "#34d399", moderada: "#fbbf24", baixa: "#f87171" };

/**
 * Training load against recovery, two weeks side by side.
 *
 * This is the chart that makes the score make sense. A single morning's number
 * is easy to dismiss; the same number sitting the day after the week's
 * heaviest bar, and climbing back over the rest days that followed, is a lesson
 * about how this particular body absorbs work — which no generic advice can
 * teach.
 */
export function LoadRecoveryChart({ history }: { history: DayRecovery[] }) {
  const data = history.map((d, i) => ({
    ...d,
    tick: WEEKDAY[new Date(`${d.date}T12:00:00Z`).getUTCDay()],
    isToday: i === history.length - 1,
  }));
  const maxLoad = Math.max(40, ...data.map(d => d.load));
  const scored = data.filter(d => d.score != null).length;

  if (scored === 0 && data.every(d => d.load === 0)) {
    return (
      <p className="rounded-2xl border border-surface-700 bg-surface-800 p-4 text-sm text-surface-500">
        Sem treinos nem leituras nas últimas duas semanas.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-surface-700 bg-surface-800 p-4">
      <div className="flex items-center gap-4 text-[11px] text-surface-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-surface-600" /> Carga do dia</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 rounded bg-emerald-400" /> Recuperação</span>
      </div>

      <div className="mt-2 -ml-3">
        <ResponsiveContainer width="100%" height={170}>
          <ComposedChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
            <XAxis dataKey="tick" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
            <YAxis yAxisId="load" hide domain={[0, maxLoad * 1.6]} />
            {/*
              A 0–100 axis flattened a week of 80s and 90s into a straight line
              along the top. Starting just below the lowest score keeps the
              recovery dip after a hard day visible, which is the whole point.
            */}
            <YAxis yAxisId="score" hide domain={[(min: number) => Math.max(0, Math.floor(min - 20)), 100]} />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.08)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as DayRecovery;
                return (
                  <div className="rounded-xl border border-surface-600 bg-surface-700 px-3 py-2 text-xs shadow-xl">
                    <p className="text-surface-400">{p.date.slice(8, 10)}/{p.date.slice(5, 7)}</p>
                    <p className="font-bold text-surface-100">
                      Recuperação {p.score ?? "—"}
                      {p.score != null && !p.hasWatch && <span className="font-normal text-surface-400"> (só carga)</span>}
                    </p>
                    <p className="text-surface-400">Carga {p.load}</p>
                  </div>
                );
              }}
            />
            <Bar yAxisId="load" dataKey="load" radius={[5, 5, 0, 0]} maxBarSize={18} animationDuration={700}>
              {data.map(d => (
                <Cell key={d.date} fill={d.isToday ? "#f97316" : "#475569"} fillOpacity={d.isToday ? 0.9 : 0.55} />
              ))}
            </Bar>
            <Line
              yAxisId="score" type="monotone" dataKey="score" stroke="#34d399" strokeWidth={2.5} connectNulls
              animationDuration={1100}
              dot={(props: { cx?: number; cy?: number; payload?: DayRecovery; index?: number }) => {
                const { cx, cy, payload, index } = props;
                if (cx == null || cy == null || payload?.score == null) return <g key={`d-${index}`} />;
                return (
                  <circle
                    key={`d-${index}`} cx={cx} cy={cy} r={3.5}
                    fill={DOT[payload.verdict ?? "moderada"]}
                    stroke="rgb(var(--color-surface-800))" strokeWidth={1.5}
                  />
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
