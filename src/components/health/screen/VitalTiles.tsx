"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, HeartPulse, Activity, Moon } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { Sparkline } from "@/components/ui/Ring";
import { TONE } from "@/components/ui/tone";
import { hoursLabel, SLEEP_TARGET_H, type Vital, type VitalKey } from "@/lib/health-view";

const ICON: Record<VitalKey, React.ReactNode> = {
  hrv:   <Activity className="w-3.5 h-3.5" />,
  rhr:   <HeartPulse className="w-3.5 h-3.5" />,
  sleep: <Moon className="w-3.5 h-3.5" />,
};

const fmt = (v: Vital, n: number | null) =>
  n == null ? "—" : v.key === "sleep" ? hoursLabel(n) : String(Math.round(n));

/** The change, in the unit a runner thinks in: % for HRV, beats for heart rate, minutes for sleep. */
function deltaLabel(v: Vital): string | null {
  if (v.value == null) return null;
  if (v.key === "sleep") {
    const gap = v.value - SLEEP_TARGET_H;
    return gap >= 0 ? "na meta" : `-${hoursLabel(-gap)}`;
  }
  if (v.calibrating || v.delta == null) return `calibrando ${v.nBaseline}/7`;
  if (v.key === "hrv") return `${Math.abs(Math.round((v.deltaPct ?? 0) * 100))}%`;
  return `${Math.abs(Math.round(v.delta))} bpm`;
}

/**
 * Three vitals, each against the athlete's own normal.
 *
 * A tile is a reading plus its direction plus its shape over two weeks — the
 * three things the eye needs to know whether to care. Tapping one opens the
 * month behind it, with the athlete's baseline drawn in, because "48 ms" only
 * means something next to the line it is above or below.
 */
export function VitalTiles({ vitals }: { vitals: Vital[] }) {
  const [open, setOpen] = useState<VitalKey | null>(null);
  const selected = vitals.find(v => v.key === open) ?? null;

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-2">
        {vitals.map(v => {
          const t = TONE[v.tone];
          const values = v.series.slice(-14).map(p => p.value).filter((x): x is number => x != null);
          const delta = deltaLabel(v);
          const up = v.delta != null && v.delta > 0;
          const active = open === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setOpen(active ? null : v.key)}
              aria-expanded={active}
              className={`rounded-2xl border bg-surface-800 p-3 text-left transition-all duration-300 active:scale-[0.97] ${
                active ? "border-brand-500/60 shadow-lg shadow-brand-500/10" : "border-surface-700 hover:border-surface-600"
              }`}
            >
              <span className="flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-surface-500">
                {ICON[v.key]} {v.label}
                {/* A reading carried over from yesterday says so — otherwise it reads as today's and the screen looks live when it is not. */}
                {v.valueDate && v.valueDate !== v.series[v.series.length - 1]?.date && (
                  <span className="ml-auto rounded bg-surface-700 px-1 py-px text-[9px] normal-case tracking-normal text-surface-400">ontem</span>
                )}
              </span>
              <span className="mt-2 block text-2xl font-black tabular-nums leading-none text-surface-100">
                {fmt(v, v.value)}
                {v.value != null && v.key !== "sleep" && (
                  <span className="ml-0.5 text-[11px] font-semibold text-surface-500">{v.unit}</span>
                )}
              </span>
              <span className={`mt-1.5 flex h-4 items-center gap-0.5 text-[11px] font-semibold tabular-nums ${v.calibrating && v.key !== "sleep" ? "text-surface-500" : t.text}`}>
                {delta && !v.calibrating && v.key !== "sleep" && (up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                {delta ?? (v.value == null ? "aguardando" : "")}
              </span>
              <span className="mt-2 block h-6">
                {values.length >= 2
                  ? <Sparkline values={values} tone={v.tone === "neutral" ? "brand" : v.tone} width={80} height={22} />
                  : <span className="block h-px w-full translate-y-3 bg-surface-700" />}
              </span>
            </button>
          );
        })}
      </div>

      {selected && <VitalDetail key={selected.key} vital={selected} />}
    </div>
  );
}

function VitalDetail({ vital }: { vital: Vital }) {
  const data = vital.series.map(p => ({
    date: p.date,
    label: `${p.date.slice(8, 10)}/${p.date.slice(5, 7)}`,
    value: p.value,
  }));
  const reference = vital.key === "sleep" ? SLEEP_TARGET_H : vital.baseline;
  const referenceLabel = vital.key === "sleep" ? "meta" : "sua média";
  const color = vital.tone === "alert" ? "#f87171" : vital.tone === "warn" ? "#fbbf24" : vital.tone === "good" ? "#34d399" : "#f97316";
  const measured = data.filter(d => d.value != null).length;

  return (
    <div className="animate-slide-up rounded-2xl border border-surface-700 bg-surface-800 p-4">
      <p className="text-sm leading-relaxed text-surface-300">{vital.note}</p>

      {measured >= 2 ? (
        <div className="mt-3 -ml-2">
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`fill-${vital.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={30}
                domain={["dataMin - 3", "dataMax + 3"]}
                tickFormatter={n => vital.key === "sleep" ? `${Math.round(Number(n))}h` : String(Math.round(Number(n)))}
              />
              <Tooltip
                cursor={{ stroke: "rgba(148,163,184,0.3)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length || payload[0].value == null) return null;
                  const p = payload[0].payload as { date: string; value: number };
                  return (
                    <div className="rounded-xl border border-surface-600 bg-surface-700 px-3 py-2 text-xs shadow-xl">
                      <p className="text-surface-400">{p.date.slice(8, 10)}/{p.date.slice(5, 7)}</p>
                      <p className="font-bold tabular-nums text-surface-100">
                        {vital.key === "sleep" ? hoursLabel(p.value) : `${Math.round(p.value)} ${vital.unit}`}
                      </p>
                    </div>
                  );
                }}
              />
              {reference != null && (
                <ReferenceLine
                  y={reference} stroke="#94a3b8" strokeDasharray="4 4" strokeOpacity={0.6}
                  label={{ value: referenceLabel, position: "insideTopRight", fill: "#94a3b8", fontSize: 10 }}
                />
              )}
              <Area
                type="monotone" dataKey="value" stroke={color} strokeWidth={2.5}
                fill={`url(#fill-${vital.key})`} connectNulls
                dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: color }}
                animationDuration={900}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-3 text-xs text-surface-500">O gráfico dos 30 dias aparece a partir da segunda noite recebida.</p>
      )}
    </div>
  );
}
