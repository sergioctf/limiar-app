"use client";

import { Flag } from "lucide-react";
import { timeToString } from "@/lib/performance";
import { formatDate } from "@/lib/utils";
import type { RacePrediction } from "@/lib/performance";

interface Props {
  predictions: RacePrediction[];
  testDate: string;
}

// Map distance to a medal/ribbon icon colour class
const distanceColors: Record<string, string> = {
  "5 km":     "text-green-400",
  "10 km":    "text-teal-400",
  "Meia":     "text-brand-400",
  "Maratona": "text-red-400",
};

export function PredictionsCard({ predictions, testDate }: Props) {
  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Flag className="w-4 h-4 text-brand-400" />
        <h3 className="font-bold text-surface-100">Previsões de Corrida</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {predictions.map((pred) => {
          const colorClass = distanceColors[pred.distance_label] ?? "text-surface-400";
          return (
            <div
              key={pred.distance_label}
              className="bg-surface-700/40 rounded-xl p-3 text-center space-y-1"
            >
              <p className={`text-xs font-bold uppercase tracking-wide ${colorClass}`}>
                {pred.distance_label}
              </p>
              <p className="text-xl font-mono font-bold text-surface-100">
                {timeToString(pred.predicted_seconds)}
              </p>
              <p className="text-xs text-surface-500 leading-tight">
                {Math.floor(pred.predicted_seconds / pred.distance_km / 60)}:
                {String(Math.round((pred.predicted_seconds / pred.distance_km) % 60)).padStart(2, "0")}
                /km
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-surface-600 pt-1">
        Baseado no teste de {formatDate(testDate)} · Fórmula Riegel (fator 1.06).
      </p>
    </div>
  );
}
