"use client";

import { useState, useMemo } from "react";
import { X, Download, FileText, TrendingUp, TrendingDown, MapPin, Clock, Mountain, Flame, Calendar, Award, Zap } from "lucide-react";
import { secondsToReadable, secondsToPaceString, formatDate } from "@/lib/utils";
import { buildMonthlyReport, availableMonths, runTypeLabel } from "@/lib/monthly-report";
import type { Run } from "@/types";

interface Props {
  runs: Run[];
  onClose: () => void;
}

export function MonthlyReportModal({ runs, onClose }: Props) {
  const months = useMemo(() => availableMonths(runs), [runs]);
  const [monthKey, setMonthKey] = useState(months[0]?.key ?? "");
  const report = useMemo(
    () => (monthKey ? buildMonthlyReport(runs, monthKey) : null),
    [runs, monthKey]
  );

  const maxWeekKm = report ? Math.max(...report.weeks.map(w => w.km), 1) : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto print:bg-white print:p-0 print:static print:block">
      <div className="bg-surface-900 w-full sm:max-w-lg sm:rounded-2xl min-h-screen sm:min-h-0 print:bg-white print:shadow-none print-report">

        {/* Toolbar — hidden on print */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 p-4 border-b border-surface-700 bg-surface-900 sm:rounded-t-2xl print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-400" />
            <h2 className="font-bold text-surface-100">Relatório mensal</h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={monthKey}
              onChange={e => setMonthKey(e.target.value)}
              className="bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-xs text-surface-200 focus:outline-none focus:border-brand-500 max-w-[140px]"
            >
              {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <button
              onClick={() => window.print()}
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />PDF
            </button>
            <button onClick={onClose} className="text-surface-500 hover:text-surface-300 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {!report || report.runCount === 0 ? (
          <div className="p-10 text-center text-surface-500">
            Sem corridas neste mês.
          </div>
        ) : (
          <div className="p-5 sm:p-6 space-y-5 print:text-black">
            {/* Report header */}
            <div className="text-center border-b border-surface-700 print:border-gray-300 pb-4">
              <p className="text-brand-500 font-black text-lg tracking-tight">LIMIAR</p>
              <h1 className="text-2xl font-black text-surface-100 print:text-black mt-1">{report.monthLabel}</h1>
              <p className="text-sm text-surface-500 mt-0.5">Resumo de treinos</p>
            </div>

            {/* Headline stats */}
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={<MapPin className="w-4 h-4" />} label="Distância total" value={`${report.totalKm} km`} accent />
              <Stat icon={<Calendar className="w-4 h-4" />} label="Corridas" value={`${report.runCount}`} sub={`${report.activeDays} dias ativos`} />
              <Stat icon={<Clock className="w-4 h-4" />} label="Tempo total" value={secondsToReadable(report.durationSeconds)} />
              <Stat icon={<Zap className="w-4 h-4" />} label="Pace médio" value={report.avgPaceSecPerKm ? `${secondsToPaceString(report.avgPaceSecPerKm)}/km` : "—"} />
            </div>

            {/* vs previous month */}
            {report.deltaPct !== null && (
              <div className="flex items-center justify-center gap-2 text-sm bg-surface-700/30 print:bg-gray-100 rounded-xl py-2.5">
                {report.deltaPct >= 0
                  ? <TrendingUp className="w-4 h-4 text-green-400" />
                  : <TrendingDown className="w-4 h-4 text-yellow-400" />}
                <span className={report.deltaPct >= 0 ? "text-green-400" : "text-yellow-400"}>
                  {report.deltaPct >= 0 ? "+" : ""}{report.deltaPct}%
                </span>
                <span className="text-surface-500">vs. mês anterior ({report.prevTotalKm} km)</span>
              </div>
            )}

            {/* Weekly volume bars */}
            <div>
              <p className="stat-label mb-2">Volume por semana</p>
              <div className="flex items-end gap-2 h-24">
                {report.weeks.map(w => (
                  <div key={w.label} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-surface-700/40 print:bg-gray-200 rounded-t-md relative flex items-end" style={{ height: "100%" }}>
                      <div
                        className="w-full bg-brand-500 rounded-t-md transition-all"
                        style={{ height: `${(w.km / maxWeekKm) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-surface-500">{w.label}</span>
                    <span className="text-[10px] font-semibold text-surface-300 print:text-black">{w.km}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Highlights */}
            <div className="grid grid-cols-2 gap-3">
              {report.longest && (
                <Stat icon={<Award className="w-4 h-4" />} label="Maior distância" value={`${report.longest.km} km`} sub={formatDate(report.longest.date)} />
              )}
              {report.bestPace && (
                <Stat icon={<Zap className="w-4 h-4" />} label="Melhor pace" value={`${secondsToPaceString(report.bestPace.paceSecPerKm)}/km`} sub={`${report.bestPace.km.toFixed(1)} km`} />
              )}
              <Stat icon={<Mountain className="w-4 h-4" />} label="Elevação" value={`${report.elevationM} m`} />
              <Stat icon={<Flame className="w-4 h-4" />} label="Calorias" value={report.calories > 0 ? report.calories.toLocaleString("pt-BR") : "—"} />
            </div>

            {/* Type breakdown */}
            {report.typeBreakdown.length > 0 && (
              <div>
                <p className="stat-label mb-2">Tipos de treino</p>
                <div className="space-y-1.5">
                  {report.typeBreakdown.map(t => (
                    <div key={t.type} className="flex items-center justify-between text-sm">
                      <span className="text-surface-300 print:text-black">{runTypeLabel(t.type)}</span>
                      <span className="text-surface-500">{t.count}× · {t.km} km</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-center text-[10px] text-surface-600 pt-2 border-t border-surface-700 print:border-gray-300">
              Gerado por Limiar Performance · {formatDate(new Date().toISOString().slice(0, 10))}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className="bg-surface-700/30 print:bg-gray-100 rounded-xl p-3">
      <div className={`flex items-center gap-1.5 mb-1 ${accent ? "text-brand-400" : "text-surface-500"}`}>
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className={`font-black tabular-nums ${accent ? "text-brand-300 print:text-black text-xl" : "text-surface-100 print:text-black text-lg"}`}>{value}</p>
      {sub && <p className="text-[11px] text-surface-500">{sub}</p>}
    </div>
  );
}
