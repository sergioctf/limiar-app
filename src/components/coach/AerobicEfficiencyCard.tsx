"use client";

import { HeartPulse, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { EfficiencyTrend } from "@/lib/aerobic-efficiency";

interface Props {
  trend: EfficiencyTrend;
}

const VERDICT_UI = {
  improving: { label: "Melhorando", color: "text-green-400",  bg: "bg-green-500/10 border-green-500/25",  icon: <TrendingUp className="w-3.5 h-3.5" /> },
  stable:    { label: "Estável",    color: "text-surface-300", bg: "bg-surface-700/40 border-surface-600", icon: <Minus className="w-3.5 h-3.5" /> },
  declining: { label: "Caindo",     color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/25", icon: <TrendingDown className="w-3.5 h-3.5" /> },
} as const;

export function AerobicEfficiencyCard({ trend }: Props) {
  if (trend.verdict === "insufficient") return null; // needs ≥4 weeks of HR data

  const ui = VERDICT_UI[trend.verdict];

  // Sparkline geometry
  const W = 280, H = 56, PAD = 4;
  const efs = trend.points.map(p => p.ef);
  const min = Math.min(...efs), max = Math.max(...efs);
  const range = max - min || 1;
  const pts = trend.points.map((p, i) => ({
    x: PAD + (i / (trend.points.length - 1)) * (W - PAD * 2),
    y: H - PAD - ((p.ef - min) / range) * (H - PAD * 2),
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${pts[pts.length - 1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`;

  const faster = (trend.paceDeltaSecPerKm ?? 0) < 0;

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Eficiência aeróbica</h2>
        </div>
        <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ui.bg} ${ui.color}`}>
          {ui.icon}{ui.label}
        </span>
      </div>

      {/* Headline insight */}
      <p className="text-sm text-surface-300 leading-relaxed mb-3">
        {trend.verdict === "improving" && trend.paceDeltaSecPerKm !== null ? (
          <>Você está <strong className="text-green-400">~{Math.abs(trend.paceDeltaSecPerKm)}s/km mais rápido</strong> na
          mesma frequência cardíaca, comparando o início e o fim das últimas {trend.weeksSpanned} semanas.</>
        ) : trend.verdict === "declining" && trend.paceDeltaSecPerKm !== null ? (
          <>Seu pace na mesma FC está <strong className="text-yellow-400">~{Math.abs(trend.paceDeltaSecPerKm)}s/km mais lento</strong> nas
          últimas {trend.weeksSpanned} semanas — pode ser fadiga acumulada, calor ou pausa no treino.</>
        ) : (
          <>Sua eficiência aeróbica se manteve <strong className="text-surface-200">estável</strong> nas últimas {trend.weeksSpanned} semanas
          — consistência é base de evolução.</>
        )}
      </p>

      {/* Sparkline */}
      <div className="bg-surface-700/30 rounded-xl p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none">
          <path d={areaD} className="fill-brand-500/10" />
          <path d={pathD} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={trend.verdict === "improving" ? "stroke-green-400" : trend.verdict === "declining" ? "stroke-yellow-400" : "stroke-brand-400"} />
          {/* last point dot */}
          <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3"
            className={trend.verdict === "improving" ? "fill-green-400" : trend.verdict === "declining" ? "fill-yellow-400" : "fill-brand-400"} />
        </svg>
        <div className="flex justify-between text-[9px] text-surface-600 mt-1">
          <span>{new Date(`${trend.points[0].weekStart}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
          <span>velocidade ÷ FC por semana (corridas leves)</span>
          <span>{new Date(`${trend.points[trend.points.length - 1].weekStart}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
        </div>
      </div>

      {trend.pctChange !== null && (
        <p className="text-[11px] text-surface-600 mt-2">
          Variação do índice: <span className={faster ? "text-green-400 font-semibold" : trend.verdict === "declining" ? "text-yellow-400 font-semibold" : "text-surface-400"}>
            {trend.pctChange > 0 ? "+" : ""}{trend.pctChange}%
          </span> · baseado em corridas com monitor de FC
        </p>
      )}
    </div>
  );
}
